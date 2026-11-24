import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format } from "https://deno.land/std@0.207.0/datetime/mod.ts";
import { classifyStatus, probeInstance } from "../_shared/connection-alerts/status.ts";
import { processDueEpisodes, type ConnectionInfo, type Deps, type SendOutcome } from "../_shared/connection-alerts/episode.ts";
import { alertLog, createSupabaseEpisodeStore, reportSuspectedDisconnect } from "../_shared/connection-alerts/store.ts";
import {
  decidePresenceReconciliation,
  loadEnabledPresencePolicies,
  reconcileInstancePresence,
  type DesiredPresence,
} from "../_shared/uazapi-presence-policy.ts";
import {
  buildSafeStatusSummary,
  buildSafeProfileSyncSummary,
} from "../_shared/uazapi-safe-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FASE 28: normaliza message_id para o "id puro" do WhatsApp.
 * Linhas antigas de whatsapp_message_retries usam o formato composto
 * "jid:id" (ex.: "5511...@s.whatsapp.net:3EB0..."); o provider só aceita
 * o id puro na consulta de status.
 */
function normalizePureMessageId(raw: unknown): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const lastColon = s.lastIndexOf(":");
    if (lastColon > 0 && s.slice(0, lastColon).includes("@")) {
        return s.slice(lastColon + 1);
    }
    return s;
}

/**
 * Requirement #12 & #3: DETECÇÃO DE GHOST CONNECTION
 */
