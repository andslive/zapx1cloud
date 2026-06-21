// supabase/functions/_shared/platform-email-send.ts
// Helper para enviar emails da plataforma usando Lovable Emails (transactional queue).
// Carrega o template do banco (`platform_email_templates`), substitui variáveis {{var}}
// e enfileira via send-transactional-email com o template "platform-generic".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface SendPlatformEmailArgs {
  slug: string;
  to: string;
  variables?: Record<string, string | number | undefined | null>;
  idempotencyKey?: string;
}

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export async function sendPlatformEmail(args: SendPlatformEmailArgs): Promise<{ ok: boolean; error?: string }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: tpl, error: tplErr } = await supabase
    .from("platform_email_templates")
    .select("subject, html_content, variables, is_active")
    .eq("slug", args.slug)
    .maybeSingle();

  if (tplErr || !tpl) {
    return { ok: false, error: `Template '${args.slug}' não encontrado` };
  }
  if (!tpl.is_active) {
    return { ok: false, error: `Template '${args.slug}' está desativado` };
  }

  const vars = args.variables ?? {};
  const subject = renderTemplate(tpl.subject, vars);
  const html = renderTemplate(tpl.html_content, vars);

  const idempotencyKey = args.idempotencyKey ?? `${args.slug}-${args.to}-${Date.now()}`;

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({
      templateName: "platform-generic",
      recipientEmail: args.to,
      idempotencyKey,
      templateData: {
        __subject: subject,
        __html: html,
        __preview: subject,
      },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Failed to enqueue platform email", { slug: args.slug, status: resp.status, txt });
    return { ok: false, error: `Falha ao enfileirar email (${resp.status})` };
  }

  return { ok: true };
}
