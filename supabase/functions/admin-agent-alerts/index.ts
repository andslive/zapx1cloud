// Cron a cada 5min: alertas em tempo real para o admin.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getServiceSupabase,
  sendAdminMessage,
  alreadySentByKind,
} from "../_shared/admin-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrgCfg {
  organization_id: string;
  admin_whatsapp_number: string;
  realtime_alerts_enabled: boolean;
  alert_high_value_threshold: number;
  alert_unattended_minutes: number;
  alert_offline_minutes: number;
  alert_agent_error_threshold: number;
  alert_meeting_changes: boolean;
  alert_goal_achieved: boolean;
}

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function checkHighValueLeads(cfg: OrgCfg) {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("deals")
    .select("id, deal_value, lead_id, seller_id, leads(name), profiles!deals_seller_id_fkey(full_name)")
    .eq("organization_id", cfg.organization_id)
    .gte("deal_value", cfg.alert_high_value_threshold)
    .gte("created_at", since);

  for (const d of (data ?? []) as any[]) {
    if (await alreadySentByKind(cfg.organization_id, "high_value_lead", d.id, 168)) continue;
    const leadName = d.leads?.name || "Lead";
    const seller = d.profiles?.full_name || "—";
    const msg = `🔥 *Lead de alto valor!*\n\n` +
      `👤 ${leadName}\n` +
      `💰 *${fmtBRL(Number(d.deal_value))}*\n` +
      `🧑‍💼 Vendedor: ${seller}`;
    await sendAdminMessage({
      organizationId: cfg.organization_id,
      phone: cfg.admin_whatsapp_number,
      message: msg,
      messageType: "realtime_alert",
      alertKind: "high_value_lead",
      referenceId: d.id,
    });
  }
}