async function checkGhostConnection(supabase: any, inst: any, statusData: any, platformSettings: any) {
    const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");
    const token = inst.instance_token || platformSettings?.uazapi_admin_token;
    
    let isGhost = false;
    const reasons: string[] = [];

    // 1. WebSocket status vs Manager status
    const browserAlive = statusData.browser?.connected ?? statusData.browser_connected ?? true;
    const loggedIn = statusData.loggedIn ?? statusData.logged_in ?? true;
    
    // Normalize state to handle object responses (ghost detected fix)
    let realState: any = "UNKNOWN";
    
    // [UAZAPI_RAW_STATUS_GHOST] — achado de segurança corrigido: o corpo
    // bruto de GET /instance/status inclui o token em texto puro; logamos
    // só um resumo permitido (nunca o objeto inteiro).
    console.log(
      "[UAZAPI_RAW_STATUS_GHOST]",
      JSON.stringify(buildSafeStatusSummary(statusData, {
        instanceId: inst.id,
        instanceName: inst.name,
        organizationId: inst.organization_id,
        provider: inst.provider,
        operation: "ghost_check",
      })),
    );

    if (statusData.status && typeof statusData.status === 'object' && statusData.status.connected !== undefined) {
        realState = statusData.status.connected ? "CONNECTED" : "DISCONNECTED";
    } else if (statusData.instance?.status !== undefined) {
        realState = statusData.instance.status;
    } else {
        realState = statusData.state || statusData.status;
    }

    if (realState && typeof realState === 'object') {
        realState = realState.state || realState.status || (realState.connected ? "CONNECTED" : "DISCONNECTED");
    }
    const stateStr = String(realState || "UNKNOWN").toUpperCase();
    
    // Normalização sugerida: CONNECTED, OPEN, ONLINE são considerados saudáveis
    const waConnected = stateStr === "CONNECTED" || stateStr === "OPEN" || stateStr === "ONLINE";

    if (!waConnected || !browserAlive) {
        isGhost = true;
        reasons.push(!waConnected ? `wa_state_${stateStr}` : "browser_disconnected");
    }

    if (!loggedIn) {
        // Se deslogado, marcamos para QR mas não tentamos recuperação automática de socket
        await supabase.from("ghost_recovery_logs").insert({
            connection_id: inst.id,
            event_type: "qr_required",
            details: { status: "logged_out" }
        });
        
        // Atualiza o status do painel como antes, mas NÃO notifica: a queda só gera alerta depois de confirmada
        // (episódio de desconexão: 5 min + 2 consultas válidas). Ver _shared/connection-alerts/episode.ts.
        if (inst.status !== "logged_out") {
            await applyInstanceStatus(supabase, inst, "logged_out");
        }
        return false;
    }

    // 2. WebSocket connected but no recent ACK progression (Requirement #6: ACK2 VALIDATION)
    const { data: oneTickMessages } = await supabase
        .from("whatsapp_message_retries")
        .select("id")
        .eq("instance_id", inst.id)
        .eq("ack_status", 0) 
        .lt("created_at", new Date(Date.now() - 600000).toISOString()) // 10 mins
        .limit(10);

    const oneTickCount = oneTickMessages?.length || 0;
    if (oneTickCount > 50) {
        isGhost = true;
        reasons.push(`high_one_tick_count_${oneTickCount}`);
    }

    // 3. No pong recent or High Latency
    const lastPong = statusData.data?.lastPong || statusData.lastPong;
    if (lastPong) {
        const lastPongDate = new Date(lastPong);
        const pongAge = Date.now() - lastPongDate.getTime();
        if (pongAge > 300000) { // 5 mins
            isGhost = true;
            reasons.push(`stale_pong_${Math.round(pongAge/1000)}s`);
        }
    }

    // Registrar saúde detalhada - Optimized with UPSERT
    await supabase.from("connection_health").upsert({
        connection_id: inst.id,
        instance_name: inst.name,
        status_crm: inst.status,
        status_real: statusData,
        logged_in: loggedIn,
        connected: waConnected,
        browser_alive: browserAlive,
        one_tick_count: oneTickCount,
        action_taken: isGhost ? "recovery_triggered" : "none",
        updated_at: new Date().toISOString()
    }, { onConflict: 'connection_id' });

    if (isGhost) {
        const decision = "recovery_triggered";
        console.warn(`[uazapi-heartbeat] [GHOST_DETECTED] instance ${inst.name} reasons: ${reasons.join(", ")}`);
        
        // Log detalhado [HEALTH_MONITOR_DEBUG]
        console.log(`[HEALTH_MONITOR_DEBUG]`, JSON.stringify({
            instance_id: inst.id,
            raw_wa_state: statusData.state || statusData.status,
            normalized_state: stateStr,
            chromium_state: inst.chromium_status,
            uazapi_state: stateStr,
            decision: decision
        }));

        // Log detecção no banco - Minimal details for ghosts
        await supabase.from("ghost_recovery_logs").insert({
            connection_id: inst.id,
            event_type: "ghost_detected",
            details: { 
                reasons, 
                normalized_state: stateStr 
            }
        });

        // Etapa 1: Reconnect leve
        await fetch(`${uazapiUrl}/instance/connect`, { 
            method: "POST", 
            headers: { "token": token } 
        }).catch(() => {});

        // Update instance metadata
        await supabase.from("evolution_instances").update({
            is_ghost: true,
            last_recovery_at: new Date().toISOString(),
            recovery_count: (inst.recovery_count || 0) + 1,
            one_tick_count: oneTickCount
        }).eq("id", inst.id);
        
        // Ghost mantém a recuperação e o status do painel como antes, mas deixa de enviar WhatsApp: socket
        // instável não é desconexão confirmada.
        if (inst.last_real_whatsapp_state === "CONNECTED" || inst.status === "connected") {
             await applyInstanceStatus(supabase, inst, "ghost");
        }

        return false; 
    }

    // Se estava como ghost e agora está saudável, limpa flag
    if (inst.is_ghost) {
        await supabase.from("evolution_instances").update({ is_ghost: false }).eq("id", inst.id);
        await supabase.from("ghost_recovery_logs").insert({
            connection_id: inst.id,
            event_type: "reconnect_success",
            details: { status: "recovered" }
        });
    }

    return true; 
}

/**
 * Atualiza o status da instância no CRM (painel) a partir do estado real observado.
 * É a parte de BANCO do antigo `handleAdminStatusAlert`, mantida igual: crítico → "disconnected"; conectado → "connected".
 * NÃO notifica ninguém. A notificação agora é só o alerta de desconexão confirmada (ver mais abaixo).
 */
async function applyInstanceStatus(supabase: any, instance: any, newState: string) {
  try {
    const normalizedNew = newState.toLowerCase();
    const criticalStatuses = ["offline", "disconnected", "error", "waiting_qr", "logged_out", "close", "restricted", "ghost"];
    const isCritical = criticalStatuses.includes(normalizedNew);
    const now = new Date().toISOString();
    const updates: any = {
      last_health_at: now,
      last_real_whatsapp_ping: now,
      last_real_whatsapp_state: newState.toUpperCase(),
      updated_at: now,
    };
    if (isCritical) updates.status = "disconnected";
    else if (normalizedNew === "connected" || normalizedNew === "open") updates.status = "connected";
    await supabase.from("evolution_instances").update(updates).eq("id", instance.id);
  } catch (err) {
    console.error("[uazapi-heartbeat] applyInstanceStatus failed:", (err as Error)?.message);
  }
}

