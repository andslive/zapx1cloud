// Shared helper to send WhatsApp messages to the org's admin (Agente Admin Executivo).
// Uses Evolution Go exclusively. Normalizes phone (DDI 55), sends and logs into admin_agent_messages.

// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AdminMessageType =
  | "daily_summary"
  | "weekly_report"
  | "realtime_alert"
  | "reactive"
  | "test";

export interface SendAdminMessageParams {
  organizationId: string;
  phone: string;            // raw phone (will be normalized)
  message: string;
  messageType: AdminMessageType;
  alertKind?: string;
  referenceId?: string;
  /** Optional explicit Evolution instance to use. Falls back to connected/default. */
  instanceId?: string;
}

export interface SendAdminMessageResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  diagnostics?: Record<string, any>;
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let p = String(raw).replace(/\D/g, "");
  // Apply DDI 55 if missing (BR default — see memo normalizacao-telefone-ddi)
  if (p.length >= 10 && p.length <= 11) p = "55" + p;
  return p;
}

export function getServiceSupabase(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}


/**
 * Sends a WhatsApp text message via the deployed `whatsapp-send` edge function.
 * If `preferredInstanceId` is given and exists for the org, uses it.
 * Otherwise picks: connected first, then default.
 */
async function sendViaEvolutionSend(
  supabase: SupabaseClient,
  organizationId: string,
  phone: string,
  message: string,
  preferredInstanceId?: string
): Promise<{ ok: boolean; messageId: string | null; error?: string; diagnostics?: Record<string, any> }> {
  // Pick best instance: connected first, then default
  const { data: instances, error: instErr } = await supabase
    .from("evolution_instances")
    .select("id, name, status, is_default")
    .eq("organization_id", organizationId);

  if (instErr) {
    return { ok: false, messageId: null, error: `query instances failed: ${instErr.message}` };
  }
  if (!instances || instances.length === 0) {
    return { ok: false, messageId: null, error: "No Evolution instances configured for org" };
  }

  let chosen: any = null;
  if (preferredInstanceId) {
    chosen = (instances as any[]).find((i) => i.id === preferredInstanceId) || null;
    if (chosen && chosen.status !== "connected" && chosen.status !== "online") {
      return {
        ok: false,
        messageId: null,
        error: `Selected instance "${chosen.name}" is not connected (status=${chosen.status})`,
        diagnostics: { instance_id: chosen.id, instance_name: chosen.name, status: chosen.status },
      };
    }
  }

  if (!chosen) {
    const sorted = [...instances].sort((a: any, b: any) => {
      const aConn = (a.status === "connected" || a.status === "online") ? 1 : 0;
      const bConn = (b.status === "connected" || b.status === "online") ? 1 : 0;
      if (aConn !== bConn) return bConn - aConn;
      const aDef = a.is_default ? 1 : 0;
      const bDef = b.is_default ? 1 : 0;
      return bDef - aDef;
    });
    chosen = sorted[0];
  }

  console.log(
    `[admin-send] chose instance ${chosen.name} (id=${chosen.id} status=${chosen.status} default=${chosen.is_default}) -> phone ${phone}`
  );

  if (chosen.status !== "connected" && chosen.status !== "online") {
    return {
      ok: false,
      messageId: null,
      error: `Selected instance "${chosen.name}" is not connected (status=${chosen.status})`,
      diagnostics: { instance_id: chosen.id, instance_name: chosen.name, status: chosen.status },
    };
  }

  // Invoke the deployed edge function (no need to import its code)
  const { data, error } = await supabase.functions.invoke("whatsapp-send", {
    body: {
      organization_id: organizationId,
      instance_id: chosen.id,
      type: "text",
      to: phone,
      payload: { text: message },
    },
  });

  if (error) {
    console.error("[admin-send] whatsapp-send invoke error", error);
    return {
      ok: false,
      messageId: null,
      error: `whatsapp-send failed: ${error.message ?? String(error)}`,
      diagnostics: { instance_id: chosen.id, instance_name: chosen.name },
    };
  }

  // whatsapp-send returns { ok, status, body }
  const innerOk = (data as any)?.ok === true;
  if (!innerOk) {
    const innerBody = (data as any)?.body;
    const detail = typeof innerBody === "string" ? innerBody.slice(0, 300) : JSON.stringify(innerBody).slice(0, 300);
    return {
      ok: false,
      messageId: null,
      error: `whatsapp-send returned not ok (status=${(data as any)?.status}): ${detail}`,
      diagnostics: { instance_id: chosen.id, instance_name: chosen.name, response: data },
    };
  }

  const innerBody = (data as any)?.body ?? {};
  const messageId =
    innerBody?.key?.id ||
    innerBody?.id ||
    innerBody?.messageId ||
    null;

  return {
    ok: true,
    messageId,
    diagnostics: { instance_id: chosen.id, instance_name: chosen.name },
  };
}



export async function sendAdminMessage(params: SendAdminMessageParams): Promise<SendAdminMessageResult> {
  const supabase = getServiceSupabase();
  const phone = normalizePhone(params.phone);
  if (!phone) {
    return { ok: false, error: "empty phone after normalization" };
  }

  let messageId: string | null = null;
  let sendError: string | undefined;
  let diagnostics: Record<string, any> | undefined;
  let logContent = params.message;

  try {
    const result = await sendViaEvolutionSend(
      supabase,
      params.organizationId,
      phone,
      params.message,
      params.instanceId
    );
    messageId = result.messageId;
    if (!result.ok) {
      sendError = result.error;
      diagnostics = result.diagnostics;
      const isNoConn = (result.error ?? "").toLowerCase().includes("not connected") ||
        (result.error ?? "").toLowerCase().includes("no evolution instances");
      const prefix = isNoConn
        ? "⚠️ Sem instância WhatsApp conectada"
        : `[ENVIO FALHOU: ${result.error}]`;
      logContent = `${prefix} ${params.message}`;
    }
  } catch (e: any) {
    console.error("[admin-send] send exception", e);
    sendError = e?.message ?? String(e);
    logContent = `[ENVIO FALHOU: ${sendError}] ${params.message}`;
  }

  // Log
  await supabase.from("admin_agent_messages").insert({
    organization_id: params.organizationId,
    direction: "outbound",
    message_type: params.messageType,
    alert_kind: params.alertKind ?? null,
    reference_id: params.referenceId ?? null,
    content: logContent,
    whatsapp_message_id: messageId,
  });

  return {
    ok: !sendError,
    messageId,
    error: sendError,
    diagnostics,
  };
}

export async function alreadySent(
  organizationId: string,
  messageType: AdminMessageType,
  referenceId: string,
  withinHours = 168
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("admin_agent_messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("message_type", messageType)
    .eq("reference_id", referenceId)
    .gte("created_at", since)
    .limit(1);
  return !!(data && data.length > 0);
}

export async function alreadySentByKind(
  organizationId: string,
  alertKind: string,
  referenceId: string,
  withinHours = 24
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("admin_agent_messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("alert_kind", alertKind)
    .eq("reference_id", referenceId)
    .gte("created_at", since)
    .limit(1);
  return !!(data && data.length > 0);
}
