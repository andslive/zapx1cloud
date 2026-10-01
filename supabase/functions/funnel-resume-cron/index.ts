// Retomada de funis cujo "Aguarda resposta" venceu (timeout).
//
// Seleção, elegibilidade, tentativas e modo de ativação vivem em
// _shared/funnel-resume.ts (puro, testado com relógio controlado). Este arquivo
// só liga essa lógica ao banco e ao webhook.
//
// MODO SEGURO POR PADRÃO: sem FUNNEL_RESUME_MODE/FUNNEL_RESUME_ALLOWLIST este cron
// não processa nada. Ver docs no topo de _shared/funnel-resume.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type CycleDeps,
  type PageArgs,
  parseResumeConfig,
  type ResumeCandidate,
  runResumeCycle,
} from "../_shared/funnel-resume.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COLUMNS =
  "id, organization_id, connection_id, evolution_instance_id, bot_locked_until, current_flow_id, current_block_id, flow_variables, metadata, updated_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const cfg = parseResumeConfig((k) => Deno.env.get(k));

    const deps: CycleDeps = {
      now: () => Date.now(),
      fetchPage: async ({ after, limit, minLock, ids }: PageArgs): Promise<ResumeCandidate[]> => {
        let q = supabase
          .from("webchat_conversations")
          .select(COLUMNS)
          .eq("status", "bot_active")
          .lte("bot_locked_until", new Date().toISOString())
          .not("current_block_id", "is", null)
          .order("bot_locked_until", { ascending: true })
          .order("id", { ascending: true })
          .limit(limit);
        if (ids) q = q.in("id", ids);
        if (minLock) q = q.gte("bot_locked_until", minLock);
        if (after) q = q.or(`bot_locked_until.gt.${after.lock},and(bot_locked_until.eq.${after.lock},id.gt.${after.id})`);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ResumeCandidate[];
      },
      callResume: async (c, expected) => {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/uazapi-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
              "apikey": serviceKey,
            },
            body: JSON.stringify({ action: "resume_funnel", conversationId: c.id, expected_wait: expected }),
          });
          const body = await response.json().catch(() => null);
          return { status: response.status, body };
        } catch (_e) {
          return { status: null, body: null };
        }
      },
      readLatest: async (id) => {
        const { data } = await supabase.from("webchat_conversations").select("metadata, updated_at").eq("id", id).maybeSingle();
        return data ? { metadata: data.metadata ?? null, updated_at: data.updated_at ?? null } : null;
      },
      writeState: async (id, metadata, expectedUpdatedAt) => {
        const { data, error } = await supabase
          .from("webchat_conversations")
          .update({ metadata })
          .eq("id", id)
          .eq("updated_at", expectedUpdatedAt)
          .select("id");
        return !error && Array.isArray(data) && data.length > 0;
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      // diagnóstico estruturado, sem dados pessoais (só ids de conversa e motivos)
      log: (msg, extra) => console.warn(`[funnel-resume-cron] ${msg}`, JSON.stringify(extra ?? {})),
    };

    const s = await runResumeCycle(deps, cfg);
    console.log("[funnel-resume-cron] ciclo", JSON.stringify({ mode: s.mode, scanned: s.scanned, eligible: s.eligible, selected: s.selected, outcomes: s.outcomes, skipped: s.skipped, note: s.note }));

    const attempted = s.outcomes.advanced + s.outcomes.released + s.outcomes.busy + s.outcomes.failed;
    return new Response(
      JSON.stringify({
        // chaves antigas mantidas para quem monitora a resposta do cron
        processed: attempted,
        selected: s.selected,
        backlog_window: s.scanned,
        // novas
        mode: s.mode,
        dry_run: s.dry_run,
        scan_truncated: s.scan_truncated,
        eligible: s.eligible,
        outcomes: s.outcomes,
        skipped: s.skipped,
        failures: s.failures.slice(0, 20),
        selected_ids: s.selected_ids,
        note: s.note,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[funnel-resume-cron] global error:", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