/**
 * Envio da mensagem administrativa pelo canal oficial do CRM (uazapi-send), por uma instância saudável da própria
 * organização (nunca uma arquivada). Mantém o registro em admin_notification_logs/admin_status_alerts.
 * Classifica o resultado para o episódio: só "sent" confirma; "unknown" (timeout/5xx) NUNCA deve ser reenviado.
 */
async function deliverAdminMessage(
  supabase: any,
  instance: { id: string; name: string; phone_number?: string | null; organization_id: string },
  notifyPhone: string,
  message: string,
  meta: { oldStatus: string; newStatus: string; reason: string },
): Promise<SendOutcome> {
  const orgId = instance.organization_id;
  const now = new Date().toISOString();
  const { data: sender } = await supabase
    .from("evolution_instances")
    .select("id")
    .eq("status", "connected")
    .eq("organization_id", orgId)
    .neq("id", instance.id)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (!sender) {
    console.warn(`[uazapi-heartbeat] No healthy instance to send alert for org ${orgId}`);
    return { outcome: "no_sender" };
  }

  let sendRes: Response;
  let sendResult: any;
  try {
    sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-send`, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: orgId,
        instance_id: sender.id,
        type: "text",
        to: notifyPhone, // mesmo valor configurado; a normalização continua sendo a do uazapi-send
        payload: { text: message, skip_warmup: true },
      }),
    });
    sendResult = await sendRes.json().catch(() => ({ error: "Failed to parse response" }));
  } catch (e) {
    return { outcome: "unknown", detail: (e as Error)?.name === "TimeoutError" ? "timeout" : "network_error" };
  }
  const success = sendRes.ok && sendResult?.success === true;

  try {
    await supabase.from("admin_notification_logs").insert({
      organization_id: orgId, connection_id: instance.id, instance_name: instance.name,
      old_status: meta.oldStatus, new_status: meta.newStatus, reason: meta.reason, sent_to: notifyPhone,
      payload: { message }, created_at: now, success, send_response: sendResult,
      error: success ? null : JSON.stringify(sendResult),
    });
    await supabase.from("admin_status_alerts").insert({
      organization_id: orgId, connection_id: instance.id, connection_name: instance.name, connection_phone: instance.phone_number,
      old_status: meta.oldStatus, new_status: meta.newStatus, notify_phone: notifyPhone, message,
      status: success ? "sent" : "error", error_message: success ? null : JSON.stringify(sendResult),
    });
  } catch (e) {
    console.error("[uazapi-heartbeat] alert log insert failed:", (e as Error)?.message);
  }

  if (success) return { outcome: "sent" };
  // 5xx do uazapi-send pode ter entregue mesmo assim: tratar como desconhecido (nunca reenviar)
  return sendRes.status >= 500 ? { outcome: "unknown", detail: `http_${sendRes.status}` } : { outcome: "rejected", detail: `http_${sendRes.status}` };
}

/** Botão "Testar alerta" do painel: mensagem explícita, sem alterar estado nem usar o episódio. */
async function sendManualTestAlert(supabase: any, instance: any) {
  const { data: org } = await supabase.from("organizations").select("admin_status_notify_phone").eq("id", instance.organization_id).single();
  if (!org?.admin_status_notify_phone) return;
  const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");
  const message = `ℹ️ *TESTE CRM - Alerta de Conexão*\n\n*Instância:* ${instance.name}\n*Número:* +${instance.phone_number || "Desconhecido"}\n*Horário:* ${timestamp}\n\n_Mensagem de teste: nenhuma queda foi detectada._`;
  await deliverAdminMessage(supabase, instance, org.admin_status_notify_phone, message, { oldStatus: instance.status, newStatus: "TEST", reason: "Manual trigger via Test Alert button" });
}

/** Mensagem do ÚNICO alerta por episódio: queda confirmada por 2 consultas diretas à UazAPI. */
function buildDisconnectMessage(connection: ConnectionInfo, suspectedAt: string): string {
  const fmt = (iso: string) => format(new Date(new Date(iso).getTime() - 3 * 3600_000), "dd/MM/yyyy HH:mm"); // horário de Brasília
  return `⚠️ *ALERTA CRM - Conexão desconectada (confirmada)*\n\n*Instância:* ${connection.name}\n*Número:* +${connection.phone_number || "Desconhecido"}\n*Queda detectada em:* ${fmt(suspectedAt)} (Brasília)\n*Confirmação:* 2 consultas diretas à UazAPI, 1 min de intervalo, após 5 min de espera\n\n_Ação sugerida: verifique a instância no painel de Conexões. Você não receberá outro aviso desta queda._`;
}

/**
 * Processa os episódios de desconexão vencidos (agendamento persistente: a fila é a tabela, o gatilho é o tick do
 * heartbeat). Consulta DIRETA à UazAPI com o token real da conexão; sem requisição aberta aguardando.
 */
async function processDisconnectEpisodes(supabase: any, platformSettings: any) {
  const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");
  const tokens = new Map<string, string>();
  const deps: Deps = {
    store: createSupabaseEpisodeStore(supabase),
    now: () => new Date(),
    loadConnection: async (id) => {
      const { data } = await supabase.from("evolution_instances")
        .select("id,name,organization_id,phone_number,archived_at,status,last_real_whatsapp_state,last_health_at,last_connected_at,instance_token")
        .eq("id", id).maybeSingle();
      if (!data) return null;
      const { instance_token, ...info } = data;
      tokens.set(id, instance_token || platformSettings?.uazapi_admin_token || "");
      return info as ConnectionInfo;
    },
    probe: (conn) => probeInstance(uazapiUrl, tokens.get(conn.id) || "", { timeoutMs: 10_000 }),
    getRecipient: async (orgId) => {
      const { data } = await supabase.from("organizations").select("admin_status_notify_phone, admin_status_alerts_enabled").eq("id", orgId).maybeSingle();
      return { phone: data?.admin_status_notify_phone || null, enabled: data?.admin_status_alerts_enabled !== false };
    },
    sendAlert: ({ episode, connection, phone }) =>
      deliverAdminMessage(supabase, connection, phone, buildDisconnectMessage(connection, episode.suspected_at), {
        oldStatus: "connected", newStatus: "DISCONNECTED", reason: "Disconnect confirmed by 2 direct UazAPI checks",
      }),
    log: alertLog,
  };
  try { return await processDueEpisodes(deps, 20); }
  catch (e) {
    alertLog("operational_error", { op: "process_due_episodes", code: "episodes_unexpected", error: (e as Error)?.message });
    return { ok: false, due: 0, processed: 0, errors: 1, error_code: "episodes_unexpected" };
  }
}

async function processWebhookHealth(supabase: any, inst: any, platformSettings: any) {
    const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");
    const token = inst.instance_token || platformSettings?.uazapi_admin_token;
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook`;
    const defaultEvents = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONTACTS_UPSERT", "PRESENCE_UPDATE", "CHATS_UPSERT", "messages", "connection", "qrcode", "messages_update"];

    try {
        let res = await fetch(`${uazapiUrl}/webhook/instance/${inst.name}`, {
            method: "GET",
            headers: { "token": token }
        });

        // Retry with /webhook if /webhook/instance fails
        if (!res.ok) {
           res = await fetch(`${uazapiUrl}/webhook`, {
                method: "GET",
                headers: { "token": token }
            });
        }


        let status = 'broken';
        let remoteUrl = "";
        let remoteEvents = [];

        if (res.ok) {
            const data = await res.json().catch(() => ([]));
            const webhook = Array.isArray(data) ? data[0] : data;
            remoteUrl = webhook?.url || "";
            remoteEvents = webhook?.events || [];
            const isEnabled = webhook?.enabled === true;

            
            if (isEnabled && remoteUrl === webhookUrl) {
                status = 'ok';
            } else if (!isEnabled || !remoteUrl) {
                status = 'absent';
            }
        } else if (res.status === 404) {
            status = 'absent';
        }

        // Auto-repair if broken or absent and instance is connected
        if (status !== 'ok' && (inst.status === 'connected' || inst.status === 'paired')) {
            console.log(`[uazapi-heartbeat] [WEBHOOK_AUTO_REPAIR] repairing webhook for ${inst.name}`);
            let repairRes = await fetch(`${uazapiUrl}/webhook/set`, {
                method: "POST",
                headers: { "token": token, "Content-Type": "application/json" },
                body: JSON.stringify({ url: webhookUrl, enabled: true, events: defaultEvents })
            });

            // Retry with /webhook if /webhook/set fails
            if (!repairRes.ok) {
                repairRes = await fetch(`${uazapiUrl}/webhook`, {
                    method: "POST",
                    headers: { "token": token, "Content-Type": "application/json" },
                    body: JSON.stringify({ url: webhookUrl, enabled: true, events: defaultEvents })
                });
            }

            const repairData = await repairRes.text();

            console.log(`[uazapi-heartbeat] [WEBHOOK_AUTO_REPAIR_RESULT] instance=${inst.name} ok=${repairRes.ok} status=${repairRes.status} body=${repairData.slice(0, 500)}`);
            
            if (repairRes.ok) {
                status = 'ok';
                remoteUrl = webhookUrl;
                remoteEvents = defaultEvents;
            } else {
                status = 'broken'; // If repair failed, it's broken
            }
        }


        await supabase.from("evolution_instances").update({
            webhook_status: status,
            webhook_url: remoteUrl,
            webhook_events: remoteEvents,
            last_webhook_check_at: new Date().toISOString()
        }).eq("id", inst.id);

    } catch (err) {
        console.error(`[uazapi-heartbeat] webhook check failed for ${inst.name}:`, err.message);
    }
}

async function processInstanceHealth(supabase: any, inst: any, platformSettings: any, source: string = 'cron', presencePolicies: Map<string, DesiredPresence> = new Map()) {

    const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");
    const token = inst.instance_token || platformSettings?.uazapi_admin_token;
    
    if (!token || !uazapiUrl) return;

    try {
        const res = await fetch(`${uazapiUrl}/instance/status`, {
            method: "GET",
            headers: { "token": token }
        });

        const data = await res.json().catch(() => ({}));
        
        // [UAZAPI_RAW_STATUS] — achado de segurança corrigido: o corpo
        // bruto de GET /instance/status inclui o token em texto puro;
        // logamos só um resumo permitido (nunca o objeto inteiro).
        console.log(
          "[UAZAPI_RAW_STATUS]",
          JSON.stringify(buildSafeStatusSummary(data, {
            instanceId: inst.id,
            instanceName: inst.name,
            organizationId: inst.organization_id,
            provider: inst.provider,
            operation: "health_check",
            httpStatus: res.status,
          })),
        );
        
        // Extract real state string from various possible UazAPI response shapes
        let realState: any = "UNKNOWN";
        
        // Prioritize data.status.connected to derive state if status is an object
        if (data.status && typeof data.status === 'object' && data.status.connected !== undefined) {
            realState = data.status.connected ? "CONNECTED" : "DISCONNECTED";
        } else if (data.instance?.status !== undefined) {
            realState = data.instance.status;
        } else if (data.state !== undefined) {
            realState = data.state;
        } else if (data.status !== undefined) {
            realState = data.status;
        }

        // Final normalization if still an object (fallback)
        if (realState && typeof realState === 'object') {
            realState = realState.state || realState.status || (realState.connected ? "CONNECTED" : "DISCONNECTED");
        }
        
        const stateStr = String(realState).toUpperCase();
        
        // [UAZAPI_PARSED_STATUS]
        console.log(`[UAZAPI_PARSED_STATUS] instance=${inst.name} final_status=${stateStr}`);

        const isConnected = res.ok && (stateStr === "CONNECTED" || stateStr === "OPEN" || stateStr === "ONLINE");

        // Reconciliação de presence (available/unavailable) por organização
        // — usa exclusivamente o GET /instance/status já feito acima, sem
        // consulta nova. Decisão pura, testável isoladamente; execução
        // fail-open (nunca desconecta, nunca bloqueia o restante do
        // heartbeat, nunca loga token).
        //
        // Guard explícito de `res.ok`: em 401/erro, `data` é o corpo de
        // erro da UazAPI (ex.: {"code":401,"message":"Invalid token."}),
        // sem `.status`/`.instance` — ou seja, `sessionConnected`/`loggedIn`/
        // `currentPresence` já ficariam undefined e o gate normal da função
        // pura já bloquearia o POST. Mesmo assim, tornamos a garantia
        // EXPLÍCITA aqui (não incidental) para nunca depender só do shape
        // do corpo de erro permanecer estável.
        if (res.ok) {
          try {
            const presenceDecision = decidePresenceReconciliation({
              provider: inst.provider,
              archivedAt: inst.archived_at,
              organizationId: inst.organization_id,
              hasToken: !!inst.instance_token,
              desiredPresenceByOrg: presencePolicies,
              sessionConnected: (data as any)?.status?.connected,
              loggedIn: (data as any)?.status?.loggedIn,
              currentPresence: (data as any)?.instance?.current_presence,
            });
            if (presenceDecision.action === "post") {
              await reconcileInstancePresence(
                String(platformSettings?.uazapi_url || "").replace(/\/$/, ""),
                inst.instance_token,
                presenceDecision.desiredPresence,
                { id: inst.id, name: inst.name },
              );
            }
          } catch (presenceErr: any) {
            console.error(
              "[UAZAPI_PRESENCE_RECONCILE]",
              JSON.stringify({ instance_id: inst.id, name: inst.name, result: "unexpected_exception", message: presenceErr?.message || String(presenceErr) }),
            );
          }
        }

        // Logic for alerting and status sync
        const oldRealState = inst.last_real_whatsapp_state;
        const healthNow = new Date().toISOString();
        
        // [PROFILE_SYNC_START]
        let metadataUpdates: any = {};
        if (isConnected) {
            // [PROFILE_SYNC_RAW] — achado de segurança corrigido: o corpo
            // bruto de GET /instance/status inclui o token em texto puro;
            // logamos só presença/ausência de campos de perfil e telefone
            // mascarado, nunca os valores brutos (nome, avatar, telefone).
            console.log(
              "[PROFILE_SYNC_RAW]",
              JSON.stringify(buildSafeProfileSyncSummary(data, { instanceId: inst.id, instanceName: inst.name })),
            );
            const instanceInfo = data.instance || {};
            
            const raw_whatsapp_name = 
                data.pushName || 
                data.profileName || 
                instanceInfo.profileName ||
                instanceInfo.pushName ||
                data.verifiedName ||
                instanceInfo.verifiedName ||
                null;
                
            const raw_avatar_url = 
                data.profilePicUrl || 
                data.profilePictureUrl || 
                data.avatar || 
                instanceInfo.profilePicUrl || 
                instanceInfo.avatar ||
                null;
                
            const raw_phone_number = 
                data.number || 
                instanceInfo.number || 
                instanceInfo.owner ||
                (data.status?.jid ? String(data.status.jid).split('@')[0].split(':')[0] : null) ||
                null;

            // Rule: Don't overwrite valid data with null/---
            // Rule: Don't overwrite valid data with null/---
            const push_name = (raw_whatsapp_name && raw_whatsapp_name !== "---") ? raw_whatsapp_name : inst.push_name;
            const profile_picture_url = (raw_avatar_url && raw_avatar_url !== "") ? raw_avatar_url : inst.profile_picture_url;
            const phone_number = raw_phone_number || inst.phone_number;

            metadataUpdates = {
                push_name,
                profile_picture_url,
                phone_number
            };

            if (!raw_whatsapp_name || raw_whatsapp_name === "---") {
                console.log(`[PROFILE_SYNC_SKIP_NULL] instance=${inst.name} reason=name_missing_or_invalid`);
            }
            if (!raw_avatar_url) {
                console.log(`[PROFILE_SYNC_SKIP_NULL] instance=${inst.name} reason=avatar_missing`);
            }

            console.log(`[PROFILE_SYNC_PARSED] instance=${inst.name}`, JSON.stringify(metadataUpdates));
        }

        // Classificação estrita: só um estado explícito de desconexão (HTTP ok) comprova queda.
        const probeResult = classifyStatus(res.ok, res.status, data);

        if (oldRealState === "CONNECTED" && !isConnected) {
            if (probeResult.kind === "disconnected") {
                // Possível queda: atualiza o status do painel (como antes) e REGISTRA a suspeita. Não alerta agora:
                // o alerta só sai após 5 min + 2 consultas diretas válidas (episódio de desconexão).
                await applyInstanceStatus(supabase, inst, stateStr);
                if (source !== 'manual_sync') {
                    await reportSuspectedDisconnect(supabase, {
                        organization_id: inst.organization_id, connection_id: inst.id, connection_name: inst.name, source: "heartbeat",
                    });
                }
            } else {
                // Erro HTTP/timeout/resposta vazia/estado transitório NÃO comprovam queda: não grava o estado, não abre
                // suspeita; a próxima consulta reavalia.
                alertLog("probe_inconclusive_no_state_change", { connection_id: inst.id, connection: inst.name, state: stateStr, http: res.status });
            }
        } else if (oldRealState !== "CONNECTED" && isConnected) {
            // Recuperação detectada: só sincroniza o estado (sem mensagem de reconexão). O episódio, se houver,
            // acompanha a recuperação estável por conta própria.
            await supabase.from("evolution_instances").update({ 
                status: "connected",
                last_health_at: healthNow,
                last_real_whatsapp_ping: healthNow,
                last_real_whatsapp_state: stateStr,
                updated_at: healthNow,
                ...metadataUpdates
            }).eq("id", inst.id);
            console.log(`[PROFILE_SYNC_DB_UPDATE] instance=${inst.name} recovery`);
        } else if (isConnected) {
            await checkGhostConnection(supabase, inst, data, platformSettings);
            
            await supabase.from("evolution_instances").update({ 
                status: "connected",
                last_health_at: healthNow,
                last_real_whatsapp_ping: healthNow,
                last_real_whatsapp_state: stateStr,
                updated_at: healthNow,
                ...metadataUpdates
            }).eq("id", inst.id);
            console.log(`[PROFILE_SYNC_DB_UPDATE] instance=${inst.name} sync`);
        } else {
            // Inconsistência ou Offline
            const { data: conn } = await supabase.from("connections").select("chromium_status").eq("number", inst.phone_number).maybeSingle();
            if (conn?.chromium_status === "online" && !isConnected) {
                await supabase.from("ghost_recovery_logs").insert({
                    connection_id: inst.id,
                    event_type: "state_source_conflict",
                    details: { 
                        manager_online: true, 
                        uazapi_state: stateStr,
                        reason: "Manager reports online but UazAPI returns disconnected" 
                    }
                });
            }

            await supabase.from("evolution_instances").update({ 
                status: "disconnected",
                last_health_at: healthNow,
                last_real_whatsapp_ping: healthNow,
                last_real_whatsapp_state: stateStr,
                updated_at: healthNow
            }).eq("id", inst.id);
        }

        // Run webhook health check
        await processWebhookHealth(supabase, inst, platformSettings);

    } catch (err) {

        console.error(`[uazapi-heartbeat] health check failed for ${inst.name}:`, err.message);
    }
}

/**
 * Requirement #13: ACK VERIFICATION WORKER
 */
async function processAckRetries(supabase: any, platformSettings: any) {
    const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");

    // FASE 28: TERMINAL DELETE — linhas com retry_count >= 10 nunca mais são
    // elegíveis (a query abaixo filtra lt 10) e ficavam presas em 'retrying'
    // para sempre. Drena em lotes de 500 por tick para não travar o banco.
    try {
        const { data: exhausted } = await supabase
            .from("whatsapp_message_retries")
            .select("id")
            .gte("retry_count", 10)
            .limit(500);
        if (exhausted && exhausted.length > 0) {
            const { error: termErr } = await supabase
                .from("whatsapp_message_retries")
                .delete()
                .in("id", exhausted.map((r: any) => r.id));
            if (termErr) {
                console.error("[uazapi-heartbeat] [ACK_WORKER] terminal delete failed:", termErr.message);
            } else {
                console.log(`[uazapi-heartbeat] [ACK_WORKER] terminal delete: ${exhausted.length} exhausted retries removed`);
            }
        }
    } catch (termErr) {
        console.error("[uazapi-heartbeat] [ACK_WORKER] terminal delete exception:", (termErr as any)?.message || termErr);
    }

    const { data: retries } = await supabase
        .from("whatsapp_message_retries")
        .select("*")
        .lte("next_retry_at", new Date().toISOString())
        .lt("retry_count", 10) // Max 10 retries
        .limit(50);

    if (!retries || retries.length === 0) return;

    console.log(`[uazapi-heartbeat] [ACK_WORKER] verifying ${retries.length} messages...`);

    for (const item of retries) {
        try {
            const { data: inst } = await supabase.from("evolution_instances").select("*").eq("id", item.instance_id).single();
            if (!inst) continue;

            const token = inst.instance_token || platformSettings?.uazapi_admin_token;
            const remotePhone = String(item.remote_jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

            // 1. Trigger presence to force session sync
            await fetch(`${uazapiUrl}/message/presence/subscribe`, {
                method: "POST",
                headers: { "token": token, "Content-Type": "application/json" },
                body: JSON.stringify({ number: remotePhone })
            }).catch(() => {});

            await fetch(`${uazapiUrl}/message/presence`, {
                method: "POST",
                headers: { "token": token, "Content-Type": "application/json" },
                body: JSON.stringify({ number: remotePhone, presence: "paused" })
            }).catch(() => {});

            // 2. Consult provider for real status
            // FASE 28: linhas antigas guardam "jid:id"; o provider só aceita o id puro.
            const pureMessageId = normalizePureMessageId(item.message_id);
            try {
                const statusRes = await fetch(`${uazapiUrl}/message/status?id=${encodeURIComponent(pureMessageId)}&number=${encodeURIComponent(item.remote_jid || "")}`, {
                    headers: { "token": token }
                });
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const rawStatus = statusData.status || statusData.data?.status;
                    if (rawStatus === 3 || rawStatus === 4 || rawStatus === "delivered" || rawStatus === "read") {
                        await supabase.from("whatsapp_message_retries").delete().eq("id", item.id);
                        await supabase.from("webchat_messages")
                            .update({ status: rawStatus === 4 || rawStatus === "read" ? "read" : "delivered" })
                            .or(`metadata->>evolution_message_id.eq."${pureMessageId}",metadata->>external_id.eq."${pureMessageId}"`);
                        continue;
                    }
                }
            } catch (statusErr) {
                console.warn(`[uazapi-heartbeat] [ACK_WORKER] failed to query status for ${pureMessageId}`, statusErr.message);
            }

            // Update retry count
            const nextRetry = new Date(Date.now() + (Math.pow(2, item.retry_count + 1) * 60000));
            await supabase.from("whatsapp_message_retries").update({
                retry_count: item.retry_count + 1,
                next_retry_at: nextRetry.toISOString(),
                last_status: 'retrying'
            }).eq("id", item.id);

        } catch (err) {
            console.error(`[uazapi-heartbeat] [ACK_WORKER] failed for ${item.message_id}:`, err);
        }
    }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: platformSettings } = await supabase.from("platform_settings").select("*").maybeSingle();
    const payload = await req.json().catch(() => ({}));
    const source = payload.source || 'cron';

    // 1. Manual trigger for specific instance (Test Alert)
    if (payload.action === "test_alert" && payload.instance_id) {
        const { data: inst } = await supabase.from("evolution_instances").select("*").eq("id", payload.instance_id).single();
        if (inst) {
            await sendManualTestAlert(supabase, inst);
            return new Response(JSON.stringify({ ok: true, message: "Alert sent" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
    }

    // 2. Health Monitoring
    let query = supabase.from("evolution_instances").select("*");
    
    if (payload.organization_id) {
        query = query.eq("organization_id", payload.organization_id);
    }

    const { data: instances } = await query;

    if (instances && instances.length > 0) {
        console.log(`[uazapi-heartbeat] processing ${instances.length} instances for sync...`);
        // Uma única consulta de políticas de presence por execução do
        // heartbeat — nunca por instância (custo constante independente da
        // quantidade de conexões).
        // `as any`: mesma instanciação genérica excessivamente profunda de
        // @supabase/supabase-js já contornada em outros pontos desta base
        // (duas instanciações distintas resolvidas via esm.sh) — não é
        // mudança de comportamento.
        const presencePolicies = await loadEnabledPresencePolicies(supabase as any);
        await Promise.all(instances.map(inst => processInstanceHealth(supabase, inst, platformSettings, source, presencePolicies)));
    }

    // 2b. Episódios de desconexão vencidos (confirmação direta na UazAPI + alerta único). Persistente no banco.
    const episodesResult = await processDisconnectEpisodes(supabase, platformSettings);

    // 3. ACK Verification
    await processAckRetries(supabase, platformSettings);

    // `disconnect_episodes.ok=false` (+ error_code) expõe, na própria resposta do cron, que o alerta confirmado está inoperante
    return new Response(JSON.stringify({ ok: true, disconnect_episodes: episodesResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[uazapi-heartbeat] global error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});