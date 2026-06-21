import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WhatsAppConfig {
  url: string;
  globalApiKey: string;
  provider: 'uazapi' | 'evolution';
}

async function waFetch(
  config: WhatsAppConfig,
  path: string,
  init: RequestInit = {},
  instanceToken?: string,
  isAdmin: boolean = false
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };

  if (config.provider === "uazapi") {
    if (isAdmin) {
      headers["adminToken"] = config.globalApiKey;
    } else {
      headers["token"] = instanceToken || config.globalApiKey;
    }
  } else {
    headers["apikey"] = instanceToken || config.globalApiKey;
  }

  console.log(`[waFetch] ${init.method || "GET"} ${config.url}${path} (provider: ${config.provider}, isAdmin: ${isAdmin})`);
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, { ...init, headers });
    if (res.status === 401) {
      console.log(`[waFetch] 401 on ${path}, retrying with Authorization header`);
      const authHeaders = { ...headers, "Authorization": `Bearer ${instanceToken || config.globalApiKey}` };
      const authRes = await fetch(`${config.url}${path}`, { ...init, headers: authHeaders });
      if (authRes.ok) res = authRes;
    }
  } catch (err: any) {
    console.error(`[waFetch] Error fetching ${config.url}${path}:`, err);
    return { ok: false, status: 0, body: null, message: `Falha ao conectar em ${config.url}: ${err.message}` };
  }
  const text = await res.text();
  console.log(`[waFetch] Response ${res.status}: ${text.slice(0, 500)}`);
  let body: any;
  let isJson = false;
  try {
    body = text ? JSON.parse(text) : null;
    isJson = true;
  } catch {
    body = text;
    isJson = false;
  }
  let message: string | undefined;
  if (!res.ok) {
    if (!isJson && typeof body === "string") {
      message = `Servidor respondeu ${res.status}: ${body.slice(0, 200)}`;
    } else if (isJson && body?.message) {
      message = String(body.message);
    } else if (isJson && body?.error) {
      message = String(body.error);
    }
  }
  return { ok: res.ok, status: res.status, body, message, isJson };
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }
  return raw;
}

function extractQr(obj: any): string | null {
  if (!obj) return null;
  const normalized = normalizeQrString(obj);
  if (normalized) return normalized;
  const candidates = [
    obj.qrcode, obj.qr, obj.base64, obj.code, obj.QRCode, obj.qr_code,
    obj?.qrcode?.base64, obj?.qrcode?.code,
    obj?.data?.qrcode, obj?.data?.qr, obj?.data?.base64, obj?.data?.QRCode, obj?.data?.code,
    obj?.data?.qrcode?.base64, obj?.data?.qrcode?.code,
    obj?.instance?.qrcode, obj?.instance?.qr,
  ];
  for (const c of candidates) {
    const found = extractQr(c);
    if (found) return found;
  }
  return null;
}

function parseInstanceFromList(item: any, provider: string = "uazapi") {
  const name: string = item?.name || item?.instanceName || item?.instance?.instanceName || item?.instance?.name || item?.instance_name;
  const uuid: string | null = item?.id ?? item?.instanceId ?? item?.instance?.id ?? item?.instance?.instanceId ?? item?.instanceName ?? item?.name ?? item?.instance_id ?? null;
  const token = item?.token ?? item?.apikey ?? item?.hash?.apikey ?? item?.instance_token ?? item?.instance?.token ?? item?.instance?.apikey ?? null;
  const connected = item?.status === "connected" || item?.status === "online" || item?.connected === true || item?.instance?.status === "connected";
  const qrcode = extractQr(item?.qrcode ?? item?.qr ?? item?.instance?.qrcode ?? item);
  const status = connected ? "connected" : (qrcode && String(qrcode).length > 10 ? "qr_pending" : "disconnected");
  return { name, uuid, token, status };
}

