import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Handle POST requests with actions
    if (req.method === 'POST') {
      const body = await req.json();

      switch (action) {
        case 'get-funnel': {
          const { funnel_id, channel = 'widget' } = body;
          
          if (!funnel_id) {
            return new Response(JSON.stringify({ error: 'funnel_id is required' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Fetch funnel by ID
          const { data: funnel, error: funnelError } = await supabase
            .from('capture_funnels')
            .select(`
              id,
              name,
              slug,
              status,
              flow_blocks,
              start_block_id,
              channels,
              widget_config,
              theme,
              ai_enabled,
              ai_context,
              utm_capture,
              products (id, name)
            `)
            .eq('id', funnel_id)
            .eq('status', 'active')
            .single();

          if (funnelError || !funnel) {
            console.error('Funnel not found:', funnelError);
            return new Response(JSON.stringify({ error: 'Funnel not found or inactive' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Validate channel is enabled
          const channels = funnel.channels as Record<string, { enabled: boolean }>;
          if (channel && !channels[channel]?.enabled) {
            return new Response(JSON.stringify({ error: `Channel '${channel}' is not enabled for this funnel` }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Increment views
          try {
            await supabase.rpc('increment_funnel_views', { 
              p_funnel_id: funnel.id, 
              p_channel: channel 
            });
          } catch (e) {
            console.warn('Failed to increment views:', e);
          }

          return new Response(
            JSON.stringify({
              funnel: {
                id: funnel.id,
                name: funnel.name,
                slug: funnel.slug,
                flow_blocks: funnel.flow_blocks,
                start_block_id: funnel.start_block_id,
                theme: funnel.theme,
                widget_config: funnel.widget_config,
                ai_enabled: funnel.ai_enabled,
                product: funnel.products,
              },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        case 'submit': {
          const { 
            funnel_id, 
            visitor_id, 
            channel = 'widget', 
            variables = {}, 
            metadata = {} 
          } = body;

          if (!funnel_id) {
            return new Response(JSON.stringify({ error: 'funnel_id is required' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Fetch funnel with flow_blocks for score/tag calculation
          const { data: funnel, error: funnelError } = await supabase
            .from('capture_funnels')
            .select(`
              id,
              name,
              organization_id,
              product_id,
              distribution_rule,
              assigned_user_id,
              assigned_squad_id,
              default_temperature,
              default_tags,
              flow_blocks,
              round_robin_config,
              theme
            `)
            .eq('id', funnel_id)
            .single();

          if (funnelError || !funnel) {
            return new Response(JSON.stringify({ error: 'Funnel not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // --- Variable to lead field mapping (aligned with funnel-submit) ---
          const VARIABLE_TO_LEAD_FIELD: Record<string, string> = {
            'name': 'name', 'nome': 'name', 'nome_completo': 'name', 'full_name': 'name', 'primeiro_nome': 'name',
            'email': 'email', 'e-mail': 'email', 'e_mail': 'email',
            'phone': 'phone', 'telefone': 'phone', 'whatsapp': 'phone', 'celular': 'phone', 'tel': 'phone', 'fone': 'phone',
            'company': 'company', 'empresa': 'company',
            'cpf': 'cpf',
            'position': 'position', 'cargo': 'position',
          };

          const leadData: Record<string, string> = {};
          for (const [variable, value] of Object.entries(variables)) {
            if (!value) continue;
            const normalizedVar = String(variable).toLowerCase().trim();
            const leadField = VARIABLE_TO_LEAD_FIELD[normalizedVar];
            if (leadField) {
              leadData[leadField] = String(value);
            }
          }

          const leadName = leadData.name || leadData.email?.split('@')[0] || 'Lead do Widget';
          const leadEmail = leadData.email || null;
          const leadPhone = leadData.phone || null;
          const leadCompany = leadData.company || null;

          // --- Calculate score and tags from flow_blocks (aligned with funnel-submit) ---
          const flowBlocks = (funnel.flow_blocks || []) as Array<{
            id: string;
            type: string;
            data: { score_value?: number; apply_tags?: string[]; };
          }>;

          let totalScore = 0;
          const tags: string[] = [...(funnel.default_tags || [])];

          // Include score/tags passed from widget state
          if (variables.__score) totalScore += Number(variables.__score) || 0;
          if (Array.isArray(variables.__tags)) tags.push(...variables.__tags);

          for (const block of flowBlocks) {
            if (block.data?.score_value) totalScore += block.data.score_value;
            if (block.data?.apply_tags) tags.push(...block.data.apply_tags);
          }

          const uniqueTags = [...new Set(tags)];

          // Get first stage of pipeline
          const { data: firstStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('product_id', funnel.product_id)
            .order('order_index', { ascending: true })
            .limit(1)
            .single();

          // Determine assignment
          let assignedTo = null;
          let squadId = null;
          let useAutoDispatch = false;

          switch (funnel.distribution_rule) {
            case 'user':
              assignedTo = funnel.assigned_user_id;
              break;
            case 'squad':
              squadId = funnel.assigned_squad_id;
              useAutoDispatch = true;
              break;
            case 'round_robin':
              squadId = funnel.assigned_squad_id;
              useAutoDispatch = !!squadId;
              break;
          }

          // Accept both camelCase (widget) and snake_case (funnel-submit) UTM formats
          const utmSource = metadata.utmSource || metadata.utm_source || null;
          const utmMedium = metadata.utmMedium || metadata.utm_medium || null;
          const utmCampaign = metadata.utmCampaign || metadata.utm_campaign || null;
          const utmContent = metadata.utmContent || metadata.utm_content || null;
          const utmTerm = metadata.utmTerm || metadata.utm_term || null;

          // Create lead
          const { data: lead, error: leadError } = await supabase
            .from('leads')
            .insert({
              organization_id: funnel.organization_id,
              product_id: funnel.product_id,
              name: leadName,
              email: leadEmail,
              phone: leadPhone,
              company: leadCompany,
              temperature: funnel.default_temperature || 'warm',
              lead_origin: 'capture_funnel',
              lead_channel: channel,
              source: `Widget - ${funnel.name || funnel_id.substring(0, 8)}`,
              current_stage_id: firstStage?.id,
              assigned_to: assignedTo,
              squad_id: squadId,
              utm_source: utmSource,
              utm_medium: utmMedium,
              utm_campaign: utmCampaign,
              utm_content: utmContent,
              utm_term: utmTerm,
              metadata: {
                funnel_id: funnel.id,
                funnel_name: funnel.name,
                visitor_id: visitor_id,
                channel: channel,
                collected_variables: variables,
                page_url: metadata.currentPageUrl,
                referrer: metadata.referrerUrl,
                score: totalScore,
                tags: uniqueTags,
                submitted_at: metadata.submitted_at || new Date().toISOString()
              }
            })
            .select()
            .single();

          if (leadError) {
            console.error('Failed to create lead:', leadError);
            return new Response(JSON.stringify({ error: 'Failed to create lead' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Auto Dispatch
          if (useAutoDispatch && squadId && lead) {
            try {
              const { data: assignedUserId } = await supabase.rpc('distribute_lead', {
                p_lead_id: lead.id,
                p_squad_id: squadId,
                p_organization_id: funnel.organization_id,
                p_product_id: funnel.product_id,
              });
              console.log(`[AutoDispatch] Lead ${lead.id} -> User ${assignedUserId || 'queued'}`);
            } catch (e) {
              console.warn('[AutoDispatch] Distribution failed:', e);
            }
          }

          // Create initial interaction
          await supabase.from('interactions').insert({
            lead_id: lead.id,
            channel: 'webchat',
            direction: 'inbound',
            content: `Lead capturado via Widget do Funil: ${funnel.name}`,
            metadata: { 
              type: 'funnel_capture',
              funnel_id: funnel.id,
              collected_data: variables,
              score: totalScore,
            }
          });

          // Update funnel lead count
          await supabase.rpc('increment_funnel_leads', {
            p_funnel_id: funnel.id,
            p_channel: channel
          });

          const theme = funnel.theme || {};

          return new Response(
            JSON.stringify({
              success: true,
              lead_id: lead.id,
              score: totalScore,
              tags: uniqueTags,
              redirect_url: theme.redirect_url || null,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        default:
          return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    }

    // Handle GET requests (existing functionality for pages)
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      const channel = url.searchParams.get('channel') || 'chat';
      const domain = req.headers.get('origin') || req.headers.get('referer') || '';

      if (!slug) {
        return new Response(JSON.stringify({ error: 'slug is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch funnel by slug
      const { data: funnel, error: funnelError } = await supabase
        .from('capture_funnels')
        .select(`
          id,
          name,
          slug,
          status,
          flow_blocks,
          start_block_id,
          channels,
          widget_config,
          theme,
          ai_enabled,
          ai_context,
          utm_capture,
          facebook_pixel_id,
          google_tag_id,
          custom_scripts,
          products (id, name)
        `)
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (funnelError || !funnel) {
        console.error('Funnel not found:', funnelError);
        return new Response(JSON.stringify({ error: 'Funnel not found or inactive' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate channel is enabled
      const channels = funnel.channels as Record<string, { enabled: boolean }>;
      if (!channels[channel]?.enabled) {
        return new Response(JSON.stringify({ error: `Channel '${channel}' is not enabled for this funnel` }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate domain for widget channel
      if (channel === 'widget') {
        const widgetConfig = funnel.widget_config as { allowed_domains?: string[] };
        const allowedDomains = widgetConfig?.allowed_domains || [];
        
        if (allowedDomains.length > 0) {
          const domainHost = domain ? new URL(domain).hostname : '';
          const isAllowed = allowedDomains.some(d => 
            domainHost === d || domainHost.endsWith(`.${d}`)
          );
          
          if (!isAllowed) {
            console.warn(`Domain ${domainHost} not allowed for funnel ${funnel.id}`);
            return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // Increment views
      await supabase.rpc('increment_funnel_views', { 
        p_funnel_id: funnel.id, 
        p_channel: channel 
      });

      // Return public funnel data (without sensitive info)
      return new Response(
        JSON.stringify({
          id: funnel.id,
          name: funnel.name,
          slug: funnel.slug,
          flow_blocks: funnel.flow_blocks,
          start_block_id: funnel.start_block_id,
          theme: funnel.theme,
          widget_config: funnel.widget_config,
          ai_enabled: funnel.ai_enabled,
          utm_capture: funnel.utm_capture,
          facebook_pixel_id: funnel.facebook_pixel_id,
          google_tag_id: funnel.google_tag_id,
          custom_scripts: funnel.custom_scripts,
          product: funnel.products,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in funnel-api:', error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
