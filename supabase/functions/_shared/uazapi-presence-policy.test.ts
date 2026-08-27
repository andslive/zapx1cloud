// deno test --allow-import uazapi-presence-policy.test.ts
//
// Cobre a política de presence (available/unavailable) por organização
// reforçada pelo uazapi-heartbeat. Nenhum teste aqui chama rede real, envia
// presence real, aplica migration ou muda dado em produção.

import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decidePresenceReconciliation,
  loadEnabledPresencePolicies,
  reconcileInstancePresence,
  type PresenceReconcileInput,
} from "./uazapi-presence-policy.ts";

const ORG = "org-a";

function baseInput(overrides: Partial<PresenceReconcileInput> = {}): PresenceReconcileInput {
  const desiredPresenceByOrg = new Map([[ORG, "available" as const]]);
  return {
    provider: "uazapi",
    archivedAt: null,
    organizationId: ORG,
    hasToken: true,
    desiredPresenceByOrg,
    sessionConnected: true,
    loggedIn: true,
    currentPresence: "unavailable",
    ...overrides,
  };
}

// --- 1/2: política ausente/desabilitada -> nenhum POST ---

Deno.test("1: política ausente para a organização -> skip policy_not_enabled", () => {
  const r = decidePresenceReconciliation(baseInput({ desiredPresenceByOrg: new Map() }));
  assertEquals(r, { action: "skip", reason: "policy_not_enabled" });
});

Deno.test("2: política existe para OUTRA organização -> skip policy_not_enabled (não vaza entre orgs)", () => {
  const r = decidePresenceReconciliation(
    baseInput({ desiredPresenceByOrg: new Map([["org-b", "available"]]) }),
  );
  assertEquals(r, { action: "skip", reason: "policy_not_enabled" });
});

// --- 3/4: desired=available ---

Deno.test("3: desired=available + connected/loggedIn + unavailable -> post available", () => {
  const r = decidePresenceReconciliation(baseInput({ currentPresence: "unavailable" }));
  assertEquals(r, { action: "post", desiredPresence: "available" });
});

Deno.test("4: desired=available + já available -> skip already_desired (zero POST)", () => {
  const r = decidePresenceReconciliation(baseInput({ currentPresence: "available" }));
  assertEquals(r, { action: "skip", reason: "already_desired" });
});

// --- 5: desired=unavailable ---

Deno.test("5: desired=unavailable + available -> post unavailable", () => {
  const r = decidePresenceReconciliation(
    baseInput({
      desiredPresenceByOrg: new Map([[ORG, "unavailable"]]),
      currentPresence: "available",
    }),
  );
  assertEquals(r, { action: "post", desiredPresence: "unavailable" });
});

// --- 6/7: disconnected / loggedIn=false ---

Deno.test("6: sessionConnected=false -> skip not_connected, zero POST", () => {
  const r = decidePresenceReconciliation(baseInput({ sessionConnected: false }));
  assertEquals(r, { action: "skip", reason: "not_connected" });
});

Deno.test("6b: sessionConnected=null/undefined (desconhecido) -> skip not_connected", () => {
  const r = decidePresenceReconciliation(baseInput({ sessionConnected: null }));
  assertEquals(r, { action: "skip", reason: "not_connected" });
});

Deno.test("7: loggedIn=false -> skip not_logged_in, zero POST", () => {
  const r = decidePresenceReconciliation(baseInput({ loggedIn: false }));
  assertEquals(r, { action: "skip", reason: "not_logged_in" });
});

// --- 8: current_presence ausente/desconhecido ---

Deno.test("8: current_presence ausente (undefined) -> skip current_presence_unknown, NUNCA presume unavailable", () => {
  const r = decidePresenceReconciliation(baseInput({ currentPresence: undefined }));
  assertEquals(r, { action: "skip", reason: "current_presence_unknown" });
});

Deno.test("8b: current_presence com valor inesperado (ex.: 'unknown') -> skip current_presence_unknown", () => {
  const r = decidePresenceReconciliation(baseInput({ currentPresence: "unknown" }));
  assertEquals(r, { action: "skip", reason: "current_presence_unknown" });
});

// --- 9: token ausente ---

Deno.test("9: hasToken=false -> skip no_token, zero POST", () => {
  const r = decidePresenceReconciliation(baseInput({ hasToken: false }));
  assertEquals(r, { action: "skip", reason: "no_token" });
});

// --- 12: duas organizações com políticas diferentes ---