async function checkUnattendedChats(cfg: OrgCfg) {
  const supabase = getServiceSupabase();
  const cutoff = new Date(Date.now() - cfg.alert_unattended_minutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("webchat_conversations")
    .select("id, visitor_name, last_message_at, status")
    .eq("organization_id", cfg.organization_id)
    .in("status", ["bot_active", "waiting_human"])
    .lt("last_message_at", cutoff)
    .limit(20);

  for (const c of (data ?? []) as any[]) {
    if (await alreadySentByKind(cfg.organization_id, "unattended_chat", c.id, 6)) continue;
    const msg = `⏰ *Conversa sem atendimento*\n\n` +
      `👤 ${c.visitor_name || "Visitante"}\n` +
      `🕐 Última mensagem há *${cfg.alert_unattended_minutes}+ min*`;
    await sendAdminMessage({
      organizationId: cfg.organization_id,
      phone: cfg.admin_whatsapp_number,
      message: msg,
      messageType: "realtime_alert",
      alertKind: "unattended_chat",
      referenceId: c.id,
    });
  }
}

async function checkOfflineSellers(cfg: OrgCfg) {
  const supabase = getServiceSupabase();
  const cutoff = new Date(Date.now() - cfg.alert_offline_minutes * 60 * 1000).toISOString();
  const now = new Date();
  const hour = ((now.getUTCHours() - 3) % 24 + 24) % 24;
  // Horário comercial 8-18, dias úteis
  if (hour < 8 || hour > 18) return;
  const dow = now.getUTCDay();
  if (dow === 0 || dow === 6) return;

  const { data } = await supabase
    .from("user_status")
    .select("user_id, status, status_changed_at, profiles(full_name, organization_id)")
    .eq("status", "offline")
    .lt("status_changed_at", cutoff);

  for (const s of (data ?? []) as any[]) {
    if (s.profiles?.organization_id !== cfg.organization_id) continue;
    if (await alreadySentByKind(cfg.organization_id, "seller_offline", s.user_id, 12)) continue;
    const msg = `🚨 *Vendedor offline em horário comercial*\n\n` +
      `🧑‍💼 ${s.profiles?.full_name || "Vendedor"}\n` +
      `🕐 Offline há *${cfg.alert_offline_minutes}+ min*`;
    await sendAdminMessage({
      organizationId: cfg.organization_id,
      phone: cfg.admin_whatsapp_number,
      message: msg,
      messageType: "realtime_alert",
      alertKind: "seller_offline",
      referenceId: s.user_id,
    });
  }
}

async function checkAgentErrors(cfg: OrgCfg) {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("agent_action_logs")
    .select("agent_id, success, created_at")
    .eq("organization_id", cfg.organization_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  // Agrupa por agent_id e conta falhas consecutivas
  const grouped: Record<string, { fails: number; total: number }> = {};
  for (const log of (data ?? []) as any[]) {
    if (!log.agent_id) continue;
    if (!grouped[log.agent_id]) grouped[log.agent_id] = { fails: 0, total: 0 };
    grouped[log.agent_id].total++;
    if (!log.success) grouped[log.agent_id].fails++;
  }

  for (const [agentId, stats] of Object.entries(grouped)) {
    if (stats.fails < cfg.alert_agent_error_threshold) continue;
    if (await alreadySentByKind(cfg.organization_id, "agent_errors", agentId, 6)) continue;
    const { data: agent } = await supabase.from("product_agents").select("name").eq("id", agentId).maybeSingle();
    const msg = `⚠️ *Agente IA com falhas*\n\n` +
      `🤖 ${agent?.name || "Agente"}\n` +
      `❌ *${stats.fails}* erros nos últimos 30min`;
    await sendAdminMessage({
      organizationId: cfg.organization_id,
      phone: cfg.admin_whatsapp_number,
      message: msg,
      messageType: "realtime_alert",
      alertKind: "agent_errors",
      referenceId: agentId,
    });
  }
}

async function checkMeetingChanges(cfg: OrgCfg) {
  if (!cfg.alert_meeting_changes) return;
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("calendar_events")
    .select("id, title, start_time, status, updated_at")
    .eq("organization_id", cfg.organization_id)
    .gte("updated_at", since)
    .in("status", ["confirmed", "cancelled"])
    .limit(20);

  for (const ev of (data ?? []) as any[]) {
    const ref = `${ev.id}-${ev.status}`;
    const refUuid = `00000000-0000-0000-0000-${ev.id.replace(/-/g, "").slice(-12)}`;
    if (await alreadySentByKind(cfg.organization_id, `meeting_${ev.status}`, refUuid, 24)) continue;
    const icon = ev.status === "confirmed" ? "✅" : "❌";
    const verb = ev.status === "confirmed" ? "confirmada" : "cancelada";
    const dt = new Date(ev.start_time).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const msg = `${icon} *Reunião ${verb}*\n\n📅 ${ev.title}\n🕐 ${dt}`;
    await sendAdminMessage({
      organizationId: cfg.organization_id,
      phone: cfg.admin_whatsapp_number,
      message: msg,
      messageType: "realtime_alert",
      alertKind: `meeting_${ev.status}`,
      referenceId: refUuid,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getServiceSupabase();
    const { data: configs } = await supabase
      .from("auto_notification_settings")
      .select("organization_id, admin_whatsapp_number, realtime_alerts_enabled, alert_high_value_threshold, alert_unattended_minutes, alert_offline_minutes, alert_agent_error_threshold, alert_meeting_changes, alert_goal_achieved")
      .eq("admin_agent_enabled", true)
      .eq("realtime_alerts_enabled", true)
      .not("admin_whatsapp_number", "is", null);

    for (const cfg of (configs ?? []) as OrgCfg[]) {
      if (!cfg.admin_whatsapp_number) continue;
      try {
        await Promise.all([
          checkHighValueLeads(cfg),
          checkUnattendedChats(cfg),
          checkOfflineSellers(cfg),
          checkAgentErrors(cfg),
          checkMeetingChanges(cfg),
        ]);
      } catch (e) {
        console.error("[admin-agent-alerts] org failed", cfg.organization_id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: configs?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[admin-agent-alerts] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
