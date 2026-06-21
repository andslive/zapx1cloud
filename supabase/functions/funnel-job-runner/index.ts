
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Funcao centralizada para executar um bloco do funil via uazapi-webhook.
 */
async function executeFunnelBlock(supabase: any, conversationId: string) {
  console.log(`[funnel-job-runner] Executing resume_funnel for ${conversationId}`);
  
  const { data, error } = await supabase.functions.invoke('uazapi-webhook', {
    body: {
      action: 'resume_funnel',
      conversationId: conversationId
    }
  });

  if (error) throw error;
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const debug_version = "FUNNEL_JOB_RUNNER_V1";
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar jobs pendentes
    // Aumentamos o limite para processar mais de uma vez se houver acúmulo
    const { data: jobs, error: fetchError } = await supabase
      .from('funnel_execution_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No pending jobs' }), { headers });
    }

    const results = [];

    for (const job of jobs) {
      console.log(`[runner] Processing job ${job.id} for conv ${job.conversation_id}`);
      
      // 2. Marcar como running com lock (evita que outro runner pegue o mesmo job)
      const { data: updatedJob, error: lockError } = await supabase
        .from('funnel_execution_jobs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString(),
          attempts: (job.attempts || 0) + 1 
        })
        .eq('id', job.id)
        .eq('status', 'pending') // Double check status to ensure no one else got it
        .select()
        .single();

      if (lockError || !updatedJob) {
        console.log(`[runner] Job ${job.id} already picked up by another process`);
        continue;
      }

      try {
        // 3. Executar o funil (chamando o motor existente no webhook)
        const engineResult = await executeFunnelBlock(supabase, job.conversation_id);

        // 4. Marcar como completed
        await supabase
          .from('funnel_execution_jobs')
          .update({ 
            status: 'completed', 
            finished_at: new Date().toISOString(),
            metadata: { ...job.metadata, engine_result: engineResult }
          })
          .eq('id', job.id);
        
        results.push({ job_id: job.id, success: true });
      } catch (err: any) {
        console.error(`[runner] Job ${job.id} failed:`, err);
        
        // 5. Marcar como failed
        await supabase
          .from('funnel_execution_jobs')
          .update({ 
            status: job.attempts >= 3 ? 'failed' : 'pending', // Retry up to 3 times
            last_error: err.message || JSON.stringify(err),
            finished_at: job.attempts >= 3 ? new Date().toISOString() : null
          })
          .eq('id', job.id);

        results.push({ job_id: job.id, success: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed_count: results.length,
      results 
    }), { headers });

  } catch (error: any) {
    console.error('Runner Global error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), { status: 500, headers });
  }
});
