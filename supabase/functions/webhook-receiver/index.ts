import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { normalizePhoneBR } from '../_shared/phone.ts';
import { sendUazapiTextMessage } from '../_shared/whatsapp.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookAction {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
}

// Flatten nested object to dot notation
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, fullPath));
      } else {
        result[fullPath] = value;
      }
    }
  }
  
  return result;
}

// Get value from flattened object using dot notation path
function getFieldValue(fields: Record<string, any>, path: string): any {
  return fields[path];
}

// Replace variables in template string
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  // Remove any remaining unresolved variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

// Build smart variable map from lead data + template variables
function buildTemplateVariables(
  lead: { name?: string; email?: string; phone?: string },
  templateVars?: Array<{ name: string; description?: string }>,
  extraVars?: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {};

  // Auto-resolve template variables by name heuristics
  if (templateVars && Array.isArray(templateVars)) {
    for (const v of templateVars) {
      const lower = v.name.toLowerCase();
      if (lower.includes('name') || lower.includes('nome')) {
        map[v.name] = lead.name || '';
      } else if (lower.includes('email')) {
        map[v.name] = lead.email || '';
      } else if (lower.includes('phone') || lower.includes('telefone') || lower.includes('fone')) {
        map[v.name] = lead.phone || '';
      }
    }
  }

  // Always set standard keys
  map['lead_name'] = lead.name || '';
  map['lead_email'] = lead.email || '';
  map['lead_phone'] = lead.phone || '';
  map['userName'] = lead.name || '';
  map['name'] = lead.name || '';
  map['nome'] = lead.name || '';
  map['email'] = lead.email || '';

  // Merge extras (e.g. organizationName)
  if (extraVars) Object.assign(map, extraVars);

  return map;
}

// Adjust a date to the next valid business time
function adjustToBusinessHours(date: Date, startTime: string, endTime: string, businessDays: number[]): Date {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const target = new Date(date);

  // Max 14 days search to prevent infinite loop
  for (let i = 0; i < 14; i++) {
    const dayOfWeek = target.getDay();
    if (businessDays.includes(dayOfWeek)) {
      const h = target.getHours();
      const m = target.getMinutes();
      const currentMinutes = h * 60 + m;
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes) {
        target.setHours(startH, startM, 0, 0);
        return target;
      }
      if (currentMinutes < endMinutes) {
        return target; // within business hours
      }
    }
    // Move to next day at business start
    target.setDate(target.getDate() + 1);
    target.setHours(startH, startM, 0, 0);
  }
  return target;
}