Deno.test("12: duas organizações com políticas diferentes -> cada uma decide pelo seu próprio desired_presence", () => {
  const desiredPresenceByOrg = new Map([
    ["org-a", "available" as const],
    ["org-b", "unavailable" as const],
  ]);
  const rA = decidePresenceReconciliation(
    baseInput({ organizationId: "org-a", desiredPresenceByOrg, currentPresence: "unavailable" }),
  );
  const rB = decidePresenceReconciliation(
    baseInput({ organizationId: "org-b", desiredPresenceByOrg, currentPresence: "available" }),
  );
  assertEquals(rA, { action: "post", desiredPresence: "available" });
  assertEquals(rB, { action: "post", desiredPresence: "unavailable" });
});

// --- 13: outro provider (Meta/HookCloud) ---

Deno.test("13: provider != 'uazapi' -> skip not_uazapi_provider, mesmo com política habilitada", () => {
  const r = decidePresenceReconciliation(baseInput({ provider: "meta_cloud" }));
  assertEquals(r, { action: "skip", reason: "not_uazapi_provider" });
});

Deno.test("13b: provider ausente/null -> skip not_uazapi_provider", () => {
  const r = decidePresenceReconciliation(baseInput({ provider: null }));
  assertEquals(r, { action: "skip", reason: "not_uazapi_provider" });
});

// --- 14: instância arquivada ---

Deno.test("14: archivedAt preenchido -> skip archived, mesmo conectada e com política", () => {
  const r = decidePresenceReconciliation(baseInput({ archivedAt: "2026-08-25T00:00:00Z" }));
  assertEquals(r, { action: "skip", reason: "archived" });
});

// --- organização ausente ---

Deno.test("organizationId ausente -> skip no_organization", () => {
  const r = decidePresenceReconciliation(baseInput({ organizationId: null }));
  assertEquals(r, { action: "skip", reason: "no_organization" });
});

// --- 16: 100 instâncias já conformes -> zero POST extra ---

Deno.test("16: 100 instâncias já no valor desejado -> zero decisão de post entre todas", () => {
  let postCount = 0;
  for (let i = 0; i < 100; i++) {
    const r = decidePresenceReconciliation(baseInput({ currentPresence: "available" }));
    if (r.action === "post") postCount++;
  }
  assertEquals(postCount, 0);
});

// --- 17: múltiplas divergentes -> só as divergentes recebem POST ---

Deno.test("17: 5 instâncias, só as divergentes recebem decisão de post", () => {
  const states = ["unavailable", "available", "unavailable", "available", "unavailable"];
  const decisions = states.map((s) => decidePresenceReconciliation(baseInput({ currentPresence: s })));
  const postCount = decisions.filter((d) => d.action === "post").length;
  assertEquals(postCount, 3); // as 3 'unavailable' (desired=available)
});

// ---------------------------------------------------------------------
// loadEnabledPresencePolicies — I/O real (mock), sempre fail-safe
// ---------------------------------------------------------------------

