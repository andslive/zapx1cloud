// Reconciliação por consulta autenticada (cron/serviço): confirma cobranças pendentes quando o
// webhook atrasa ou falha. Autenticação: somente service_role (verify_jwt + checagem do token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reconcileCharge } from "../_shared/payment-gateways/reconcile.ts";
import { resumeLinkedExecution } from "../_shared/payment-gateways/resume.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${key}`) return json({ error: "unauthorized" }, 401);
  const sb: any = createClient(url, key);
  const deps = { supabase: sb, fetch, resume: (c: any, why: "paid" | "instructions") => resumeLinkedExecution(sb, c, why).then(() => {}) };
  const body = await req.json().catch(() => ({}));
  // Janela curta e limite fixo: nunca varre o histórico.
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: rows } = body.chargeId
    ? { data: [{ id: body.chargeId }] }
    : await sb.from("payment_charges").select("id").in("status", ["awaiting_instructions", "pending"]).gte("created_at", since).limit(50);
  const out: Record<string, number> = {};
  for (const r of rows ?? []) {
    const res = await reconcileCharge(deps, r.id);
    out[res.outcome] = (out[res.outcome] ?? 0) + 1;
  }
  return json({ ok: true, processed: rows?.length ?? 0, outcomes: out });
});
