import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUazapiTextMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  const debug_version_entry = "WEBCHAT_INBOX_ENTRY_V3";
  console.log("WEBCHAT_INBOX_VERSION", debug_version_entry);
  console.log(`[webchat-inbox] Request received: ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    let bodyJson: any = null;
    if (!action && req.method !== 'GET' && req.method !== 'OPTIONS') {
      try {
        const cloned = req.clone();
        bodyJson = await cloned.json();
        if (bodyJson && typeof bodyJson.action === 'string') {
          action = bodyJson.action;
        }
      } catch (_) { }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const user = { id: authUser.id, email: authUser.email || '' };
    
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle();
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = roles?.some((r: any) => r.role === 'admin' || r.role === 'super_admin') || false;
    const orgId = profile?.organization_id || null;

    if (!orgId && !isAdmin) {
      return new Response(JSON.stringify({ error: 'User has no organization' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const STATUS_ATTENDING = ['human_active', 'bot_active'];
    const STATUS_WAITING = ['waiting_human'];
    const STATUS_RESOLVED = ['closed'];

    if (action === 'conversations') {
      const tab = url.searchParams.get('tab') || 'attending';
      const search = url.searchParams.get('search');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const cursor = url.searchParams.get('cursor');

      let statusFilter = STATUS_ATTENDING;
      if (tab === 'waiting') statusFilter = STATUS_WAITING;
      if (tab === 'resolved') statusFilter = STATUS_RESOLVED;
      if (tab === 'all') statusFilter = [...STATUS_ATTENDING, ...STATUS_WAITING, ...STATUS_RESOLVED];

      try {
        const query = supabase
          .from('webchat_conversations')
          .select('*, leads:lead_id(*), webchat_widgets:widget_id(*), profiles:assigned_user_id(id, full_name, avatar_url), current_agent:current_agent_id(id, name, avatar_url), sectors:sector_id(id, name, color), product:product_id(id, name)')
          .eq('organization_id', orgId)
          .in('status', statusFilter)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(limit);

        if (search) query.or(`visitor_name.ilike.%${search}%,visitor_phone.ilike.%${search}%,visitor_whatsapp.ilike.%${search}%`);
        if (cursor) query.lt('last_message_at', cursor);

        const { data: conversations, error: queryError } = await query;
        if (queryError) throw queryError;

        return new Response(JSON.stringify({ success: true, conversations: conversations || [], next_cursor: conversations?.length === limit ? conversations[conversations.length - 1].last_message_at : null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error_code: 'INBOX_EXCEPTION', message: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'conversation_counts') {
      const [attendingRes, waitingRes, resolvedRes] = await Promise.all([
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', STATUS_ATTENDING),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', STATUS_WAITING),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', STATUS_RESOLVED),
      ]);
      return new Response(JSON.stringify({ attending: attendingRes.count || 0, waiting: waitingRes.count || 0, resolved: resolvedRes.count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'conversation') {
      const id = url.searchParams.get('id');
      const { data: conversation, error: convErr } = await supabase.from('webchat_conversations').select('*, leads:lead_id(*), webchat_widgets:widget_id(*), profiles:assigned_user_id(id, full_name, avatar_url), sectors:sector_id(id, name, color), product:product_id(id, name)').eq('id', id).eq('organization_id', orgId).maybeSingle();
      if (convErr || !conversation) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: messages } = await supabase.from('webchat_messages').select('*, profiles:sender_id(id, full_name, avatar_url), reply_to:reply_to_message_id(id, content, sender_type)').eq('conversation_id', id).order('created_at', { ascending: true });
      return new Response(JSON.stringify({ conversation, messages: messages || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'send' && req.method === 'POST') {
      let body = bodyJson || await req.json();
      const { data: conversation } = await supabase.from('webchat_conversations').select('*').eq('id', body.conversation_id).eq('organization_id', orgId).single();
      if (!conversation) return new Response(JSON.stringify({ success: false, error_code: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let lead: any = null;
      if (conversation.lead_id) {
        const { data: leadData } = await supabase.from('leads').select('*').eq('id', conversation.lead_id).maybeSingle();
        lead = leadData;
      }

      const rawPhone = conversation.visitor_whatsapp || conversation.visitor_phone || lead?.whatsapp || lead?.phone;
      if (!rawPhone && conversation.channel === 'whatsapp') return new Response(JSON.stringify({ success: false, error_code: 'MISSING_PHONE', message: 'Telefone não encontrado.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      let phone = (rawPhone || '').replace(/\D/g, '');
      if (phone.length >= 10 && phone.length <= 11 && !phone.startsWith('55')) phone = '55' + phone;

      // PRIORIDADE DE RESOLUÇÃO DA INSTÂNCIA (UAZAPI/EVOLUTION)
      // 1. conversation.evolution_instance_id (Conexão exibida no painel)
      // 2. lead.evolution_instance_id (Se vinculado ao lead)
      // 3. Somente se nenhum estiver definido, usa a padrão online da org
      
      let resolvedInstanceId = conversation.evolution_instance_id || lead?.evolution_instance_id || lead?.uazapi_instance_id || lead?.connection_id;
      let resolutionSource = conversation.evolution_instance_id ? "conversation" : (lead?.evolution_instance_id ? "lead" : "none");

      // Auditoria e Debug
      const { data: allInstances } = await supabase
        .from('evolution_instances')
        .select('id, name, phone_number, status')
        .eq('organization_id', orgId);
      
      const resolvedInstance = allInstances?.find(i => i.id === resolvedInstanceId);
      
      console.log("[webchat-inbox] INSTANCE_RESOLUTION_DEBUG", {
        conversation_id: conversation.id,
        lead_id: conversation.lead_id,
        conversation_connection_id: conversation.evolution_instance_id,
        lead_connection_id: lead?.evolution_instance_id,
        resolved_connection_id: resolvedInstanceId,
        resolved_connection_name: resolvedInstance?.name,
        resolved_connection_phone: resolvedInstance?.phone_number,
        resolution_source: resolutionSource
      });

      // Se já existia uma conexão definida mas ela não foi encontrada ou está offline
      if (resolvedInstanceId && (!resolvedInstance || (resolvedInstance.status !== 'connected' && resolvedInstance.status !== 'online'))) {
         // Opcional: Se for offline, podemos decidir se permitimos fallback ou bloqueamos.
         // O requisito diz "Não deve usar fallback automático para outra instância quando já existe conexão vinculada"
         console.warn(`[webchat-inbox] Connection ${resolvedInstanceId} is offline or not found. Status: ${resolvedInstance?.status}`);
      }

      if (!resolvedInstanceId) {
        const defaultInst = allInstances?.filter(i => i.status === 'connected' || i.status === 'online')
          .sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1))[0];
        
        resolvedInstanceId = defaultInst?.id || null;
        resolutionSource = "fallback_default";
      }

      if (!resolvedInstanceId && conversation.channel === 'whatsapp') {
        return new Response(JSON.stringify({ 
          success: false, 
          error_code: 'MISSING_CONNECTION', 
          message: 'Instância offline ou não vinculada.',
          debug: {
            conversation_id: conversation.id,
            resolved_connection_id: null
          }
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const insertData: any = { conversation_id: body.conversation_id, direction: 'outbound', sender_type: 'agent', sender_id: user.id, content: body.content || '', status: 'sending', metadata: { ...(body.client_temp_id ? { client_temp_id: body.client_temp_id } : {}), source: 'manual_chat' } };
      if (body.reply_to_message_id) insertData.reply_to_message_id = body.reply_to_message_id;
      if (body.media) { insertData.content_type = body.media.kind; insertData.metadata.media = body.media; }
      const { data: message, error: msgError } = await supabase.from('webchat_messages').insert(insertData).select('*, profiles:sender_id(id, full_name, avatar_url)').single();
      if (msgError) return new Response(JSON.stringify({ error: 'Erro ao salvar no banco.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (conversation.channel === 'whatsapp') {
        try {
          const { data: sendData, error: invokeErr } = await supabase.functions.invoke("uazapi-send", {
            body: {
              organization_id: orgId,
              instance_id: resolvedInstanceId,
              type: body.media ? body.media.kind : "text",
              to: phone,
              payload: {
                ...body.media ? { ...body.media } : {},
                text: body.content,
                skip_warmup: true
              }
            }
          });

          const result = invokeErr || !sendData ? { success: false, message: invokeErr?.message || "Erro ao invocar uazapi-send" } : sendData;

          if (!result.success) {
            await supabase.from('webchat_messages').update({ 
              status: 'failed', 
              metadata: { 
                ...message.metadata, 
                delivery_status: 'failed', 
                error: result.message, 
                uazapi_response: result.debug || result,
                debug_version: "chat-send-uses-direct-uazapi-v7",
                called_path: "webchat-inbox -> uazapi-send"
              } 
            }).eq('id', message.id);
            return new Response(JSON.stringify({
              ...result,
              debug_version: "chat-send-uses-direct-uazapi-v7",
              called_path: "webchat-inbox -> uazapi-send",
              endpoint_final: result.debug?.endpoint_final
            }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          await supabase.from('webchat_messages').update({ status: 'sent', metadata: { ...message.metadata, external_id: result.external_id } }).eq('id', message.id);
        } catch (err: any) {
          await supabase.from('webchat_messages').update({ status: 'failed' }).eq('id', message.id);
          return new Response(JSON.stringify({ success: false, error_code: 'EXCEPTION', message: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        await supabase.from('webchat_messages').update({ status: 'sent' }).eq('id', message.id);
      }

      try {
        const channel = supabase.channel(`conversation:${body.conversation_id}`);
        await channel.send({ type: 'broadcast', event: 'new_message', payload: { ...message, status: 'sent' } });
        await supabase.removeChannel(channel);
      } catch (_) {}

      return new Response(JSON.stringify({ success: true, message_id: message.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'trigger-flow') {
      const body = bodyJson || await req.json();
      const conversationId = body.conversation_id;
      const flowId = body.flow_id;
      const debug_version = "manual-flow-send-v2";

      console.log("manual_funnel_start_requested", { debug_version, action, conversationId, flowId, orgId, userId: user.id });

      if (!conversationId || !flowId) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'MISSING_PARAMS',
          message: 'conversation_id e flow_id são obrigatórios.',
          debug: { conversationId, flowId, step_failed: 'validate_params' }
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 1. Carregar conversa
      const { data: conv, error: convErr } = await supabase
        .from('webchat_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('organization_id', orgId)
        .single();

      if (convErr || !conv) {
        console.error("manual_funnel_conversation_not_found", convErr);
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversa não encontrada.',
          debug: { conversationId, step_failed: 'load_conversation', raw_error: convErr?.message }
        }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log("manual_funnel_conversation_loaded", { conversationId });

      // 2. Carregar lead
      let leadId = conv.lead_id;
      if (!leadId) {
        // Tenta achar pelo telefone
        const phone = conv.visitor_phone_normalized || conv.visitor_phone;
        const { data: lead } = await supabase.from('leads').select('id').eq('phone_normalized', phone).eq('organization_id', orgId).maybeSingle();
        leadId = lead?.id;
      }
      console.log("manual_funnel_lead_loaded", { leadId });

      // 3. Carregar funnel
      const { data: funnel, error: funnelErr } = await supabase
        .from('capture_funnels')
        .select('*')
        .eq('id', flowId)
        .eq('organization_id', orgId)
        .single();

      if (funnelErr || !funnel) {
        console.error("manual_funnel_selected_funnel_not_found", funnelErr);
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'FUNNEL_NOT_FOUND',
          message: 'Funil não encontrado.',
          debug: { flowId, step_failed: 'load_funnel', raw_error: funnelErr?.message }
        }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log("manual_funnel_selected_funnel_loaded", { flowId });

      // 4. Validar blocos
      const blocks = (funnel.flow_blocks as any[]) || [];
      if (blocks.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'FUNNEL_HAS_NO_BLOCKS',
          message: 'Este funil não possui blocos.',
          debug: { flowId, step_failed: 'validate_blocks' }
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const startBlockId = funnel.start_block_id || blocks[0]?.id;
      if (!startBlockId) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'FUNNEL_START_BLOCK_NOT_FOUND',
          message: 'Não foi encontrado bloco inicial no funil.',
          debug: { flowId, step_failed: 'resolve_start_block' }
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log("manual_funnel_start_block_resolved", { startBlockId });

      // 5. Connection ID
      const connectionId = conv.evolution_instance_id || leadId ? (await supabase.from('leads').select('connection_id').eq('id', leadId).single()).data?.connection_id : null;
      if (!connectionId && conv.channel === 'whatsapp') {
         return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'MISSING_CONVERSATION_CONNECTION',
          message: 'Instância não vinculada à conversa.',
          debug: { conversationId, step_failed: 'validate_connection' }
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log("manual_funnel_connection_loaded", { connectionId });

      // 6. Parar execução anterior (se existir)
      if (conv.current_flow_id) {
        console.log("manual_funnel_previous_stopped", { previous_flow_id: conv.current_flow_id });
      }

      // 7. Atualizar conversa para iniciar o funil
      // O uazapi-webhook index.ts lida com a execução quando detecta um funil ativo.
      // Aqui nós apenas setamos os campos e "provocamos" o início enviando um sinal de resume.
      const { error: updateErr } = await supabase
        .from('webchat_conversations')
        .update({
          status: 'bot_active',
          current_flow_id: flowId,
          current_block_id: startBlockId,
          flow_variables: {},
          flow_completed: false,
          flow_source: 'funnel',
          current_agent_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateErr) {
        console.error("manual_funnel_execution_update_failed", updateErr);
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'EXECUTION_CREATE_FAILED',
          message: 'Erro ao iniciar execução no banco.',
          debug: { conversationId, step_failed: 'update_conversation', raw_error: updateErr.message }
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 8. Chamar uazapi-webhook action: resume_funnel para disparar a primeira mensagem IMEDIATAMENTE
      console.log("manual_funnel_first_block_execute", { conversationId, startBlockId });
      
      const { data: webhookRes, error: webhookInvokeErr } = await supabase.functions.invoke('uazapi-webhook', {
        body: {
          action: 'resume_funnel',
          conversationId: conversationId
        }
      });

      if (webhookInvokeErr || (webhookRes && webhookRes.success === false)) {
        console.error("manual_funnel_webhook_resume_failed", webhookInvokeErr || webhookRes);
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          called_action: action,
          error_code: 'WEBHOOK_RESUME_FAILED',
          message: webhookRes?.message || webhookInvokeErr?.message || 'Erro ao disparar primeira mensagem do funil.',
          debug: { 
            conversationId, 
            step_failed: 'webhook_resume', 
            raw_error: webhookInvokeErr?.message,
            webhook_response: webhookRes 
          }
        }), { 
          status: (webhookInvokeErr as any)?.status || 502, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      console.log("manual_funnel_start_success", { conversationId, webhookRes });

      return new Response(JSON.stringify({ 
        success: true, 
        debug_version,
        called_action: action,
        message: 'Funil iniciado com sucesso.',
        execution: {
          flow_id: flowId,
          start_block_id: startBlockId
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'assign' || action === 'close' || action === 'mark-read' || action === 'stop-flow') {

      const body = bodyJson || await req.json();
      if (action === 'assign') await supabase.from('webchat_conversations').update({ assigned_user_id: user.id, status: 'human_active' }).eq('id', body.conversation_id);
      if (action === 'close') await supabase.from('webchat_conversations').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', body.conversation_id);
      if (action === 'mark-read') { await supabase.from('webchat_messages').update({ status: 'read' }).eq('conversation_id', body.conversation_id).eq('direction', 'inbound'); await supabase.from('webchat_conversations').update({ unread_count_agents: 0 }).eq('id', body.conversation_id); }
      if (action === 'stop-flow') await supabase.from('webchat_conversations').update({ current_flow_id: null, status: 'human_active' }).eq('id', body.conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Action not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Global error:', error);
    return new Response(JSON.stringify({ error: 'Internal error', detail: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