function fakeSupabase(rows: any[] | null, opts: { error?: boolean; throwOnFrom?: boolean } = {}) {
  return {
    from(table: string) {
      if (opts.throwOnFrom) throw new Error("simulated table missing");
      if (table !== "uazapi_presence_policies") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_c: string) {
          return {
            eq(_col: string, _val: any) {
              if (opts.error) return Promise.resolve({ data: null, error: { message: "db_error" } });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

Deno.test("loadEnabledPresencePolicies: carrega só linhas com enabled=true (filtro já na query), retorna Map por organização", async () => {
  const client = fakeSupabase([
    { organization_id: "org-a", desired_presence: "available" },
    { organization_id: "org-b", desired_presence: "unavailable" },
  ]);
  const map = await loadEnabledPresencePolicies(client as any);
  assertEquals(map.get("org-a"), "available");
  assertEquals(map.get("org-b"), "unavailable");
  assertEquals(map.size, 2);
});

Deno.test("loadEnabledPresencePolicies: erro de consulta -> Map vazio, nunca lança (fail-safe = não gerenciado)", async () => {
  const client = fakeSupabase(null, { error: true });
  const map = await loadEnabledPresencePolicies(client as any);
  assertEquals(map.size, 0);
});

Deno.test("loadEnabledPresencePolicies: tabela ausente (exceção) -> Map vazio, nunca lança", async () => {
  const client = fakeSupabase(null, { throwOnFrom: true });
  const map = await loadEnabledPresencePolicies(client as any);
  assertEquals(map.size, 0);
});

Deno.test("loadEnabledPresencePolicies: linha com desired_presence inválido é ignorada silenciosamente", async () => {
  const client = fakeSupabase([{ organization_id: "org-a", desired_presence: "garbage" }]);
  const map = await loadEnabledPresencePolicies(client as any);
  assertEquals(map.size, 0);
});

// ---------------------------------------------------------------------
// reconcileInstancePresence — 10: 401 isolado; 11: 500/timeout não afeta
// outras instâncias, nunca lança
// ---------------------------------------------------------------------

function installFetchMock(responder: (url: string, init: any) => { ok: boolean; status: number } | Promise<never>) {
  const original = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    const r = await responder(url, init);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => ({}),
    } as any;
  };
  return () => { (globalThis as any).fetch = original; };
}

Deno.test("10: POST retorna 401 -> reconcileInstancePresence NÃO lança, retorna ok=false isolado", async () => {
  const restore = installFetchMock(() => ({ ok: false, status: 401 }));
  try {
    const result = await reconcileInstancePresence("https://crmx1.uazapi.com", "fake-token", "available", { id: "i1", name: "inst1" });
    assertEquals(result.ok, false);
    assertEquals(result.httpStatus, 401);
  } finally {
    restore();
  }
});

Deno.test("11: POST timeout/exceção de rede -> não lança, retorna ok=false com mensagem de erro", async () => {
  const original = globalThis.fetch;
  (globalThis as any).fetch = async () => { throw new Error("timeout simulado"); };
  try {
    const result = await reconcileInstancePresence("https://crmx1.uazapi.com", "fake-token", "available", { id: "i1", name: "inst1" });
    assertEquals(result.ok, false);
    assertMatch(result.error || "", /timeout simulado/);
  } finally {
    (globalThis as any).fetch = original;
  }
});

Deno.test("reconcileInstancePresence: sucesso -> ok=true, http 200", async () => {
  const restore = installFetchMock(() => ({ ok: true, status: 200 }));
  try {
    const result = await reconcileInstancePresence("https://crmx1.uazapi.com", "fake-token", "available", { id: "i1", name: "inst1" });
    assertEquals(result.ok, true);
    assertEquals(result.httpStatus, 200);
  } finally {
    restore();
  }
});

// --- 18: nenhum token aparece nos logs/testes ---

Deno.test("18: nenhum teste deste arquivo usa token real; os únicos tokens usados são literais de teste ('fake-token')", async () => {
  const src = await Deno.readTextFile(new URL("./uazapi-presence-policy.test.ts", import.meta.url));
  // Garante que não há string longa parecida com token real (heurística:
  // nenhuma sequência alfanumérica de 30+ caracteres fora de comentários).
  const suspicious = src.match(/[A-Za-z0-9]{30,}/g) || [];
  assertEquals(suspicious.length, 0);
});

Deno.test("Módulo: reconcileInstancePresence nunca inclui o token no corpo dos logs (só instance_id/name/desired/result)", async () => {
  const src = await Deno.readTextFile(new URL("./uazapi-presence-policy.ts", import.meta.url));
  // As duas chamadas de console.log/error dentro de reconcileInstancePresence
  // só devem referenciar instanceLabel/desiredPresence/result, nunca a
  // variável `instanceToken`.
  const fnStart = src.indexOf("export async function reconcileInstancePresence");
  const fnBody = src.slice(fnStart);
  const logCalls = fnBody.match(/console\.(log|error)\([^)]*\)[^;]*;/gs) || [];
  for (const call of logCalls) {
    assertEquals(call.includes("instanceToken"), false);
  }
});

// --- 15: reconexão que resetou presence -> corrigida no ciclo seguinte ---

Deno.test("15: presence resetada por reconexão (available -> unavailable) é detectada e corrigida no ciclo seguinte", () => {
  // Ciclo 1: já no valor certo, nenhum POST.
  const cycle1 = decidePresenceReconciliation(baseInput({ currentPresence: "available" }));
  assertEquals(cycle1.action, "skip");

  // UazAPI reconecta a sessão "por fora" e reseta presence — o heartbeat
  // simplesmente lê de novo no próximo ciclo (nenhum estado interno
  // preso do ciclo anterior, a função é pura/sem memória).
  const cycle2 = decidePresenceReconciliation(baseInput({ currentPresence: "unavailable" }));
  assertEquals(cycle2, { action: "post", desiredPresence: "available" });
});