Deno.serve(async (req) => {
  const requestId = Math.random().toString(36).substring(7);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const internalKey = req.headers.get("x-internal-key") || req.headers.get("apikey");
    const isServiceRole = (authHeader.includes(serviceRoleKey) || internalKey === serviceRoleKey);

    let user = null;
    if (!isServiceRole && authHeader) {
      const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      user = userData?.user;
    }

    if (!user && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action = body.action || new URL(req.url).searchParams.get("action");
    console.log(`[${requestId}] [UAZAPI_ACTION] Action: ${action}`);

    const { data: settings } = await supabase.from("platform_settings").select("uazapi_url, uazapi_admin_token, whatsapp_provider").maybeSingle();
    const config: WhatsAppConfig = {
      url: (settings?.uazapi_url || "https://crmx1.uazapi.com").replace(/\/$/, ""),
      globalApiKey: settings?.uazapi_admin_token || "",
      provider: settings?.whatsapp_provider || 'uazapi'
    };

    const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook`;
    const defaultEvents = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONTACTS_UPSERT", "PRESENCE_UPDATE", "CHATS_UPSERT", "messages", "connection", "qrcode", "messages_update"];

    if (action === "create_instance_self") {

      const { name, offer_name } = body;
      if (!name) return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers: corsHeaders });

      let organization_id = body.organization_id;
      if (!organization_id && user) {
        const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
        organization_id = profile?.organization_id;
      }

      if (!organization_id) return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: corsHeaders });

      const res = await waFetch(config, "/instance/create", {
        method: "POST",
        body: JSON.stringify({ name, provider: 'uazapi' })
      }, undefined, true);

      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, error: res.message }), { status: res.status, headers: corsHeaders });
      }

      const instanceData = parseInstanceFromList(res.body, 'uazapi');
      if (!instanceData.uuid || !instanceData.token) {
        return new Response(JSON.stringify({ ok: false, error: "UazAPI retornou dados inválidos" }), { status: 500, headers: corsHeaders });
      }

      // [WEBHOOK_AUTO_REPAIR] Set webhook immediately after creation
      await waFetch(config, `/webhook/set`, {
        method: "POST",
        body: JSON.stringify({ url: webhookUrl, enabled: true, events: defaultEvents })
      }, instanceData.token);


      // [PROFILE_SYNC_START]
      let metadata: any = {};
      if (instanceData.status === 'connected') {
        const metaRes = await waFetch(config, "/instance/status", { method: "GET" }, instanceData.token);
        if (metaRes.ok) {
          const payload = metaRes.body || {};
          const instanceInfo = payload.instance || {};
          
          const raw_phone_number = 
            payload.number || 
            instanceInfo.number || 
            instanceInfo.owner ||
            (payload.status?.jid ? String(payload.status.jid).split('@')[0].split(':')[0] : null) ||
            null;

          metadata = {
            push_name: payload.pushName || instanceInfo.pushName || null,
            profile_picture_url: payload.profilePicUrl || instanceInfo.profilePicUrl || null,
            phone_number: raw_phone_number || null,
            last_real_whatsapp_state: (payload.status || instanceInfo.status || 'CONNECTED').toUpperCase()
          };
        }
      }

      const { data: inserted, error: dbError } = await supabase.from("evolution_instances").insert({
        organization_id,
        name: instanceData.name || name,
        instance_id: instanceData.uuid,
        instance_token: instanceData.token,
        status: instanceData.status || 'disconnected',
        provider: 'uazapi',
        offer_name: offer_name || null,
        is_active: true,
        webhook_status: 'ok',
        webhook_url: webhookUrl,
        webhook_events: defaultEvents,
        last_webhook_check_at: new Date().toISOString(),
        ...metadata
      }).select().single();

      if (dbError) throw dbError;
      
      return new Response(JSON.stringify({ ok: true, instance: inserted }), { headers: corsHeaders });
    }

    if (action === "repair_webhook" || action === "check_webhook") {
      const id = body.id || body.instance_id;
      if (!id) return new Response(JSON.stringify({ error: "ID is required" }), { status: 400, headers: corsHeaders });
      
      const { data: instance } = await supabase.from("evolution_instances").select("*").or(`id.eq.${id},instance_id.eq.${id}`).single();
      if (!instance) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

      if (action === "repair_webhook") {
        const res = await waFetch(config, `/webhook/set`, {
          method: "POST",
          body: JSON.stringify({ url: webhookUrl, enabled: true, events: defaultEvents })
        }, instance.instance_token);

        // Retry with /webhook if /webhook/set fails
        if (!res.ok) {
           await waFetch(config, `/webhook`, {
            method: "POST",
            body: JSON.stringify({ url: webhookUrl, enabled: true, events: defaultEvents })
          }, instance.instance_token);
        }


        const status = res.ok ? 'ok' : 'broken';
        await supabase.from("evolution_instances").update({
          webhook_status: status,
          webhook_url: webhookUrl,
          webhook_events: defaultEvents,
          last_webhook_check_at: new Date().toISOString(),
          webhook_subscribed: res.ok
        }).eq("id", instance.id);

        return new Response(JSON.stringify({ ok: res.ok, status, message: res.message }), { headers: corsHeaders });
      } else {
        // action === "check_webhook"
        // Try /webhook/instance first, then /webhook
        let res = await waFetch(config, `/webhook/instance/${instance.name}`, { method: "GET" }, instance.instance_token);
        if (!res.ok) {
           res = await waFetch(config, `/webhook`, { method: "GET" }, instance.instance_token);
        }

        let status = 'broken';
        let remoteEvents = [];
        let remoteUrl = "";

        if (res.ok && res.body) {
            const webhook = Array.isArray(res.body) ? res.body[0] : res.body;
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

        await supabase.from("evolution_instances").update({
          webhook_status: status,
          webhook_url: remoteUrl,
          webhook_events: remoteEvents,
          last_webhook_check_at: new Date().toISOString()
        }).eq("id", instance.id);

        return new Response(JSON.stringify({ ok: true, status, remoteUrl, remoteEvents }), { headers: corsHeaders });
      }
    }

    if (action === "connect_instance") {
      const id = body.id;
      if (!id) return new Response(JSON.stringify({ error: "ID is required" }), { status: 400, headers: corsHeaders });
      const { data: instance } = await supabase.from("evolution_instances").select("*").eq("id", id).single();
      if (!instance) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

      const res = await waFetch(config, "/instance/connect", { method: "POST", body: JSON.stringify({ browser: "auto" }) }, instance.instance_token);
      if (res.ok) {
        const qrcode = extractQr(res.body);
        if (qrcode) {
          await supabase.from("evolution_instances").update({ qr_code: qrcode, status: "qr_pending" }).eq("id", id);
          return new Response(JSON.stringify({ ok: true, qr_code: qrcode }), { headers: corsHeaders });
        }
      }
      return new Response(JSON.stringify({ ok: res.ok, error: res.message }), { headers: corsHeaders });
    }

    if (action === "delete_instance_self") {
      const id = body.id;
      const { data: instance } = await supabase.from("evolution_instances").select("*").eq("id", id).single();
      if (instance) {
        // 1) Remove do banco primeiro (fonte da verdade do painel)
        const { error: dbErr } = await supabase.from("evolution_instances").delete().eq("id", id);
        if (dbErr) {
          console.error(`[${requestId}] [DELETE_SELF] DB delete failed:`, dbErr);
          return new Response(JSON.stringify({ ok: false, error: dbErr.message }), { status: 500, headers: corsHeaders });
        }
        console.log(`[${requestId}] [DELETE_SELF] DB row deleted: ${id} (${instance.name})`);

        // 2) Remoção remota na UazAPI: best-effort com timeout de 10s (não bloqueia a limpeza)
        let remote: { ok: boolean; status?: number; message?: string } = { ok: false };
        try {
          const res = await waFetch(
            config,
            `/instance/remove/${instance.name}`,
            { method: "DELETE", signal: AbortSignal.timeout(10000) },
            instance.instance_token,
            true
          );
          remote = { ok: res.ok, status: res.status, message: res.message };
        } catch (err: any) {
          console.error(`[${requestId}] [DELETE_SELF] Remote remove failed/timeout:`, err?.message);
          remote = { ok: false, message: err?.message || "timeout" };
        }
        console.log(`[${requestId}] [DELETE_SELF] Remote result:`, JSON.stringify(remote));
        return new Response(JSON.stringify({ ok: true, remote }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true, alreadyGone: true }), { headers: corsHeaders });
    }

    if (action === "sync_instances") {
      const orgId = body.organization_id;
      const source = body.source || 'manual_sync';

      await supabase.functions.invoke("uazapi-heartbeat", {
        body: { action: "sync", organization_id: orgId, source }
      }).catch(err => console.error("[whatsapp-proxy] sync trigger error:", err));

      const res = await waFetch(config, "/instance/list", { method: "GET" }, undefined, true);
      if (res.ok && Array.isArray(res.body)) {
        for (const item of res.body) {
          const parsed = parseInstanceFromList(item, 'uazapi');
          if (parsed.uuid) {
            await supabase.from("evolution_instances").update({ status: parsed.status }).eq("instance_id", parsed.uuid).eq("organization_id", orgId);
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Action not found" }), { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error(`[${requestId}] Error:`, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

