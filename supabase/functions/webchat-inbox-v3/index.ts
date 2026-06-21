
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Funcao para enfileirar a execucao de um bloco.
 */
async function queueFunnelJob(supabase: any, params: {
  organization_id: string;
  conversation_id: string;
  lead_id: string;
  connection_id: string;
  flow_id: string;
  start_block_id: string;
  created_by?: string;
  metadata?: any;
}) {
  console.log(`[funnel-queue] Queuing job for conversation ${params.conversation_id}`);
  
  const { data, error } = await supabase
    .from('funnel_execution_jobs')
    .insert({
      organization_id: params.organization_id,
      conversation_id: params.conversation_id,
      lead_id: params.lead_id,
      connection_id: params.connection_id,
      flow_id: params.flow_id,
      start_block_id: params.start_block_id,
      created_by: params.created_by,
      status: 'pending',
      metadata: params.metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const debug_version = "MANUAL_FLOW_TRIGGER_V3";
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        success: false, 
        debug_version, 
        error: 'Unauthorized',
        debug_entry: "WEBCHAT_INBOX_ENTRY_V3" 
      }), { status: 401, headers });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ 
        success: false, 
        debug_version, 
        error: 'Invalid token',
        debug_entry: "WEBCHAT_INBOX_ENTRY_V3" 
      }), { status: 401, headers });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const body = await req.json().catch(() => ({}));
    
    // TAFEFA 3: Log de entrada
    console.log("WEBCHAT_INBOX_ENTRY_V3", {
      action: action || body.action,
      method: req.method,
      url: req.url,
      userId: authUser.id
    });

    const effectiveAction = action || body.action;

    if (effectiveAction === 'trigger-flow') {
      const conversationId = body.conversation_id;
      const flowId = body.flow_id;

      if (!conversationId || !flowId) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          called_action: "trigger-flow",
          error_code: 'MISSING_PARAMS',
          message: 'conversation_id e flow_id são obrigatórios.',
          debug: { conversationId, flowId, step_failed: 'validate_params' }
        }), { status: 200, headers }); // TAREFA 5: Retornar 200 com success:false para debug
      }

      // 1. Carregar conversa
      const { data: conv, error: convErr } = await supabase
        .from('webchat_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (convErr || !conv) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          called_action: "trigger-flow",
          error_code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversa não encontrada.',
          debug: { conversationId, step_failed: 'load_conversation', raw_error: convErr?.message }
        }), { status: 200, headers });
      }

      // 2. Carregar funnel
      const { data: funnel, error: funnelErr } = await supabase
        .from('capture_funnels')
        .select('*')
        .eq('id', flowId)
        .single();

      if (funnelErr || !funnel) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          called_action: "trigger-flow",
          error_code: 'FUNNEL_NOT_FOUND',
          message: 'Funil não encontrado.',
          debug: { flowId, step_failed: 'load_funnel', raw_error: funnelErr?.message }
        }), { status: 200, headers });
      }

      const blocks = (funnel.flow_blocks as any[]) || [];
      const startBlockId = funnel.start_block_id || blocks[0]?.id;

      if (!startBlockId) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          called_action: "trigger-flow",
          error_code: 'START_BLOCK_NOT_FOUND',
          message: 'Bloco inicial não encontrado no funil.',
          debug: { flowId, step_failed: 'resolve_start_block' }
        }), { status: 200, headers });
      }

      // 3. Proteção anti-duplicação: Verificar se já existe job pendente/rodando
      const { data: existingJob } = await supabase
        .from('funnel_execution_jobs')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('flow_id', flowId)
        .in('status', ['pending', 'running'])
        .maybeSingle();

      if (existingJob) {
        return new Response(JSON.stringify({
          success: true,
          already_running: true,
          job_id: existingJob.id,
          message: 'Este funil já está em execução (ou na fila) para este atendimento.'
        }), { headers });
      }

      // 4. Atualizar conversa (Marca o estado como bot_active mas o runner fará o envio)
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
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'DB_UPDATE_FAILED',
          message: 'Falha ao atualizar estado da conversa.',
          debug: { conversationId, step_failed: 'update_conversation', raw_error: updateErr.message }
        }), { status: 200, headers });
      }

      // 5. Enfileirar execução (ASSÍNCRONO)
      try {
        const job = await queueFunnelJob(supabase, {
          organization_id: conv.organization_id,
          conversation_id: conversationId,
          lead_id: conv.lead_id,
          connection_id: conv.connection_id,
          flow_id: flowId,
          start_block_id: startBlockId,
          created_by: authUser.id,
          metadata: { trigger_type: 'manual_funnel_start' }
        });
        
        // 6. Chamar o runner imediatamente (ASSÍNCRONO/FIRE-AND-FORGET)
        // Isso garante que o funil comece a rodar em segundos, sem esperar o cron de 1 min.
        supabase.functions.invoke('funnel-job-runner').catch((err: any) => {
          console.error("[webchat-inbox-v3] Failed to trigger runner:", err);
        });

        return new Response(JSON.stringify({
          success: true,
          queued: true,
          debug_version,
          job_id: job.id,
          message: 'Funil enfileirado para envio imediato'
        }), { headers });
      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          debug_version,
          error_code: 'QUEUE_FAILED',
          message: 'Não foi possível enfileirar o funil.',
          debug: { 
            conversationId, 
            step_failed: 'queue_job', 
            raw_error: err.message
          }
        }), { status: 200, headers });
      }
    }

    if (effectiveAction === 'stop-flow') {
      const conversationId = body.conversation_id;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400, headers });
      }

      // 1. Marcar conversa como human_active
      await supabase
        .from('webchat_conversations')
        .update({
          status: 'human_active',
          current_flow_id: null,
          current_block_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      // 2. Cancelar jobs pendentes
      await supabase
        .from('funnel_execution_jobs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('status', 'pending');

      return new Response(JSON.stringify({ success: true, message: 'Funil interrompido e jobs cancelados' }), { headers });
    }


    // Se não for trigger-flow, delega para o webchat-inbox original ou retorna erro
    // Nota: Aqui estamos criando uma função minimalista para o trigger-flow para garantir que funcione.
    // O ideal seria importar o resto do webchat-inbox, mas como o arquivo é grande, vamos focar no trigger-flow.
    
    return new Response(JSON.stringify({ 
      error: 'Action not supported in this debug version', 
      debug_entry: "WEBCHAT_INBOX_ENTRY_V3",
      received_action: effectiveAction
    }), { status: 404, headers });

  } catch (error: any) {
    console.error('Global error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      debug_version,
      error: 'Internal error', 
      message: error.message,
      debug: { step_failed: 'global_catch', raw_error: error.stack }
    }), { status: 200, headers });
  }
});
