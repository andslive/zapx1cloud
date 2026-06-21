import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // GET = Verificação do webhook pelo Facebook
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    
    console.log('Webhook verification request:', { mode, token });
    
    // Verificar token em todas as integrações ativas
    const { data: integration, error } = await supabase
      .from('facebook_lead_integrations')
      .select('id')
      .eq('verify_token', token)
      .eq('is_active', true)
      .maybeSingle();
    
    if (error) {
      console.error('Error verifying token:', error);
      return new Response('Verification failed', { status: 403 });
    }
    
    if (mode === 'subscribe' && integration) {
      console.log('Webhook verified for integration:', integration.id);
      return new Response(challenge, { status: 200 });
    }
    
    console.log('Verification failed - no matching integration found');
    return new Response('Verification failed', { status: 403 });
  }
  
  // POST = Receber leads
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Received webhook:', JSON.stringify(body));
      
      // Processar cada entry
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        
        // Buscar integração pela page_id
        const { data: integration, error: integrationError } = await supabase
          .from('facebook_lead_integrations')
          .select('*, products(*)')
          .eq('page_id', pageId)
          .eq('is_active', true)
          .maybeSingle();
        
        if (integrationError) {
          console.error('Error fetching integration:', integrationError);
          continue;
        }
        
        if (!integration) {
          console.log('No integration found for page:', pageId);
          continue;
        }
        
        // Processar cada mudança (lead)
        for (const change of entry.changes || []) {
          if (change.field !== 'leadgen') continue;
          
          const leadgenId = change.value.leadgen_id;
          const formId = change.value.form_id;
          const adId = change.value.ad_id;
          
          console.log('Processing lead:', { leadgenId, formId, adId });
          
          // Logar recebimento
          const { data: log, error: logError } = await supabase
            .from('facebook_lead_logs')
            .insert({
              integration_id: integration.id,
              leadgen_id: leadgenId,
              form_id: formId,
              ad_id: adId,
              raw_payload: change.value,
              status: 'pending'
            })
            .select()
            .single();
          
          if (logError) {
            console.error('Error creating log:', logError);
            continue;
          }
          
          // Buscar dados do lead na Graph API
          const leadData = await fetchLeadData(
            leadgenId, 
            integration.page_access_token
          );
          
          if (!leadData) {
            await supabase
              .from('facebook_lead_logs')
              .update({ 
                status: 'error', 
                error_message: 'Failed to fetch lead data from Graph API' 
              })
              .eq('id', log.id);
            continue;
          }
          
          // Mapear campos
          const fieldMapping = integration.field_mapping as Record<string, string> || {};
          const mappedData = mapLeadFields(leadData, fieldMapping);
          
          console.log('Mapped lead data:', mappedData);
          
          // Criar lead no CRM
          const lead = await createLeadFromFacebook(
            supabase, 
            integration, 
            mappedData, 
            leadData
          );
          
          // Atualizar log
          await supabase
            .from('facebook_lead_logs')
            .update({
              lead_data: leadData,
              lead_id: lead?.id,
              status: lead ? 'processed' : 'error',
              error_message: lead ? null : 'Failed to create lead',
              processed_at: new Date().toISOString()
            })
            .eq('id', log.id);
          
          // Atualizar contadores
          if (lead) {
            await supabase
              .from('facebook_lead_integrations')
              .update({
                last_lead_received_at: new Date().toISOString(),
                leads_count: (integration.leads_count || 0) + 1
              })
              .eq('id', integration.id);
            
            console.log('Lead created successfully:', lead.id);
          }
        }
      }
      
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response('Error', { status: 500 });
    }
  }
  
  return new Response('Method not allowed', { status: 405 });
});

async function fetchLeadData(leadgenId: string, accessToken: string) {
  const url = `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${accessToken}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error fetching lead from Graph API:', errorText);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Exception fetching lead data:', error);
    return null;
  }
}

function mapLeadFields(leadData: any, fieldMapping: Record<string, string>) {
  const result: Record<string, string> = {};
  
  for (const field of leadData.field_data || []) {
    const fbField = field.name;
    const crmField = fieldMapping[fbField] || fbField;
    const value = field.values?.[0] || '';
    
    result[crmField] = value;
  }
  
  return result;
}

async function createLeadFromFacebook(
  supabase: any,
  integration: any,
  mappedData: Record<string, string>,
  rawLeadData: any
) {
  try {
    // Buscar primeiro estágio do pipeline
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', integration.product_id)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    
    const leadName = mappedData.name || mappedData.full_name || mappedData.email || 'Lead Facebook';
    
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        organization_id: integration.organization_id,
        product_id: integration.product_id,
        name: leadName,
        email: mappedData.email || null,
        phone: mappedData.phone || mappedData.phone_number || null,
        company: mappedData.company || null,
        temperature: integration.default_temperature || 'hot',
        lead_origin: 'facebook_ads',
        lead_channel: 'facebook',
        source: 'Facebook Lead Ads',
        current_stage_id: firstStage?.id || null,
        assigned_to: integration.assigned_user_id || null,
        squad_id: integration.assigned_squad_id || null,
        utm_source: 'facebook',
        utm_medium: 'paid',
        utm_campaign: rawLeadData.campaign_name || null,
        metadata: {
          facebook_leadgen_id: rawLeadData.id,
          facebook_form_id: rawLeadData.form_id,
          facebook_ad_id: rawLeadData.ad_id,
          facebook_ad_name: rawLeadData.ad_name,
          facebook_campaign_name: rawLeadData.campaign_name,
          raw_field_data: rawLeadData.field_data,
          tags: integration.default_tags || []
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating lead:', error);
      return null;
    }
    
    // Criar interação
    await supabase.from('interactions').insert({
      lead_id: lead.id,
      channel: 'other',
      direction: 'inbound',
      content: `Lead capturado via Facebook Lead Ads`,
      metadata: { type: 'facebook_lead_capture' }
    });
    
    return lead;
  } catch (error) {
    console.error('Exception creating lead:', error);
    return null;
  }
}