// Generate default welcome email HTML
function generateWelcomeHtml(leadName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .header h1 { color: white; margin: 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Bem-vindo(a)!</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${leadName}</strong>,</p>
          <p>Obrigado pelo seu interesse! Recebemos seus dados com sucesso.</p>
          <p>Em breve nossa equipe entrará em contato com você.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate seller notification email HTML
function generateSellerNotificationHtml(
  leadName: string,
  leadEmail: string,
  leadPhone: string,
  leadUrl: string,
  customMessage?: string
): string {
  const defaultMessage = customMessage 
    ? replaceVariables(customMessage, {
        lead_name: leadName,
        lead_email: leadEmail || 'Não informado',
        lead_phone: leadPhone || 'Não informado',
        lead_url: leadUrl
      })
    : `Um novo lead foi recebido via webhook e atribuído a você.`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .header h1 { color: white; margin: 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .lead-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
        .lead-card h3 { margin-top: 0; color: #111; }
        .lead-info { margin: 10px 0; }
        .lead-info strong { color: #6366f1; }
        .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Novo Lead Recebido!</h1>
        </div>
        <div class="content">
          <p>${defaultMessage}</p>
          <div class="lead-card">
            <h3>${leadName}</h3>
            <div class="lead-info"><strong>Email:</strong> ${leadEmail || 'Não informado'}</div>
            <div class="lead-info"><strong>Telefone:</strong> ${leadPhone || 'Não informado'}</div>
          </div>
          <p style="text-align: center;">
            <a href="${leadUrl}" class="button">Ver Lead no CRM</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract webhook ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const webhookId = pathParts[pathParts.length - 1];

    console.log(`[Webhook] Received request for webhook: ${webhookId}`);

    if (!webhookId || webhookId === 'webhook-receiver') {
      return new Response(
        JSON.stringify({ error: 'Webhook ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request details
    const requestIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const requestHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      requestHeaders[key] = value;
    });

    // Parse request body — tolerante a múltiplos content-types
    let payload: Record<string, any> = {};
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    try {
      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        formData.forEach((value, key) => {
          if (value instanceof File) {
            payload[key] = { filename: value.name, type: value.type, size: value.size };
          } else {
            // Suporta múltiplos valores no mesmo campo
            if (key in payload) {
              payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
            } else {
              payload[key] = value;
            }
          }
        });
      } else {
        // Lê o corpo como texto e tenta inferir o formato
        const rawText = await req.text();
        const trimmed = rawText.trim();
        console.log(`[Webhook] content-type="${contentType}" body_len=${rawText.length}`);

        if (!trimmed) {
          payload = {};
        } else if (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            payload = JSON.parse(trimmed);
          } catch {
            // fallback: tenta urlencoded antes de desistir
            try {
              const params = new URLSearchParams(trimmed);
              const obj: Record<string, any> = {};
              params.forEach((v, k) => { obj[k] = v; });
              payload = Object.keys(obj).length > 0 ? obj : { raw: rawText };
            } catch {
              payload = { raw: rawText };
            }
          }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(trimmed);
          params.forEach((v, k) => { payload[k] = v; });
        } else {
          // text/plain ou sem content-type: tenta JSON, depois urlencoded
          try {
            payload = JSON.parse(trimmed);
          } catch {
            try {
              const params = new URLSearchParams(trimmed);
              const obj: Record<string, any> = {};
              params.forEach((v, k) => { obj[k] = v; });
              payload = Object.keys(obj).length > 0 ? obj : { raw: rawText };
            } catch {
              payload = { raw: rawText };
            }
          }
        }
      }
    } catch (e) {
      console.error('[Webhook] Failed to parse body:', e);
    }

    console.log(`[Webhook] Payload:`, JSON.stringify(payload).slice(0, 500));

    // Fetch webhook configuration
    const { data: webhook, error: webhookError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (webhookError || !webhook) {
      console.log(`[Webhook] Webhook not found: ${webhookId}`);
      return new Response(
        JSON.stringify({ error: 'Webhook not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhook.is_active && !webhook.is_test_mode) {
      console.log(`[Webhook] Webhook is inactive: ${webhookId}`);
      return new Response(
        JSON.stringify({ error: 'Webhook is inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enforce configured secret_key (if any)
    if (webhook.secret_key) {
      const provided =
        req.headers.get('x-webhook-secret') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        '';
      if (provided !== webhook.secret_key) {
        console.log(`[Webhook] Invalid secret for webhook ${webhookId}`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Enforce allowed_ips (if configured)
    if (Array.isArray(webhook.allowed_ips) && webhook.allowed_ips.length > 0) {
      const callerIp = (requestIp || '').split(',')[0].trim();
      if (!webhook.allowed_ips.includes(callerIp)) {
        console.log(`[Webhook] IP ${callerIp} not in allowed_ips for ${webhookId}`);
        return new Response(
          JSON.stringify({ error: 'IP not allowed' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }


    // Flatten payload for field access
    const flatFields = flattenObject(payload);

    // Create log entry - minimal version initially
    const { data: log, error: logError } = await supabase
      .from('webhook_logs')
      .insert({
        webhook_id: webhookId,
        request_method: req.method,
        // request_headers: requestHeaders, // Skip headers for minimal I/O
        request_body: { summary: "Payload received, processing..." }, // Small placeholder
        request_ip: requestIp,
        // parsed_fields: flatFields, // Skip parsed fields initially
        status: 'pending'
      })
      .select('id')
      .single();

    if (logError) {
      console.error('[Webhook] Error creating log:', logError);
    }

    // If test mode, save as sample and skip actions
    if (webhook.is_test_mode) {
      console.log(`[Webhook] Test mode - skipping actions`);
      
      // Save as sample request
      await supabase
        .from('webhook_sample_requests')
        .insert({
          webhook_id: webhookId,
          name: `Request ${new Date().toLocaleString('pt-BR')}`,
          request_body: payload,
          extracted_fields: flatFields
        });

      // Update log as skipped
      if (log) {
        await supabase
          .from('webhook_logs')
          .update({ 
            status: 'skipped',
            processing_time_ms: Date.now() - startTime
          })
          .eq('id', log.id);
      }

      // Increment counters
      await supabase.rpc('increment_webhook_requests', { p_webhook_id: webhookId });

      return new Response(
        JSON.stringify({ success: true, message: 'Test mode - request logged', log_id: log?.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute actions
    const actions = (webhook.actions as WebhookAction[]) || [];
    const actionsResults: Array<{ action: string; success: boolean; result?: any; error?: string }> = [];
    let leadId: string | null = null;

    for (const action of actions) {
      if (!action.enabled) continue;

      console.log(`[Webhook] Executing action: ${action.type}`);

      try {
        const result = await executeAction(
          supabase,
          action,
          flatFields,
          webhook,
          leadId
        );

        if (result.lead_id) {
          leadId = result.lead_id;
        }

        actionsResults.push({
          action: action.type,
          success: true,
          result
        });

        console.log(`[Webhook] Action ${action.type} completed successfully`);
      } catch (error: any) {
        console.error(`[Webhook] Action ${action.type} failed:`, error);
        actionsResults.push({
          action: action.type,
          success: false,
          error: error.message
        });
      }
    }

    // Update log with results
    const processingTime = Date.now() - startTime;
    const hasErrors = actionsResults.some(a => !a.success);

    if (log) {
      // For success, we keep it minimal. For error, we log everything.
      const updateData: any = {
        status: hasErrors ? 'error' : 'success',
        actions_executed: actionsResults,
        lead_id: leadId,
        processing_time_ms: processingTime,
        error_message: hasErrors ? actionsResults.find(a => !a.success)?.error : null
      };

      if (hasErrors) {
        updateData.request_body = payload;
        updateData.request_headers = requestHeaders;
        updateData.parsed_fields = flatFields;
      } else {
        // Success: just a small summary
        updateData.request_body = { 
          summary: `Success: ${actionsResults.length} actions executed`,
          timestamp: new Date().toISOString()
        };
      }

      await supabase
        .from('webhook_logs')
        .update(updateData)
        .eq('id', log.id);
    }

    // Increment counters
    await supabase.rpc('increment_webhook_requests', { p_webhook_id: webhookId });

    return new Response(
      JSON.stringify({ 
        success: !hasErrors, 
        actions_executed: actionsResults.length,
        lead_id: leadId,
        processing_time_ms: processingTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Webhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Execute a single action
async function executeAction(
  supabase: any,
  action: WebhookAction,
  fields: Record<string, any>,
  webhook: any,
  existingLeadId: string | null
): Promise<{ lead_id?: string; [key: string]: any }> {
  const config = action.config || {};

  switch (action.type) {
    case 'create_lead': {
      const mappings = config.field_mappings || {};

      // Map incoming fields first so we can dedupe by phone/email
      const incomingName = mappings.name ? getFieldValue(fields, mappings.name) : null;
      const incomingEmail = mappings.email ? getFieldValue(fields, mappings.email) : null;
      const incomingPhone = mappings.phone ? getFieldValue(fields, mappings.phone) : null;
      const incomingCompany = mappings.company ? getFieldValue(fields, mappings.company) : null;

      // ---------- DEDUPE: try to find an existing lead in this org ----------
      // Use the same canonical normalization as the SQL `phone_normalized` generated column.
      const phoneNormalized = normalizePhoneBR(incomingPhone);
      const phoneDigits = incomingPhone ? String(incomingPhone).replace(/\D/g, '') : '';

      let existingLead: { id: string; name: string | null; email: string | null } | null = null;

      if (phoneNormalized) {
        const { data: byPhone } = await supabase
          .from('leads')
          .select('id, name, email')
          .eq('organization_id', webhook.organization_id)
          .eq('phone_normalized', phoneNormalized)
          .limit(1)
          .maybeSingle();
        if (byPhone) existingLead = byPhone;
      }

      if (!existingLead && incomingEmail) {
        const { data: byEmail } = await supabase
          .from('leads')
          .select('id, name, email')
          .eq('organization_id', webhook.organization_id)
          .ilike('email', String(incomingEmail).trim())
          .limit(1)
          .maybeSingle();
        if (byEmail) existingLead = byEmail;
      }

      if (existingLead) {
        // Reuse existing lead — refresh origin and update name with the latest cadastro
        // (keep phone untouched; email only fills if missing)
        const updateData: Record<string, any> = {
          lead_origin: `webhook:${webhook.name} (recompra)`,
        };
        // Always update name when a fresh, real name comes in (not the phone string itself)
        if (incomingName && String(incomingName).trim() && String(incomingName).trim() !== String(incomingPhone || '').trim()) {
          updateData.name = incomingName;
        } else if (!existingLead.name && incomingName) {
          updateData.name = incomingName;
        }
        if (!existingLead.email && incomingEmail) updateData.email = incomingEmail;
        if (incomingCompany) updateData.company = incomingCompany;

        const { error: updErr } = await supabase
          .from('leads')
          .update(updateData)
          .eq('id', existingLead.id);
        if (updErr) console.warn('[Webhook] Lead reuse update warning:', updErr.message);

        console.log(`[Webhook] Lead reused (existing): ${existingLead.id}`);
        return { lead_id: existingLead.id, reused: true };
      }

      // ---------- CREATE: no existing lead found ----------
      const leadData: Record<string, any> = {
        organization_id: webhook.organization_id,
        product_id: webhook.product_id,
        source: 'webhook',
        lead_origin: `webhook:${webhook.name}`,
        lead_channel: 'api',
      };

      if (webhook.squad_id) {
        leadData.squad_id = webhook.squad_id;
      }

      if (webhook.product_id) {
        const { data: firstStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('product_id', webhook.product_id)
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          leadData.current_stage_id = firstStage.id;
          console.log(`[Webhook] Setting initial stage: ${firstStage.id}`);
        }
      }

      leadData.name = incomingName || incomingEmail || incomingPhone || 'Lead Webhook';
      if (incomingEmail) leadData.email = incomingEmail;
      if (incomingPhone) leadData.phone = incomingPhone;
      if (incomingCompany) leadData.company = incomingCompany;

      const { data: lead, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select()
        .single();

      // Race-condition guard: if another concurrent insert won the unique constraint,
      // fall back to reusing whichever lead now exists.
      if (error) {
        if ((error as any).code === '23505' && phoneNormalized) {
          const { data: raceLead } = await supabase
            .from('leads')
            .select('id')
            .eq('organization_id', webhook.organization_id)
            .eq('phone_normalized', phoneNormalized)
            .limit(1)
            .maybeSingle();
          if (raceLead) {
            console.log(`[Webhook] Lead reused after race (23505): ${raceLead.id}`);
            const raceUpdate: Record<string, any> = {
              lead_origin: `webhook:${webhook.name} (recompra)`,
            };
            if (incomingName && String(incomingName).trim() && String(incomingName).trim() !== String(incomingPhone || '').trim()) {
              raceUpdate.name = incomingName;
            }
            await supabase.from('leads').update(raceUpdate).eq('id', raceLead.id);
            return { lead_id: raceLead.id, reused: true, race: true };
          }
        }
        throw error;
      }

      if (lead && webhook.squad_id) {
        try {
          const { data: assignedUserId } = await supabase.rpc('distribute_lead', {
            p_lead_id: lead.id,
            p_squad_id: webhook.squad_id,
            p_organization_id: webhook.organization_id,
            p_product_id: webhook.product_id,
          });
          console.log(`[AutoDispatch] Webhook lead ${lead.id} -> User ${assignedUserId || 'queued'}`);
        } catch (e) {
          console.warn('[AutoDispatch] Webhook distribution failed:', e);
        }
      }

      return { lead_id: lead.id, created: true };
    }

    case 'update_lead': {
      if (!existingLeadId) {
        throw new Error('No lead to update');
      }

      const mappings = config.field_mappings || {};
      const updateData: Record<string, any> = {};

      if (mappings.name) updateData.name = getFieldValue(fields, mappings.name);
      if (mappings.email) updateData.email = getFieldValue(fields, mappings.email);
      if (mappings.phone) updateData.phone = getFieldValue(fields, mappings.phone);
      if (mappings.company) updateData.company = getFieldValue(fields, mappings.company);

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, updated: true };
    }

    case 'transfer_user': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_user_id) throw new Error('No target user specified');

      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: config.target_user_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, transferred_to: config.target_user_id };
    }

    case 'transfer_squad': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_squad_id) throw new Error('No target squad specified');

      const { error } = await supabase
        .from('leads')
        .update({ squad_id: config.target_squad_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, transferred_to_squad: config.target_squad_id };
    }

    case 'transfer_sector': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_sector_id) throw new Error('No target sector specified');

      const { error } = await supabase
        .from('leads')
        .update({ sector_id: config.target_sector_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, transferred_to_sector: config.target_sector_id };
    }

    case 'move_stage': {
      if (!existingLeadId) throw new Error('No lead to move');
      if (!config.target_stage_id) throw new Error('No target stage specified');

      const { error } = await supabase
        .from('leads')
        .update({ current_stage_id: config.target_stage_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, moved_to_stage: config.target_stage_id };
    }

    case 'apply_tags': {
      if (!existingLeadId) throw new Error('No lead to tag');

      // Resolver organization_id do lead (necessário para resolver tags por nome)
      const { data: leadRow } = await supabase
        .from('leads')
        .select('organization_id')
        .eq('id', existingLeadId)
        .single();
      const orgId = leadRow?.organization_id;

      let tagIds: string[] = Array.isArray(config.tag_ids) ? [...config.tag_ids] : [];

      // Compatibilidade: se vier nomes legados em config.tags, tenta resolver por nome (case-insensitive)
      if ((!tagIds || tagIds.length === 0) && Array.isArray(config.tags) && config.tags.length > 0 && orgId) {
        const names = config.tags.map((s: string) => String(s).trim()).filter(Boolean);
        if (names.length > 0) {
          const { data: matched } = await supabase
            .from('lead_tags')
            .select('id, name')
            .eq('organization_id', orgId);
          const lower = (s: string) => s.toLowerCase();
          const namesLower = new Set(names.map(lower));
          tagIds = (matched || [])
            .filter((t: any) => namesLower.has(lower(t.name)))
            .map((t: any) => t.id);
        }
      }

      if (!tagIds || tagIds.length === 0) {
        return { lead_id: existingLeadId, tags_applied: [], warning: 'Nenhuma etiqueta resolvida' };
      }

      const rows = tagIds.map((tid) => ({
        lead_id: existingLeadId,
        tag_id: tid,
        applied_by: null,
        source: 'webhook' as const,
      }));

      // Insert ignorando duplicate keys
      const { error } = await supabase
        .from('lead_tag_assignments')
        .upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });

      if (error) throw error;
      return { lead_id: existingLeadId, tags_applied: tagIds };
    }

    case 'set_temperature': {
      if (!existingLeadId) throw new Error('No lead to update');
      if (!config.temperature) throw new Error('No temperature specified');

      const { error } = await supabase
        .from('leads')
        .update({ temperature: config.temperature })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, temperature_set: config.temperature };
    }

    case 'set_deal_value': {
      if (!existingLeadId) throw new Error('No lead to update');
      if (!config.value_field) throw new Error('No value field specified');

      const value = parseFloat(getFieldValue(fields, config.value_field)) || 0;

      const { error } = await supabase
        .from('leads')
        .update({ deal_value: value })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, deal_value_set: value };
    }

    case 'send_email': {
      if (!existingLeadId) throw new Error('No lead for email');

      // Get lead data
      const { data: lead } = await supabase
        .from('leads')
        .select('name, email, phone, organization_id')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.email) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no email' };
      }

      // Get organization name for sender and variables
      let orgName = 'Notificação';
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', lead.organization_id || webhook.organization_id)
        .single();
      if (org?.name) orgName = org.name;

      // Get email template if configured
      let subject = 'Obrigado pelo seu interesse!';
      let html = generateWelcomeHtml(lead.name || 'Cliente');

      if (config.email_template_id) {
        const { data: template } = await supabase
          .from('email_templates')
          .select('subject, html_content, variables')
          .eq('id', config.email_template_id)
          .single();

        if (template) {
          const vars = buildTemplateVariables(
            { name: lead.name, email: lead.email, phone: lead.phone },
            template.variables as Array<{ name: string; description?: string }>,
            { organizationName: orgName, organization: orgName }
          );
          subject = replaceVariables(template.subject, vars);
          html = replaceVariables(template.html_content, vars);
        }
      }

      // Also process custom subject if set
      if (config.email_subject) {
        const vars = buildTemplateVariables(
          { name: lead.name, email: lead.email, phone: lead.phone },
          undefined,
          { organizationName: orgName }
        );
        subject = replaceVariables(config.email_subject, vars);
      }

      // Send email via Resend
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        console.error('[Webhook] RESEND_API_KEY not configured');
        return { lead_id: existingLeadId, skipped: true, reason: 'Email service not configured' };
      }

      const resend = new Resend(resendApiKey);

      try {
        await resend.emails.send({
          from: `${orgName} <onboarding@resend.dev>`,
          to: [lead.email],
          subject,
          html
        });

        console.log(`[Webhook] Email sent to lead: ${lead.email}`);
        return { lead_id: existingLeadId, email_sent_to: lead.email };
      } catch (emailError: any) {
        console.error('[Webhook] Email send error:', emailError);
        throw new Error(`Failed to send email: ${emailError.message}`);
      }
    }

    case 'send_email_to_seller': {
      if (!existingLeadId) throw new Error('No lead for seller notification');

      // Get lead data with assigned seller
      const { data: lead } = await supabase
        .from('leads')
        .select('name, email, phone, assigned_to')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.assigned_to) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no assigned seller' };
      }

      // Get seller email and org name in parallel
      const [{ data: seller }, { data: org }] = await Promise.all([
        supabase.from('profiles').select('email, full_name').eq('id', lead.assigned_to).single(),
        supabase.from('organizations').select('name').eq('id', webhook.organization_id).single()
      ]);

      if (!seller?.email) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Seller has no email' };
      }

      const orgName = org?.name || 'CRM';

      // Build smart variables
      const vars = buildTemplateVariables(
        { name: lead.name, email: lead.email, phone: lead.phone },
        undefined,
        { 
          organizationName: orgName, 
          seller_name: seller.full_name || '',
          sellerName: seller.full_name || ''
        }
      );

      // Build email content
      const leadUrl = `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/leads/${existingLeadId}`;
      
      const subject = config.email_subject 
        ? replaceVariables(config.email_subject, vars)
        : `Novo lead recebido: ${lead.name || 'Lead'}`;

      const html = generateSellerNotificationHtml(
        lead.name || 'Lead',
        lead.email || '',
        lead.phone || '',
        leadUrl,
        config.email_message ? replaceVariables(config.email_message, vars) : undefined
      );

      // Send email via Resend
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        console.error('[Webhook] RESEND_API_KEY not configured');
        return { lead_id: existingLeadId, skipped: true, reason: 'Email service not configured' };
      }

      const resend = new Resend(resendApiKey);

      try {
        await resend.emails.send({
          from: `${orgName} <onboarding@resend.dev>`,
          to: [seller.email],
          subject,
          html
        });

        console.log(`[Webhook] Seller notification sent to: ${seller.email}`);
        return { lead_id: existingLeadId, email_sent_to_seller: seller.email };
      } catch (emailError: any) {
        console.error('[Webhook] Seller email error:', emailError);
        throw new Error(`Failed to send seller email: ${emailError.message}`);
      }
    }

    case 'notify_user': {
      if (!existingLeadId) {
        console.log('[Webhook] No lead for notification, skipping');
        return { skipped: true, reason: 'No lead for notification' };
      }

      // Get lead's assigned user
      const { data: lead } = await supabase
        .from('leads')
        .select('assigned_to, name')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.assigned_to) {
        return { skipped: true, reason: 'No assigned user' };
      }

      // Create notification
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: lead.assigned_to,
          title: 'Novo lead via Webhook',
          message: config.notification_message || `Lead ${lead.name} recebido via webhook`,
          type: 'info',
          action_url: `/leads/${existingLeadId}`
        });

      if (error) {
        console.error('[Webhook] Notification error:', error);
      }

      return { lead_id: existingLeadId, notified: lead.assigned_to };
    }

    case 'update_field': {
      if (!existingLeadId) throw new Error('No lead to update field');
      if (!config.custom_field_id) throw new Error('No custom field specified');
      if (!config.value_field) throw new Error('No value field specified');

      // Get custom field info
      const { data: customField } = await supabase
        .from('custom_fields')
        .select('field_key, name')
        .eq('id', config.custom_field_id)
        .single();

      const fieldKey = customField?.field_key || config.custom_field_key;
      if (!fieldKey) throw new Error('Could not resolve field key');

      const fieldValue = getFieldValue(fields, config.value_field);

      // Get current lead metadata
      const { data: lead } = await supabase
        .from('leads')
        .select('metadata')
        .eq('id', existingLeadId)
        .single();

      const currentMetadata = lead?.metadata || {};
      const currentCustomFields = currentMetadata.custom_fields || {};

      const { error } = await supabase
        .from('leads')
        .update({
          metadata: {
            ...currentMetadata,
            custom_fields: {
              ...currentCustomFields,
              [fieldKey]: fieldValue
            }
          }
        })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, field_updated: fieldKey, value: fieldValue };
    }

    case 'notify_whatsapp': {
      if (!existingLeadId) throw new Error('No lead to notify about');

      // Determine provider
      const { data: wpSetting } = await supabase
        .from('integration_settings')
        .select('settings')
        .eq('organization_id', webhook.organization_id)
        .eq('integration_type', 'whatsapp_provider')
        .maybeSingle();

      const wpSettings = wpSetting?.settings as Record<string, unknown> | null;
      const wpProvider = (wpSettings?.provider as string) || 'isichat';
      const bcKey = (wpSettings?.botconversa_api_key as string) || Deno.env.get('BOTCONVERSA_API_KEY');
      const isichatToken = Deno.env.get('ISICHAT_TOKEN');

      if (wpProvider !== 'botconversa' && !isichatToken) {
        return { lead_id: existingLeadId, skipped: true, reason: 'No WhatsApp provider configured' };
      }

      // Get lead data for variable substitution
      const { data: lead } = await supabase
        .from('leads')
        .select('name, email, phone')
        .eq('id', existingLeadId)
        .single();

      const messageTemplate = config.whatsapp_message || 'Novo lead recebido: {{lead_name}}';
      const message = replaceVariables(messageTemplate, {
        lead_name: lead?.name || 'Lead',
        lead_phone: lead?.phone || 'Não informado',
        lead_email: lead?.email || 'Não informado',
      });

      // Determine target numbers
      const targetNumbers: string[] = [];
      const whatsappTarget = config.whatsapp_target || 'all_team';

      if (whatsappTarget === 'specific_number') {
        if (config.whatsapp_number) {
          targetNumbers.push(config.whatsapp_number);
        }
      } else if (whatsappTarget === 'specific_user') {
        if (config.whatsapp_user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', config.whatsapp_user_id)
            .single();
          if (profile?.phone) {
            targetNumbers.push(profile.phone);
          }
        }
      } else {
        // all_team — fetch all profiles in organization with phone
        const { data: profiles } = await supabase
          .from('profiles')
          .select('phone')
          .eq('organization_id', webhook.organization_id)
          .not('phone', 'is', null);

        if (profiles) {
          for (const p of profiles) {
            if (p.phone) targetNumbers.push(p.phone);
          }
        }
      }

      if (targetNumbers.length === 0) {
        return { lead_id: existingLeadId, skipped: true, reason: 'No target phone numbers found' };
      }

      // Send to each number via configured provider
      const results: { number: string; success: boolean; error?: string }[] = [];

      for (const number of targetNumbers) {
        try {
          let cleanNumber = number.replace(/\D/g, '');
          if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;

          if (wpProvider === 'botconversa' && bcKey) {
            const lookupResp = await fetch(
              `https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/${cleanNumber}/`,
              { headers: { 'API-KEY': bcKey } }
            );
            if (lookupResp.ok) {
              const sub = await lookupResp.json();
              const sendResp = await fetch(
                `https://backend.botconversa.com.br/api/v1/webhook/subscriber/${sub.id}/send_message/`,
                {
                  method: 'POST',
                  headers: { 'API-KEY': bcKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'text', value: message }),
                }
              );
              if (!sendResp.ok) {
                const errText = await sendResp.text();
                results.push({ number: cleanNumber, success: false, error: `HTTP ${sendResp.status}` });
              } else {
                results.push({ number: cleanNumber, success: true });
              }
            } else {
              results.push({ number: cleanNumber, success: false, error: 'Subscriber not found' });
            }
          } else if (isichatToken) {
            const resp = await fetch('https://api.isichat.com.br/api/messages/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${isichatToken}`,
              },
              body: JSON.stringify({ number: cleanNumber, body: message }),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              results.push({ number: cleanNumber, success: false, error: `HTTP ${resp.status}` });
            } else {
              results.push({ number: cleanNumber, success: true });
            }
          }
        } catch (e: any) {
          console.error(`[Webhook/WhatsApp] Error sending to ${number}:`, e);
          results.push({ number, success: false, error: e.message });
        }
      }

      const sentCount = results.filter(r => r.success).length;
      return { lead_id: existingLeadId, whatsapp_sent_to: sentCount, results };
    }

    case 'ai_agent_outreach': {
      if (!existingLeadId) throw new Error('No lead for AI outreach');

      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        return { lead_id: existingLeadId, skipped: true, reason: 'LOVABLE_API_KEY not configured' };
      }

      // Removed duplicate lovableApiKey check - already checked above

      // 1. Get lead data
      const { data: lead } = await supabase
        .from('leads')
        .select('name, email, phone, metadata, temperature, deal_value')
        .eq('id', existingLeadId)
        .single();

      let leadPhone = lead?.phone?.replace(/\D/g, '');
      if (!leadPhone) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no phone/whatsapp' };
      }
      // Ensure 55 (Brazil DDI) prefix
      if (!leadPhone.startsWith('55')) {
        leadPhone = '55' + leadPhone;
      }

      // 2. Get agent config
      const agentId = config.ai_agent_id;
      if (!agentId) throw new Error('No AI agent specified');

      const { data: agent } = await supabase
        .from('product_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (!agent) throw new Error('AI agent not found');

      // Resolve widget ativo (coluna widget_id é NOT NULL em webchat_conversations)
      let outreachWidget = (await supabase
        .from('webchat_widgets')
        .select('id')
        .eq('organization_id', webhook.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()).data;

      if (!outreachWidget?.id) {
        const { data: createdWidget, error: createWidgetError } = await supabase
          .from('webchat_widgets')
          .insert({
            organization_id: webhook.organization_id,
            name: 'Outreach (automático)',
            is_active: true,
          })
          .select('id')
          .single();
        if (createWidgetError || !createdWidget?.id) {
          throw new Error(`Falha ao criar widget interno de outreach: ${createWidgetError?.message || 'sem id'}`);
        }
        outreachWidget = createdWidget;
      }

      // 3. Get product knowledge (brain)
      const { data: knowledgeSources } = await supabase
        .from('ai_knowledge_base')
        .select('title, content, category')
        .eq('product_id', agent.product_id)
        .eq('is_active', true)
        .limit(10);

      const knowledgeContext = (knowledgeSources || [])
        .map((k: any) => `[${k.category}] ${k.title}: ${k.content}`)
        .join('\n\n');

      // 4. Build lead context from metadata (form responses etc)
      const leadMetadata = lead?.metadata || {};
      const customFields = leadMetadata.custom_fields || {};
      const formResponses = Object.entries(customFields)
        .map(([key, val]) => `- ${key}: ${val}`)
        .join('\n');

      // 5. Build AI prompt
      const systemPrompt = `Você é ${agent.name}, um agente de ${agent.agent_type} da empresa.

MISSÃO: ${agent.primary_objective}

TOM DE VOZ: ${agent.tone_style || 'Consultivo'}
ESTILO DE MENSAGEM: ${agent.message_style || 'Curta e objetiva'}

${agent.can_do?.length ? `O QUE VOCÊ PODE FAZER:\n${agent.can_do.map((c: any) => `- ${c}`).join('\n')}` : ''}
${agent.cannot_do?.length ? `O QUE VOCÊ NÃO PODE FAZER:\n${agent.cannot_do.map((c: any) => `- ${c}`).join('\n')}` : ''}

${knowledgeContext ? `CONHECIMENTO DO PRODUTO:\n${knowledgeContext}` : ''}

OBJETIVO DESTA ABORDAGEM: ${config.ai_objective || 'Abordar o lead de forma estratégica'}
${config.ai_extra_context ? `CONTEXTO ADICIONAL: ${config.ai_extra_context}` : ''}

REGRAS:
- Gere APENAS a mensagem, sem explicações ou prefixos
- Seja natural e humano, NÃO pareça um bot
- Personalize com as informações do lead
- A mensagem deve ser para WhatsApp (curta, direta, sem formatação HTML)
- Termine com uma pergunta ou CTA claro`;

      const userPrompt = `Gere uma mensagem de primeira abordagem via WhatsApp para este lead:

Nome: ${lead?.name || 'Lead'}
Email: ${lead?.email || 'Não informado'}
Telefone: ${leadPhone}
Temperatura: ${lead?.temperature || 'indefinida'}
Valor do Deal: ${lead?.deal_value || 'Não definido'}
${formResponses ? `\nRespostas do Formulário:\n${formResponses}` : ''}`;

      // 6. Call AI to generate message
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error('[Webhook/AIOutreach] AI error:', aiResponse.status, errText);
        throw new Error(`AI generation failed: HTTP ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();

      if (!generatedMessage) {
        throw new Error('AI returned empty message');
      }

      console.log(`[Webhook/AIOutreach] Generated message for ${lead?.name}: ${generatedMessage.slice(0, 100)}...`);

      // 7. Determine WhatsApp provider
      const { data: providerSetting } = await supabase
        .from('integration_settings')
        .select('settings')
        .eq('organization_id', webhook.organization_id)
        .eq('integration_type', 'whatsapp_provider')
        .maybeSingle();

      const provSettings = providerSetting?.settings as Record<string, unknown> | null;
      const whatsappProvider = (provSettings?.provider as string) || 'evolution_go';
      const botConversaKey = (provSettings?.botconversa_api_key as string) || Deno.env.get('BOTCONVERSA_API_KEY');

      // Priority 1: Evolution Go (looks up first connected instance for the organization)
      if (whatsappProvider === 'evolution_go') {
        const preferredInstanceId = (provSettings?.evolution_instance_id as string) || null;

        let instanceQuery = supabase
          .from('evolution_instances')
          .select('id, name, status')
          .eq('organization_id', webhook.organization_id);

        if (preferredInstanceId) {
          instanceQuery = instanceQuery.eq('id', preferredInstanceId);
        } else {
          instanceQuery = instanceQuery.or('status.eq.connected,status.eq.online').order('updated_at', { ascending: false }).limit(1);
        }

        const { data: instances, error: instErr } = await instanceQuery;
        const instance = instances?.[0];

        if (instErr || !instance) {
          throw new Error(`Evolution Go: nenhuma instância conectada encontrada para esta organização (${instErr?.message || 'sem registros'})`);
        }

        console.log(`[Webhook/AIOutreach] Sending via Evolution Go instance ${instance.name} (${instance.id}) to ${leadPhone}`);

        const result = await sendUazapiTextMessage({
          supabase,
          organization_id: webhook.organization_id,
          instance_id: instance.id,
          phone: leadPhone,
          text: generatedMessage,
          source: "ai_outreach"
        });

        if (!result.success) {
          throw new Error(`Evolution Go send failed: ${result.message}`);
        }
        console.log(`[Webhook/AIOutreach] Evolution Go send OK: ${result.external_id}`);

      } else if (whatsappProvider === 'botconversa' && botConversaKey) {
        // Send via BotConversa
        const lookupResp = await fetch(
          `https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/${leadPhone}/`,
          { headers: { 'API-KEY': botConversaKey } }
        );
        if (!lookupResp.ok) {
          const errText = await lookupResp.text();
          if (lookupResp.status === 404) {
            console.warn(`[Webhook/AIOutreach] BotConversa subscriber not found for ${leadPhone} — skipping WhatsApp send`);
            // Still create conversation and outreach queue but mark as skipped
            const { data: conversation } = await supabase
              .from('webchat_conversations')
              .insert({
                organization_id: webhook.organization_id,
                widget_id: outreachWidget.id,
                visitor_id: crypto.randomUUID(),
                visitor_name: lead?.name || 'Lead',
                visitor_email: lead?.email,
                visitor_phone: leadPhone,
                channel: 'whatsapp',
                status: 'bot_active',
                lead_id: existingLeadId,
                current_agent_id: agentId,
                metadata: {
                  ai_outreach: true,
                  ai_objective: config.ai_objective,
                  whatsapp_skipped: true,
                  skip_reason: 'subscriber_not_found',
                },
              })
              .select()
              .single();

            return { 
              lead_id: existingLeadId, 
              skipped: true, 
              reason: 'BotConversa subscriber not found for this phone number',
              ai_message_generated: generatedMessage,
              conversation_id: conversation?.id,
            };
          }
          throw new Error(`BotConversa subscriber lookup failed: HTTP ${lookupResp.status} ${errText}`);
        }
        const subscriber = await lookupResp.json();
        const sendResp = await fetch(
          `https://backend.botconversa.com.br/api/v1/webhook/subscriber/${subscriber.id}/send_message/`,
          {
            method: 'POST',
            headers: { 'API-KEY': botConversaKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'text', value: generatedMessage }),
          }
        );
        if (!sendResp.ok) {
          const errText = await sendResp.text();
          throw new Error(`BotConversa send failed: HTTP ${sendResp.status} ${errText}`);
        }
        await sendResp.text();
      } else {
        // Send via IsiChat (default)
        const isichatToken = Deno.env.get('ISICHAT_TOKEN');
        if (!isichatToken) throw new Error('No WhatsApp provider configured');
        
        const sendResp = await fetch('https://api.isichat.com.br/api/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${isichatToken}`,
          },
          body: JSON.stringify({ number: leadPhone, body: generatedMessage }),
        });
        if (!sendResp.ok) {
          const errText = await sendResp.text();
          throw new Error(`IsiChat send failed: HTTP ${sendResp.status} ${errText}`);
        }
        await sendResp.text();
      }

      // 8. Create conversation in inbox
      const { data: conversation } = await supabase
        .from('webchat_conversations')
        .insert({
          organization_id: webhook.organization_id,
          widget_id: outreachWidget.id,
          visitor_id: crypto.randomUUID(),
          visitor_name: lead?.name || 'Lead',
          visitor_email: lead?.email,
          visitor_phone: leadPhone,
          channel: 'whatsapp',
          status: 'bot_active',
          lead_id: existingLeadId,
          current_agent_id: agentId,
          metadata: {
            ai_outreach: true,
            ai_objective: config.ai_objective,
          },
        })
        .select()
        .single();

      // 9. Save outbound message
      if (conversation) {
        await supabase
          .from('webchat_messages')
          .insert({
            conversation_id: conversation.id,
            content: generatedMessage,
            sender_type: 'bot',
            direction: 'outbound',
          });
      }

      // 10. Create outreach queue entry for follow-up tracking
      const followupEnabled = config.ai_followup_enabled || false;
      const steps: Array<{delay_hours: number; instruction?: string}> = config.ai_followup_steps || [];
      const businessStart = config.ai_business_hours_start || '09:00';
      const businessEnd = config.ai_business_hours_end || '18:00';
      const businessDays: number[] = config.ai_business_days || [1, 2, 3, 4, 5];

      // Calculate first follow-up time respecting business hours
      let nextFollowupAt: string | null = null;
      if (followupEnabled && steps.length > 0) {
        const firstDelay = steps[0].delay_hours;
        const raw = new Date(Date.now() + firstDelay * 3600000);
        nextFollowupAt = adjustToBusinessHours(raw, businessStart, businessEnd, businessDays).toISOString();
      } else if (followupEnabled) {
        // Legacy fallback
        const intervalHours = config.ai_followup_interval_hours || 24;
        nextFollowupAt = new Date(Date.now() + intervalHours * 3600000).toISOString();
      }

      await supabase
        .from('ai_outreach_queue')
        .insert({
          organization_id: webhook.organization_id,
          lead_id: existingLeadId,
          conversation_id: conversation?.id,
          product_id: webhook.product_id,
          agent_id: agentId,
          webhook_id: webhook.id,
          objective: config.ai_objective,
          extra_context: config.ai_extra_context,
          lead_data: {
            name: lead?.name,
            email: lead?.email,
            phone: leadPhone,
            metadata: leadMetadata,
          },
          status: 'sent',
          followup_enabled: followupEnabled,
          followup_interval_hours: config.ai_followup_interval_hours || 24,
          max_followups: steps.length > 0 ? steps.length : (config.ai_max_followups || 3),
          followup_steps: steps,
          business_hours_start: businessStart,
          business_hours_end: businessEnd,
          business_days: businessDays,
          followups_sent: 0,
          last_outreach_at: new Date().toISOString(),
          next_followup_at: nextFollowupAt,
        });

      console.log(`[Webhook/AIOutreach] Complete: message sent to ${leadPhone}, conversation ${conversation?.id}`);

      return {
        lead_id: existingLeadId,
        ai_outreach_sent: true,
        conversation_id: conversation?.id,
        message_preview: generatedMessage.slice(0, 100),
      };
    }

    case 'trigger_flow': {
      if (!existingLeadId) throw new Error('No lead to trigger flow for');
      const flowId = config.flow_id;
      const agentId = config.flow_agent_id || null;
      const channel = (config.flow_channel as 'whatsapp' | 'webchat') || 'whatsapp';
      const assignedUserId: string | null = config.flow_assigned_user_id || null;
      const sectorId: string | null = config.flow_sector_id || null;
      if (!flowId) throw new Error('flow_id is required');

      // 1. Carrega lead, funil e (opcionalmente) agente
      const { data: lead } = await supabase
        .from('leads')
        .select('name, email, phone')
        .eq('id', existingLeadId)
        .single();

      const { data: funnel } = await supabase
        .from('capture_funnels')
        .select('id, name, status, flow_blocks, start_block_id, organization_id')
        .eq('id', flowId)
        .maybeSingle();
      if (!funnel) throw new Error('Funil não encontrado');
      if (funnel.organization_id !== webhook.organization_id) {
        throw new Error('Funil pertence a outra organização');
      }

      if (agentId) {
        const { data: agent } = await supabase
          .from('product_agents')
          .select('id, name, organization_id')
          .eq('id', agentId)
          .maybeSingle();
        if (!agent) throw new Error('Agente não encontrado');
        if (agent.organization_id !== webhook.organization_id) {
          throw new Error('Agente pertence a outra organização');
        }
      }

      // 2. Determina o primeiro bloco
      const blocks: any[] = (funnel.flow_blocks as any[]) || [];
      const startBlockId: string | null = (funnel as any).start_block_id || blocks[0]?.id || null;
      const startBlock = blocks.find((b: any) => b.id === startBlockId) || blocks[0] || null;

      // 3. Telefone normalizado (BR)
      let leadPhone = (lead?.phone || '').replace(/\D/g, '');
      if (leadPhone && !leadPhone.startsWith('55')) leadPhone = '55' + leadPhone;

      if (channel === 'whatsapp' && !leadPhone) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead sem telefone para WhatsApp' };
      }

      // 4. Resolve um widget ativo da organização (coluna widget_id é NOT NULL)
      let widgetRow = (await supabase
        .from('webchat_widgets')
        .select('id')
        .eq('organization_id', webhook.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()).data;

      if (!widgetRow?.id) {
        const { data: createdWidget, error: createWidgetError } = await supabase
          .from('webchat_widgets')
          .insert({
            organization_id: webhook.organization_id,
            name: 'Outreach (automático)',
            is_active: true,
          })
          .select('id')
          .single();
        if (createWidgetError || !createdWidget?.id) {
          throw new Error(`Falha ao criar widget interno de outreach: ${createWidgetError?.message || 'sem id'}`);
        }
        widgetRow = createdWidget;
      }

      // 5. Determina status inicial conforme atribuição
      // - com agente IA  -> bot_active
      // - com vendedor   -> human_active (já aceito)
      // - sem nada       -> human_active (entra direto no atendimento por solicitação do usuário)
      let initialStatus: 'bot_active' | 'human_active';
      if (agentId) initialStatus = 'bot_active';
      else initialStatus = 'human_active';

      // 6. Cria/atualiza conversa com contexto do fluxo
      const conversationPayload: Record<string, any> = {
        organization_id: webhook.organization_id,
        widget_id: widgetRow.id,
        visitor_id: crypto.randomUUID(),
        visitor_name: lead?.name || 'Lead',
        visitor_email: lead?.email,
        visitor_phone: channel === 'whatsapp' ? leadPhone : null,
        channel: channel === 'whatsapp' ? 'whatsapp' : 'webchat',
        status: initialStatus,
        lead_id: existingLeadId,
        current_agent_id: agentId,
        current_flow_id: flowId,
        current_block_id: startBlock?.id || null,
        flow_completed: false,
        flow_source: 'webhook_trigger',
        sector_id: sectorId,
        assigned_user_id: assignedUserId,
        accepted_at: assignedUserId ? new Date().toISOString() : null,
        metadata: {
          trigger_flow: true,
          webhook_id: webhook.id,
        },
      };

      const { data: conversation, error: convErr } = await supabase
        .from('webchat_conversations')
        .insert(conversationPayload)
        .select()
        .single();
      if (convErr) throw new Error(`Falha ao criar conversa: ${convErr.message}`);

      // Se vendedor foi atribuído, refletir no lead também (Single Attendant trigger cuida do resto)
      if (assignedUserId) {
        await supabase
          .from('leads')
          .update({ assigned_to: assignedUserId })
          .eq('id', existingLeadId);
      }

      // 5. Se canal WhatsApp e bloco inicial é mensagem, envia primeira mensagem via Evolution Go
      let firstMessageSent: string | null = null;
      if (channel === 'whatsapp' && startBlock) {
        const blockData = startBlock.data || {};
        let messageText: string =
          blockData.content ||
          blockData.message ||
          blockData.text ||
          blockData.greeting ||
          '';
        if (messageText && lead) {
          messageText = messageText
            .replace(/\{nome_lead\}/gi, lead.name || '')
            .replace(/\{name\}/gi, lead.name || '')
            .replace(/\{email\}/gi, lead.email || '')
            .replace(/\{phone\}/gi, lead.phone || '');
        }

        if (messageText) {
          // Resolve instância
          const preferredInstanceId = config.flow_evolution_instance_id || null;
          let instanceQuery = supabase
            .from('evolution_instances')
            .select('id, name, status')
            .eq('organization_id', webhook.organization_id);
          if (preferredInstanceId) {
            instanceQuery = instanceQuery.eq('id', preferredInstanceId);
          } else {
            instanceQuery = instanceQuery
              .or('status.eq.connected,status.eq.online')
              .order('updated_at', { ascending: false })
              .limit(1);
          }
          const { data: instances } = await instanceQuery;
          const instance = instances?.[0];
          if (!instance) {
            throw new Error('Nenhuma instância WhatsApp conectada para a organização');
          }

          const result = await sendUazapiTextMessage({
            supabase,
            organization_id: webhook.organization_id,
            instance_id: instance.id,
            phone: leadPhone,
            text: messageText,
            source: "trigger_flow"
          });

          if (!result.success) {
            throw new Error(`Falha ao enviar primeira mensagem: ${result.message}`);
          }


          // Salva mensagem outbound no histórico
          await supabase.from('webchat_messages').insert({
            conversation_id: conversation.id,
            content: messageText,
            sender_type: 'bot',
            direction: 'outbound',
          });
          firstMessageSent = messageText;
        }
      }

      console.log(`[Webhook/TriggerFlow] flow=${flowId} agent=${agentId} channel=${channel} conv=${conversation.id}`);

      return {
        lead_id: existingLeadId,
        flow_id: flowId,
        agent_id: agentId,
        channel,
        conversation_id: conversation.id,
        start_block_id: startBlock?.id || null,
        first_message_sent: firstMessageSent,
      };
    }

    default:
      console.log(`[Webhook] Unknown action type: ${action.type}`);
      return { skipped: true, reason: 'Unknown action type' };
  }
}