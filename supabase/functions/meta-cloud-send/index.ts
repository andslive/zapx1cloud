// FASE 2A — Edge Function de envio via Meta Cloud API. Equivalente
// funcional de `uazapi-send/index.ts`, mas para o segundo provider.
//
// FASE 2B.0.EVOHUB-2 — a lógica de despacho foi extraída para
// `_shared/meta-cloud-dispatch.ts` (`dispatchMetaCloudSend`), reutilizada
// também pelo gate de roteamento multi-provider dentro de
// `uazapi-send/index.ts` (o chokepoint real por onde passam praticamente
// todos os envios do CRM). Este arquivo agora é só o wrapper HTTP —
// endpoint dedicado para quem quiser chamar Meta Cloud diretamente, sem
// duplicar nenhuma regra de flag/modo/isolamento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchMetaCloudSend, type MetaCloudSendType } from "../_shared/meta-cloud-dispatch.ts";
import type { SupabaseLike } from "../_shared/whatsapp-provider/resolve.ts";

interface MetaSendRequestBody {
  organization_id: string;
  connection_id: string;
  to: string;
  type: MetaCloudSendType;
  payload: Record<string, unknown>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export interface HandleSendRequestDeps {
  supabase: (SupabaseLike & { rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> }) | null;
  env?: { get(key: string): string | undefined };
}

export async function handleSendRequest(req: Request, deps: HandleSendRequestDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: MetaSendRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error_code: "INVALID_JSON", message: "Corpo inválido" }, 400);
  }

  const { organization_id, connection_id, to, type, payload } = body ?? ({} as MetaSendRequestBody);
  if (!organization_id || !connection_id || !to || !type) {
    return jsonResponse(
      { success: false, error_code: "MISSING_FIELDS", message: "organization_id, connection_id, to e type são obrigatórios" },
      400,
    );
  }

  if (!deps.supabase) {
    return jsonResponse({ success: false, error_code: "MISCONFIGURED", message: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes" }, 500);
  }

  const result = await dispatchMetaCloudSend(
    { organizationId: organization_id, connectionId: connection_id, to, type, payload },
    { supabase: deps.supabase, env: deps.env },
  );

  return jsonResponse(result.body, result.status);
}

// ── Entry point real (não usado pelos testes, que chamam handleSendRequest
// diretamente) — `import.meta.main` evita que `Deno.serve` tente abrir uma
// porta de rede quando este arquivo é apenas IMPORTADO pelos testes.

if (import.meta.main) {
  Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && serviceKey ? (createClient(supabaseUrl, serviceKey) as any) : null;
    return handleSendRequest(req, { supabase });
  });
}
