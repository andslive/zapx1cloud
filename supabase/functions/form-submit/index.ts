import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitRequest {
  form_id: string;
  responses: Record<string, unknown>;
  tracking?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referrer_url?: string;
    landing_page?: string;
    user_agent?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { form_id, responses, tracking = {} }: SubmitRequest = await req.json();

    if (!form_id) {
      return new Response(JSON.stringify({ error: 'form_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch form with product
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*, products(*)')
      .eq('id', form_id)
      .eq('status', 'active')
      .single();

    if (formError || !form) {
      console.error('Form not found:', formError);
      return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch form blocks for scoring and mapping
    const { data: blocks } = await supabase
      .from('form_blocks')
      .select('*')
      .eq('form_id', form_id)
      .order('order_index');

    // 3. Create a map of block ID to label for readable responses
    const blockLabels: Record<string, string> = {};
    for (const block of blocks || []) {
      if (block.label) {
        blockLabels[block.id] = block.label;
      }
    }

    // 4. Transform responses to use labels instead of UUIDs
    const responsesWithLabels: Record<string, unknown> = {};
    for (const [blockId, value] of Object.entries(responses)) {
      const label = blockLabels[blockId] || blockId;
      responsesWithLabels[label] = value;
    }

    // 5. Calculate score and collect tags
    let totalScore = 0;
    const tags: string[] = [];
    const leadData: Record<string, string> = {};

    for (const block of blocks || []) {
      const responseValue = responses[block.id];
      
      // Add block score
      if (block.score_value) {
        totalScore += block.score_value;
      }
      
      // Apply score rules
      if (block.score_rules && Array.isArray(block.score_rules)) {
        for (const rule of block.score_rules) {
          if (rule.value !== undefined && responseValue === rule.value) {
            totalScore += rule.score || 0;
          } else if (rule.min !== undefined && typeof responseValue === 'number') {
            if (responseValue >= rule.min && (!rule.max || responseValue <= rule.max)) {
              totalScore += rule.score || 0;
            }
          }
        }
      }
      
      // Collect tags
      if (block.apply_tags && Array.isArray(block.apply_tags)) {
        tags.push(...block.apply_tags);
      }
      
      // Map to lead fields
      if (block.maps_to && responseValue) {
        leadData[block.maps_to] = String(responseValue);
      }
    }

    // 4. Determine lead distribution
    let assigned_to: string | null = null;
    let squad_id: string | null = form.assigned_squad_id;
    let useAutoDispatch = false;

    switch (form.distribution_rule) {
      case 'user':
        assigned_to = form.assigned_user_id;
        break;

      case 'squad':
        squad_id = form.assigned_squad_id;
        useAutoDispatch = true;
        break;

      case 'round_robin':
        // Use Auto Dispatch if squad available, fallback to legacy
        if (form.assigned_squad_id) {
          squad_id = form.assigned_squad_id;
          useAutoDispatch = true;
        } else {
          const config = form.round_robin_config || { users: [], current_index: 0 };
          if (config.users && config.users.length > 0) {
            assigned_to = config.users[config.current_index % config.users.length];
            await supabase
              .from('forms')
              .update({
                round_robin_config: {
                  ...config,
                  current_index: (config.current_index + 1) % config.users.length,
                },
              })
              .eq('id', form_id);
          }
        }
        break;

      case 'manual':
      default:
        break;
    }

    // 5. Get first pipeline stage
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', form.product_id)
      .order('order_index')
      .limit(1)
      .single();

    // 6. Create lead (if auto_create_lead is enabled)
    let leadId: string | null = null;
    const settings = form.settings || {};

    if (settings.auto_create_lead !== false) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          organization_id: form.organization_id,
          product_id: form.product_id,
          name: leadData.name || leadData.email || 'Lead sem nome',
          email: leadData.email || null,
          phone: leadData.phone || null,
          company: leadData.company || null,
          position: leadData.position || null,
          notes: leadData.notes || null,
          temperature: form.default_temperature || 'warm',
          lead_origin: 'form',
          lead_channel: 'website',
          source: `Formulário: ${form.name}`,
          current_stage_id: firstStage?.id || null,
          assigned_to,
          squad_id,
          utm_source: tracking.utm_source || null,
          utm_medium: tracking.utm_medium || null,
          utm_campaign: tracking.utm_campaign || null,
          utm_term: tracking.utm_term || null,
          utm_content: tracking.utm_content || null,
          referrer_url: tracking.referrer_url || null,
          landing_page: tracking.landing_page || null,
          metadata: {
            form_id: form.id,
            form_name: form.name,
            form_responses: responsesWithLabels,
            form_score: totalScore,
            form_tags: tags,
          },
        })
        .select()
        .single();

      if (leadError) {
        console.error('Error creating lead:', leadError);
      } else {
        leadId = lead?.id;

        // Auto Dispatch: distribute lead via smart engine
        if (useAutoDispatch && squad_id && leadId) {
          try {
            const { data: assignedUserId } = await supabase.rpc('distribute_lead', {
              p_lead_id: leadId,
              p_squad_id: squad_id,
              p_organization_id: form.organization_id,
              p_product_id: form.product_id,
            });
            console.log(`[AutoDispatch] Lead ${leadId} -> User ${assignedUserId || 'queued'}`);
          } catch (e) {
            console.warn('[AutoDispatch] Distribution failed:', e);
          }
        }

        // Create interaction for form submission
        await supabase
          .from('interactions')
          .insert({
            lead_id: leadId,
            channel: 'other',
            direction: 'inbound',
            content: `Formulário preenchido: ${form.name}`,
            metadata: {
              type: 'form_submission',
              form_id: form.id,
              score: totalScore,
            },
          });
      }
    }

    // 8. Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id,
        lead_id: leadId,
        responses: responsesWithLabels,
        total_score: totalScore,
        tags,
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_term: tracking.utm_term || null,
        utm_content: tracking.utm_content || null,
        referrer_url: tracking.referrer_url || null,
        landing_page: tracking.landing_page || null,
        user_agent: tracking.user_agent || null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      throw submissionError;
    }

    // 8. Increment form submission count
    await supabase.rpc('increment_form_submissions_count', { p_form_id: form_id });

    // 9. Return success with redirect URL if configured
    const theme = form.theme || {};
    
    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission?.id,
        lead_id: leadId,
        score: totalScore,
        redirect_url: theme.redirect_url || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in form-submit:', error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
