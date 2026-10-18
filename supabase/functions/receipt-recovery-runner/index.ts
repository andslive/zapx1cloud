// TEMPORÁRIA — executor do incidente OpenAI 2026-10-18. REMOVER ao concluir:
//   supabase functions delete receipt-recovery-runner --project-ref ydunpoqdhijhnrarohiz
//
// Existe só porque o SUPABASE_SERVICE_ROLE_KEY visto pelo runtime do
// uazapi-webhook não é o mesmo valor acessível por fora (Vault/Management API),
// então `execute_recovery` (que exige igualdade exata) não pode ser chamado de fora.
//
// Segurança:
//  - verify_jwt=true (default): o gateway valida a assinatura do JWT.
//  - Além disso exige claim role === 'service_role' (um anon/authenticated válido é rejeitado).
//  - Só aceita recoveryId de linhas de receipt_recovery_requests com o incident_tag
//    deste incidente e status 'pending' (ou o UUID nulo, para probe sem efeitos).
//  - Destino fixo: SUPABASE_URL/functions/v1/uazapi-webhook, action fixa execute_recovery.
//  - Expira sozinha em EXPIRES_AT. Nunca retorna segredos nem corpo bruto longo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INCIDENT_TAG = "openai_credit_incident_20261018";
const EXPIRES_AT = Date.parse("2026-10-21T00:00:00Z");
const NIL = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function roleOf(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof p.role === "string" ? p.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (Date.now() > EXPIRES_AT) return json(410, { ok: false, error: "expired" });
  if (roleOf(req.headers.get("Authorization") || "") !== "service_role") {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const body = await req.json().catch(() => ({}));
  const recoveryId = String(body?.recoveryId || "");
  if (!UUID_RE.test(recoveryId)) return json(400, { ok: false, error: "invalid_recovery_id" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (recoveryId !== NIL) {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("receipt_recovery_requests")
      .select("id, status, incident_tag")
      .eq("id", recoveryId)
      .maybeSingle();
    if (!data || data.incident_tag !== INCIDENT_TAG) {
      return json(403, { ok: false, error: "not_an_incident_request" });
    }
    if (data.status !== "pending") {
      return json(200, { ok: true, skipped: `status_${data.status}` });
    }
  }

  const r = await fetch(`${url}/functions/v1/uazapi-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action: "execute_recovery", recoveryId }),
  });
  const text = await r.text();
  return json(200, { ok: true, webhook_status: r.status, webhook_body: text.slice(0, 300) });
});
