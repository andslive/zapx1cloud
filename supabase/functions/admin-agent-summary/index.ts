// Cron: roda toda hora cheia. Envia resumo diário e relatório semanal.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getServiceSupabase,
  sendAdminMessage,
  alreadySent,
} from "../_shared/admin-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Cfg {
  organization_id: string;
  admin_whatsapp_number: string | null;
  admin_user_id: string | null;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
  weekly_report_enabled: boolean;
  weekly_report_dow: number;
  weekly_report_hour: number;
}

async function buildDailySummary(orgId: string): Promise<string> {
  const supabase = getServiceSupabase();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const startISO = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
  const endISO = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();

  const [leadsRes, dealsRes, convsRes, eventsRes, profileRes] = await Promise.all([
    supabase.from("leads").select("id, lead_score", { count: "exact" })
      .eq("organization_id", orgId).gte("created_at", startISO).lte("created_at", endISO),
    supabase.from("deals").select("deal_value")
      .eq("organization_id", orgId).eq("status", "won")
      .gte("closed_at", startISO).lte("closed_at", endISO),
    supabase.from("webchat_conversations").select("id", { count: "exact" })
      .eq("organization_id", orgId).neq("status", "closed"),
    supabase.from("calendar_events").select("id", { count: "exact" })
      .eq("organization_id", orgId).gte("start_time", startISO).lte("start_time", endISO),
    supabase.from("auto_notification_settings").select("admin_user_id").eq("organization_id", orgId).maybeSingle(),
  ]);

  const totalLeads = leadsRes.count ?? 0;
  const hotLeads = (leadsRes.data ?? []).filter((l: any) => (l.lead_score ?? 0) >= 70).length;
  const closedRevenue = (dealsRes.data ?? []).reduce((s: number, d: any) => s + Number(d.deal_value ?? 0), 0);
  const activeChats = convsRes.count ?? 0;
  const meetings = eventsRes.count ?? 0;

  // Pipeline aberto (todos os deals em aberto)
  const { data: openDeals } = await supabase.from("deals").select("deal_value")
    .eq("organization_id", orgId).eq("status", "open");
  const pipelineTotal = (openDeals ?? []).reduce((s: number, d: any) => s + Number(d.deal_value ?? 0), 0);

  let name = "Admin";
  if (profileRes.data?.admin_user_id) {
    const { data: prof } = await supabase.from("profiles").select("full_name")
      .eq("id", profileRes.data.admin_user_id).maybeSingle();
    if (prof?.full_name) name = prof.full_name.split(" ")[0];
  }

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return `📊 *Bom dia, ${name}! Resumo de ontem:*\n\n` +
    `✅ Leads criados: *${totalLeads}*\n` +
    `🔥 Leads quentes: *${hotLeads}*\n` +
    `💬 Conversas ativas: *${activeChats}*\n` +
    `📅 Reuniões realizadas: *${meetings}*\n` +
    `💰 Receita fechada: *${fmt(closedRevenue)}*\n` +
    `📈 Pipeline aberto: *${fmt(pipelineTotal)}*\n\n` +
    `Quer detalhes de algum item?`;
}

async function buildWeeklyReport(orgId: string): Promise<string> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const startThis = new Date(now); startThis.setDate(now.getDate() - 7); startThis.setHours(0, 0, 0, 0);
  const startPrev = new Date(startThis); startPrev.setDate(startThis.getDate() - 7);
  const endPrev = new Date(startThis);

  const fetchPeriod = async (from: Date, to: Date) => {
    const [leads, deals] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact" })
        .eq("organization_id", orgId).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()),
      supabase.from("deals").select("deal_value")
        .eq("organization_id", orgId).eq("status", "won")
        .gte("closed_at", from.toISOString()).lt("closed_at", to.toISOString()),
    ]);
    return {
      leads: leads.count ?? 0,
      revenue: (deals.data ?? []).reduce((s: number, d: any) => s + Number(d.deal_value ?? 0), 0),
    };
  };

  const [thisW, prevW] = await Promise.all([
    fetchPeriod(startThis, now),
    fetchPeriod(startPrev, endPrev),
  ]);

  const trend = (a: number, b: number) => {
    if (b === 0) return a > 0 ? "📈 +∞%" : "➖ 0%";
    const diff = ((a - b) / b) * 100;
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➖";
    return `${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(0)}%`;
  };
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return `📅 *Relatório semanal*\n\n` +
    `*Leads:* ${thisW.leads} (vs ${prevW.leads}) ${trend(thisW.leads, prevW.leads)}\n` +
    `*Receita:* ${fmt(thisW.revenue)} (vs ${fmt(prevW.revenue)}) ${trend(thisW.revenue, prevW.revenue)}\n\n` +
    `Boa semana! 🚀`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getServiceSupabase();
    const now = new Date();
    const hour = now.getUTCHours() - 3; // BRT (-3) — quick approx; orgs futuras podem ter timezone próprio
    const adjHour = ((hour % 24) + 24) % 24;
    const dow = ((now.getUTCDay() + (hour < 0 ? -1 : 0)) % 7 + 7) % 7;

    const { data: configs } = await supabase
      .from("auto_notification_settings")
      .select("organization_id, admin_whatsapp_number, admin_user_id, daily_summary_enabled, daily_summary_hour, weekly_report_enabled, weekly_report_dow, weekly_report_hour")
      .eq("admin_agent_enabled", true)
      .not("admin_whatsapp_number", "is", null);

    const results: any[] = [];
    for (const cfg of (configs ?? []) as Cfg[]) {
      if (!cfg.admin_whatsapp_number) continue;

      // Daily summary
      if (cfg.daily_summary_enabled && cfg.daily_summary_hour === adjHour) {
        const ref = `daily-${now.toISOString().slice(0, 10)}`;
        const refId = `00000000-0000-0000-0000-${ref.replace(/\D/g, "").slice(-12).padStart(12, "0")}`;
        if (!(await alreadySent(cfg.organization_id, "daily_summary", refId))) {
          const msg = await buildDailySummary(cfg.organization_id);
          await sendAdminMessage({
            organizationId: cfg.organization_id,
            phone: cfg.admin_whatsapp_number,
            message: msg,
            messageType: "daily_summary",
            referenceId: refId,
          });
          results.push({ org: cfg.organization_id, sent: "daily_summary" });
        }
      }

      // Weekly report
      if (
        cfg.weekly_report_enabled &&
        cfg.weekly_report_hour === adjHour &&
        cfg.weekly_report_dow === dow
      ) {
        // ISO week-based ref
        const wn = Math.floor((+now - +new Date(now.getFullYear(), 0, 1)) / (7 * 86400000));
        const ref = `weekly-${now.getFullYear()}-${wn}`;
        const refId = `00000000-0000-0000-0000-${ref.replace(/\D/g, "").slice(-12).padStart(12, "0")}`;
        if (!(await alreadySent(cfg.organization_id, "weekly_report", refId))) {
          const msg = await buildWeeklyReport(cfg.organization_id);
          await sendAdminMessage({
            organizationId: cfg.organization_id,
            phone: cfg.admin_whatsapp_number,
            message: msg,
            messageType: "weekly_report",
            referenceId: refId,
          });
          results.push({ org: cfg.organization_id, sent: "weekly_report" });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, hour: adjHour, dow, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[admin-agent-summary] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
