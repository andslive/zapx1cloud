// Receptor de webhooks dos gateways. URL: /functions/v1/payments-webhook/<provider>/<token>
// verify_jwt=false: o provedor não envia JWT do Supabase; a autenticidade vem do segredo/assinatura.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { interpretColocaEvent, isColocaPing, verifyColocaDelivery } from "../_shared/payment-gateways/colocapay.ts";
import { interpretLeonaEvent, verifyLeonaDelivery } from "../_shared/payment-gateways/leonapay.ts";
import { resumeLinkedExecution } from "../_shared/payment-gateways/resume.ts";
import { settleChargeState } from "../_shared/payment-gateways/settle.ts";
import { isProvider } from "../_shared/payment-gateways/catalog.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("payments-webhook");
  const provider = parts[i + 1];
  const token = parts[i + 2];
  if (!isProvider(provider) || !token || !/^[a-f0-9]{32}$/.test(token)) return json({ error: "not_found" }, 404);

  const sb: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: account } = await sb.from("payment_gateway_accounts")
    .select("id, organization_id, provider, environment, enabled")
    .eq("provider", provider).eq("webhook_token", token).maybeSingle();
  if (!account) return json({ error: "not_found" }, 404);

  // Corpo BRUTO antes de qualquer parse (a assinatura cobre os bytes exatos).
  const raw = await req.text();
  const { data: secret, error: secErr } = await sb.rpc("get_payment_gateway_secret", {
    p_account_id: account.id, p_organization_id: account.organization_id, p_secret_kind: "webhook_secret",
  });
  if (secErr || typeof secret !== "string") return json({ error: "webhook_secret_not_configured" }, 503);

  const auth = provider === "colocapay"
    ? await verifyColocaDelivery({ secretHeader: req.headers.get("x-secret"), signatureHeader: req.headers.get("x-coloca-signature"), rawBody: raw, secret })
    : await verifyLeonaDelivery({
      timestamp: req.headers.get("x-leonapay-timestamp"), eventId: req.headers.get("x-leonapay-event-id"),
      signature: req.headers.get("x-leonapay-signature"), rawBody: raw, secret,
    });
  if (!auth.ok) {
    console.warn("[payments-webhook] rejected", provider, auth.reason); // nunca loga segredo/corpo
    return json({ error: "unauthorized" }, 401);
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  // Handshake test/ping da ColocaPay: devolve o valor do x-secret recebido (já verificado igual ao cadastrado).
  if (provider === "colocapay" && isColocaPing(body)) return json({ secret: req.headers.get("x-secret") });

  const deps = { supabase: sb, resume: (c: any, why: "paid" | "instructions") => resumeLinkedExecution(sb, c, why).then(() => {}) };
  try {
    if (provider === "colocapay") {
      const ev = interpretColocaEvent(body);
      if (ev.kind === "ignored") return json({ ok: true, ignored: true });
      const r = await settleChargeState(deps, {
        account, eventId: String(body.id), eventType: `${body.type}.${body.event}`, payload: body,
        state: ev.state, lookup: { reference: ev.concept }, source: "webhook",
      });
      return json({ ok: true, outcome: r.outcome });
    }
    const ev = interpretLeonaEvent(body);
    if (ev.kind === "ignored") return json({ ok: true, ignored: true });
    const r = await settleChargeState(deps, {
      account, eventId: req.headers.get("x-leonapay-event-id") ?? String(body.id), eventType: String(body.event ?? body.type),
      payload: body, state: ev.state, lookup: { reference: ev.reference }, source: "webhook",
    });
    return json({ ok: true, outcome: r.outcome });
  } catch (_e) {
    // Evento já persistido sem processed_at: o provedor reenvia e o reprocessamento é seguro.
    return json({ error: "processing_failed" }, 500);
  }
});
