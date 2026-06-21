import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format } from "https://deno.land/std@0.207.0/datetime/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    
    // [UAZAPI_RAW_STATUS_GHOST]
    console.log(`[UAZAPI_RAW_STATUS_GHOST] instance=${inst.name}`, JSON.stringify(statusData));

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
        
        // Critical status update to trigger alert if not already logged_out
        if (inst.status !== "logged_out") {
            await handleAdminStatusAlert(supabase, inst, "logged_out", "Session disconnected/Logged out");
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
        
        // If not already in a failing state, trigger an alert for Ghost Connection
        // Impedir alerta se o motivo for wa_state e estiver em modo debounce/retry (implementado via rate limit de 30min já existente)
        // E NÃO disparar se for um falso positivo de estado
        if (inst.last_real_whatsapp_state === "CONNECTED" || inst.status === "connected") {
             await handleAdminStatusAlert(supabase, inst, "ghost", `Ghost detected: ${reasons.join(", ")}`);
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
 * Admin Notification Logic for Connection Status Changes
 */
async function handleAdminStatusAlert(supabase: any, instance: any, newState: string, reason: string) {
  try {
    const oldStatus = instance.status;
    const oldRealState = instance.last_real_whatsapp_state;
    const orgId = instance.organization_id;

    // Normalizing states for comparison
    const normalizedNew = newState.toLowerCase();
    const normalizedOld = (oldRealState || oldStatus || "").toLowerCase();

    // Critical statuses that MUST drop the "API Principal" and trigger alerts
    const criticalStatuses = ["offline", "disconnected", "error", "waiting_qr", "logged_out", "close", "restricted", "ghost"];
    const isCritical = criticalStatuses.includes(normalizedNew);

    // Update DB status immediately
    const now = new Date().toISOString();
    const updates: any = {
      last_health_at: now,
      last_real_whatsapp_ping: now,
      last_real_whatsapp_state: newState.toUpperCase(),
      updated_at: now
    };

    // If critical, force status to disconnected to drop "UazAPI Online" in UI
    if (isCritical) {
       updates.status = "disconnected";
    } else if (normalizedNew === "connected" || normalizedNew === "open") {
       updates.status = "connected";
    }

    await supabase.from("evolution_instances").update(updates).eq("id", instance.id);

    // 1. Get organization settings for notifications
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("admin_status_notify_phone")
      .eq("id", orgId)
      .single();

    if (orgError || !org?.admin_status_notify_phone) return;

    const notifyPhone = org.admin_status_notify_phone;

    // 2. Rate limit check: max 1 alert per 30 mins for same instance + status (as requested)
    const cooldownMins = 30;
    const cooldownAgo = new Date(Date.now() - cooldownMins * 60 * 1000).toISOString();
    
    const { data: recentAlert } = await supabase
      .from("admin_status_alerts")
      .select("id")
      .eq("connection_id", instance.id)
      .eq("new_status", newState)
      .gte("created_at", cooldownAgo)
      .limit(1)
      .maybeSingle();

    if (recentAlert) {
      console.log(`[uazapi-heartbeat] Skip alert for ${instance.name} (${newState}) - Rate limited`);
      return;
    }

    // 3. Send Notification via WhatsApp (using a fallback instance or system instance)
    const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");
    const emoji = isCritical ? "⚠️" : "ℹ️";
    const title = isCritical ? "ALERTA CRM - Conexão Problema" : "INFO CRM - Status de Conexão";
    
    const message = `${emoji} *${title}*\n\n*Instância:* ${instance.name}\n*Número:* +${instance.phone_number || "Desconhecido"}\n*Estado Anterior:* ${oldRealState || oldStatus}\n*Estado Atual:* ${newState}\n*Motivo:* ${reason}\n*Horário:* ${timestamp}\n\n_Ação sugerida: Verifique a instância no painel de Conexões._`;

    // Find a healthy instance to send the alert
    const { data: sender } = await supabase
        .from("evolution_instances")
        .select("*")
        .eq("status", "connected")
        .eq("organization_id", orgId)
        .limit(1)
        .maybeSingle();

    if (!sender) {
        console.warn(`[uazapi-heartbeat] No healthy instance to send alert for org ${orgId}`);
        return;
    }


    // 4. Log to admin_notification_logs
    const logData = {
        organization_id: orgId,
        connection_id: instance.id,
        instance_name: instance.name,
        old_status: oldRealState || oldStatus,
        new_status: newState,
        reason: reason,
        sent_to: notifyPhone,
        payload: { message },
        created_at: now
    };

    // Trigger WhatsApp send using uazapi-send (the official channel used by CRM)
    const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-send`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            organization_id: orgId,
            instance_id: sender.id, // ID of the connected instance
            type: "text",
            to: notifyPhone,
            payload: { 
                text: message,
                skip_warmup: true 
            }
        })
    });

    const sendResult = await sendRes.json().catch(() => ({ error: "Failed to parse response" }));
    const success = sendRes.ok && sendResult.success === true;

    await supabase.from("admin_notification_logs").insert({
        ...logData,
        success: success,
        send_response: sendResult,
        error: success ? null : JSON.stringify(sendResult)
    });


    // Also record in legacy admin_status_alerts for compatibility
    await supabase.from("admin_status_alerts").insert({
        organization_id: orgId,
        connection_id: instance.id,
        connection_name: instance.name,
        connection_phone: instance.phone_number,
        old_status: oldRealState || oldStatus,
        new_status: newState,
        notify_phone: notifyPhone,
        message: message,
        status: success ? "sent" : "error",
        error_message: success ? null : JSON.stringify(sendResult)

    });

  } catch (err) {
    console.error("[uazapi-heartbeat] Error in handleAdminStatusAlert:", err);
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

async function processInstanceHealth(supabase: any, inst: any, platformSettings: any, source: string = 'cron') {

    const uazapiUrl = String(platformSettings?.uazapi_url || "").replace(/\/$/, "");
    const token = inst.instance_token || platformSettings?.uazapi_admin_token;
    
    if (!token || !uazapiUrl) return;

    try {
        const res = await fetch(`${uazapiUrl}/instance/status`, {
            method: "GET",
            headers: { "token": token }
        });

        const data = await res.json().catch(() => ({}));
        
        // [UAZAPI_RAW_STATUS] CRITICAL LOG
        console.log(`[UAZAPI_RAW_STATUS] instance=${inst.name}`, JSON.stringify(data));
        
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

        // Logic for alerting and status sync
        const oldRealState = inst.last_real_whatsapp_state;
        const healthNow = new Date().toISOString();
        
        // [PROFILE_SYNC_START]
        let metadataUpdates: any = {};
        if (isConnected) {
            console.log(`[PROFILE_SYNC_RAW] instance=${inst.name}`, JSON.stringify(data));
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

        if (oldRealState === "CONNECTED" && !isConnected) {
            // Queda detectada!
            if (source !== 'manual_sync') {
                await handleAdminStatusAlert(supabase, inst, stateStr, "Heartbeat detected disconnect");
            }
        } else if (oldRealState !== "CONNECTED" && isConnected) {
            // RECUPERAÇÃO DETECTADA!
            if (source !== 'manual_sync') {
                await handleAdminStatusAlert(supabase, inst, stateStr, "Heartbeat detected recovery/reconnection");
            }
            
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
            try {
                const statusRes = await fetch(`${uazapiUrl}/message/status?id=${item.message_id}&number=${item.remote_jid}`, {
                    headers: { "token": token }
                });
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const rawStatus = statusData.status || statusData.data?.status;
                    if (rawStatus === 3 || rawStatus === 4 || rawStatus === "delivered" || rawStatus === "read") {
                        await supabase.from("whatsapp_message_retries").delete().eq("id", item.id);
                        await supabase.from("webchat_messages")
                            .update({ status: rawStatus === 4 || rawStatus === "read" ? "read" : "delivered" })
                            .or(`metadata->>evolution_message_id.eq."${item.message_id}",metadata->>external_id.eq."${item.message_id}"`);
                        continue;
                    }
                }
            } catch (statusErr) {
                console.warn(`[uazapi-heartbeat] [ACK_WORKER] failed to query status for ${item.message_id}`, statusErr.message);
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
            await handleAdminStatusAlert(supabase, inst, "TEST", "Manual trigger via Test Alert button");
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
        await Promise.all(instances.map(inst => processInstanceHealth(supabase, inst, platformSettings, source)));
    }

    // 3. ACK Verification
    await processAckRetries(supabase, platformSettings);

    return new Response(JSON.stringify({ ok: true }), {
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