// Reconciliação de presence (available/unavailable) de conta UazAPI por
// organização, reforçada pelo uazapi-heartbeat a cada ciclo (1 min).
//
// Decisão de produto (2026-08-27): modo explícito por organização, nunca
// booleano ambíguo. Ausência de política OU `enabled=false` = não
// gerenciado — o heartbeat nunca toca em presence para essa organização.
// Persistência: tabela dedicada `uazapi_presence_policies` (migration
// 20260827180000, ainda não aplicada em produção), mesmo padrão de
// `meta_cloud_feature_flags`/`conversation_isolation_feature_flags`.
//
// Duas responsabilidades deliberadamente separadas neste arquivo:
//   1) `decidePresenceReconciliation` — função PURA, sem I/O, testável
//      isoladamente com qualquer mock trivial: só olha os dados já
//      disponíveis no ciclo do heartbeat (nenhuma consulta nova).
//   2) `loadEnabledPresencePolicies`/`reconcileInstancePresence` — I/O
//      real (Supabase, fetch), sempre fail-open (nunca lança, nunca
//      desconecta, nunca bloqueia o heartbeat), nunca loga token.

import type { SupabaseLike } from "./whatsapp-provider/resolve.ts";

export type DesiredPresence = "available" | "unavailable";

export interface PresenceReconcileInput {
  provider: string | null | undefined;
  archivedAt: string | null | undefined;
  organizationId: string | null | undefined;
  hasToken: boolean;
  desiredPresenceByOrg: Map<string, DesiredPresence>;
  // GET /instance/status já executado pelo próprio heartbeat — nada de
  // consulta nova. `sessionConnected`/`loggedIn` vêm de `status.connected`/
  // `status.loggedIn`; `currentPresence` vem de `instance.current_presence`.
  sessionConnected: boolean | null | undefined;
  loggedIn: boolean | null | undefined;
  currentPresence: string | null | undefined;
}

export type PresenceReconcileDecision =
  | { action: "skip"; reason: PresenceSkipReason }
  | { action: "post"; desiredPresence: DesiredPresence };

export type PresenceSkipReason =
  | "not_uazapi_provider"
  | "archived"
  | "no_organization"
  | "no_token"
  | "policy_not_enabled"
  | "not_connected"
  | "not_logged_in"
  | "current_presence_unknown"
  | "already_desired";

/**
 * Função pura: decide se (e o quê) deve ser reforçado via POST
 * /instance/presence. Nunca faz I/O. Cobre, na ordem exata dos guards
 * pedidos na revisão: provider, arquivamento, organização, token,
 * política habilitada, conectado, logado, current_presence conhecido,
 * e por fim divergência real (nunca reenvia se já está no valor certo).
 */
export function decidePresenceReconciliation(
  input: PresenceReconcileInput,
): PresenceReconcileDecision {
  if (input.provider !== "uazapi") {
    return { action: "skip", reason: "not_uazapi_provider" };
  }
  if (input.archivedAt) {
    return { action: "skip", reason: "archived" };
  }
  if (!input.organizationId) {
    return { action: "skip", reason: "no_organization" };
  }
  if (!input.hasToken) {
    return { action: "skip", reason: "no_token" };
  }

  const desired = input.desiredPresenceByOrg.get(input.organizationId);
  if (!desired) {
    return { action: "skip", reason: "policy_not_enabled" };
  }

  if (input.sessionConnected !== true) {
    return { action: "skip", reason: "not_connected" };
  }
  if (input.loggedIn !== true) {
    return { action: "skip", reason: "not_logged_in" };
  }

  // current_presence ausente/desconhecido: NUNCA presumir unavailable,
  // nunca disparar POST — achado explícito da auditoria anterior.
  if (input.currentPresence !== "available" && input.currentPresence !== "unavailable") {
    return { action: "skip", reason: "current_presence_unknown" };
  }

  if (input.currentPresence === desired) {
    return { action: "skip", reason: "already_desired" };
  }

  return { action: "post", desiredPresence: desired };
}

/**
 * Carrega, em UMA única consulta por execução do heartbeat, todas as
 * políticas habilitadas (independente de quantas instâncias existam) —
 * evita SELECT individual por instância, como pedido.
 */
export async function loadEnabledPresencePolicies(
  supabase: SupabaseLike,
): Promise<Map<string, DesiredPresence>> {
  const result = new Map<string, DesiredPresence>();
  try {
    const { data, error } = await (supabase as any)
      .from("uazapi_presence_policies")
      .select("organization_id, desired_presence")
      .eq("enabled", true);

    if (error || !data) return result;

    for (const row of data) {
      if (row?.organization_id && (row.desired_presence === "available" || row.desired_presence === "unavailable")) {
        result.set(row.organization_id, row.desired_presence);
      }
    }
    return result;
  } catch {
    // Tabela ausente, RLS bloqueando, erro de rede — mapa vazio, nunca
    // lança. Chamador trata mapa vazio como "nenhuma organização gerenciada".
    return result;
  }
}

/**
 * Executa o POST /instance/presence real. Fail-open por desenho: nunca
 * lança, nunca retorna algo que o chamador possa interpretar como "deve
 * desconectar a instância" — só reporta sucesso/falha para log estruturado
 * sem token.
 */
export async function reconcileInstancePresence(
  uazapiUrl: string,
  instanceToken: string,
  desiredPresence: DesiredPresence,
  instanceLabel: { id: string; name: string },
): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  try {
    const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/instance/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": instanceToken },
      body: JSON.stringify({ presence: desiredPresence }),
    });

    if (res.ok) {
      console.log(
        "[UAZAPI_PRESENCE_RECONCILE]",
        JSON.stringify({ instance_id: instanceLabel.id, name: instanceLabel.name, desired: desiredPresence, result: "ok", http_status: res.status }),
      );
      return { ok: true, httpStatus: res.status };
    }

    console.error(
      "[UAZAPI_PRESENCE_RECONCILE]",
      JSON.stringify({ instance_id: instanceLabel.id, name: instanceLabel.name, desired: desiredPresence, result: "http_error", http_status: res.status }),
    );
    return { ok: false, httpStatus: res.status };
  } catch (err: any) {
    // Timeout/erro de rede: nunca lança para o chamador, nunca desconecta
    // a instância, nunca bloqueia o restante do heartbeat.
    console.error(
      "[UAZAPI_PRESENCE_RECONCILE]",
      JSON.stringify({ instance_id: instanceLabel.id, name: instanceLabel.name, desired: desiredPresence, result: "exception", message: err?.message || String(err) }),
    );
    return { ok: false, error: err?.message || String(err) };
  }
}
