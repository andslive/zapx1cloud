// Post-sale engine: executes configured actions for an event+product combination.
// Reads `post_sale_event_actions` and runs: stage move, email, AI agent outreach, notify.
//
// Used by all payment platform webhooks (Doppus, Hotmart, Cakto, Kiwify, ...).

interface PostSaleContext {
  organizationId: string;
  productId: string | null;
  eventType:
    | 'compra_aprovada'
    | 'pix_gerado'
    | 'boleto_gerado'
    | 'checkout_abandonado'
    | 'reembolso'
    | 'chargeback'
    | 'assinatura_cancelada';
  leadId: string;
  // Free-form context that becomes available to the AI agent prompt and emails.
  // Examples: { product_name, amount, currency, payment_method, checkout_url }
  eventData?: Record<string, unknown>;
  source: 'doppus' | 'hotmart' | 'cakto' | 'kiwify' | 'other';
}

interface ActionResult {
  action: string;
  success: boolean;
  detail?: unknown;
  error?: string;
}

// Canonical Brazilian normalization — matches public.normalize_phone_br()
function normalizePhone(raw?: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  let d = String(raw).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length < 8) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.substring(2);
  }
  if (d.length === 10) {
    const ddd = d.substring(0, 2);
    const rest = d.substring(2);
    if (/^[6-9]/.test(rest)) {
      d = ddd + '9' + rest;
    }
  }
  if (d.length === 10 || d.length === 11) {
    d = '55' + d;
  }
  return d;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v ?? '');
  }
  return out.replace(/\{\{[^}]+\}\}/g, '');
}

function buildVars(
  lead: { name?: string | null; email?: string | null; phone?: string | null },
  eventData?: Record<string, unknown>,
): Record<string, string> {
  const vars: Record<string, string> = {
    lead_name: lead?.name || '',
    lead_email: lead?.email || '',
    lead_phone: lead?.phone || '',
    name: lead?.name || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
  };
  if (eventData) {
    for (const [k, v] of Object.entries(eventData)) {
      if (k === '__raw' || v == null) continue;
      if (typeof v === 'object') {
        try { vars[k] = JSON.stringify(v); } catch { /* skip */ }
      } else {
        vars[k] = String(v);
      }
    }
  }
  return vars;
}

const CLOSING_EVENTS = new Set([
  'compra_aprovada',
  'reembolso',
  'chargeback',
  'assinatura_cancelada',
]);

export async function runPostSaleActions(
  supabase: any,
  ctx: PostSaleContext,
): Promise<{ executed: ActionResult[]; matched: boolean }> {
  const results: ActionResult[] = [];

  // 0) Cancela disparos pendentes de eventos transitórios quando chega um evento "final".
  // Evita situação onde o lead pagou mas a régua de "Pix pendente" ainda dispara.
  if (CLOSING_EVENTS.has(ctx.eventType)) {
    try {
      const { data: cancelled, error: cancelErr } = await supabase
        .from('post_sale_scheduled_runs')
        .update({
          status: 'cancelled',
          last_error: `cancelled_by_event:${ctx.eventType}`,
          executed_at: new Date().toISOString(),
        })
        .eq('lead_id', ctx.leadId)
        .eq('status', 'pending')
        .in('event_type', ['pix_gerado', 'boleto_gerado', 'checkout_abandonado'])
        .select('id');
      if (cancelErr) throw cancelErr;
      const n = cancelled?.length ?? 0;
      if (n > 0) {
        await supabase.from('lead_notes').insert({
          lead_id: ctx.leadId,
          organization_id: ctx.organizationId,
          content: `${n} disparo(s) pós-venda pendente(s) cancelado(s) após evento "${ctx.eventType}".`,
          note_type: 'system',
        });
      }
      results.push({ action: 'cancel_pending_runs', success: true, detail: { cancelled: n } });
    } catch (err) {
      results.push({ action: 'cancel_pending_runs', success: false, error: (err as Error).message });
    }
  }

  // 1) Aplica automações de tag (add + remove conforme tag_id_to_remove).
  try {
    await supabase.rpc('apply_tag_automations', {
      p_lead_id: ctx.leadId,
      p_event_type: ctx.eventType,
      p_product_id: ctx.productId,
      p_organization_id: ctx.organizationId,
    });
    results.push({ action: 'apply_tag_automations', success: true });
  } catch (err) {
    results.push({ action: 'apply_tag_automations', success: false, error: (err as Error).message });
  }

  // 2) Lookup configured action card
  const query = supabase
    .from('post_sale_event_actions')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('event_type', ctx.eventType)
    .eq('is_active', true);

  const { data: actions } = ctx.productId
    ? await query.eq('product_id', ctx.productId)
    : await query;

  if (!actions || actions.length === 0) {
    return { executed: results, matched: false };
  }

  const action = actions[0];

  // 3) Load lead minimal info
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, email, phone, organization_id, product_id, current_stage_id, deal_value, metadata')
    .eq('id', ctx.leadId)
    .single();

  if (!lead) {
    results.push({ action: 'load_lead', success: false, error: 'Lead not found' });
    return { executed: results, matched: true };
  }

  // 3.1) Add tags
  if (Array.isArray(action.add_tag_ids) && action.add_tag_ids.length > 0) {
    try {
      const rows = action.add_tag_ids.map((tag_id: string) => ({
        lead_id: lead.id, tag_id, source: 'webhook' as const,
      }));
      const { error } = await supabase.from('lead_tag_assignments').upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });
      if (error) throw error;
      results.push({ action: 'add_tags', success: true, detail: action.add_tag_ids });
    } catch (err) {
      results.push({ action: 'add_tags', success: false, error: (err as Error).message });
    }
  }

  // 3.2) Remove tags
  if (Array.isArray(action.remove_tag_ids) && action.remove_tag_ids.length > 0) {
    try {
      const { error } = await supabase
        .from('lead_tag_assignments')
        .delete()
        .eq('lead_id', lead.id)
        .in('tag_id', action.remove_tag_ids);
      if (error) throw error;
      results.push({ action: 'remove_tags', success: true, detail: action.remove_tag_ids });
    } catch (err) {
      results.push({ action: 'remove_tags', success: false, error: (err as Error).message });
    }
  }

  // 4) Move stage + deal value/outcome
  if (action.target_stage_id) {
    try {
      const update: Record<string, any> = { current_stage_id: action.target_stage_id };
      if (action.deal_value_source === 'webhook' && ctx.eventData?.amount != null) {
        const amt = Number(ctx.eventData.amount);
        if (!Number.isNaN(amt)) update.deal_value = amt;
      } else if (action.deal_value_source === 'manual' && action.deal_value_manual != null) {
        update.deal_value = Number(action.deal_value_manual);
      }
      if (action.deal_outcome === 'won' || action.deal_outcome === 'lost') {
        update.metadata = { ...(lead.metadata || {}), deal_outcome: action.deal_outcome };
      }
      await supabase.from('leads').update(update).eq('id', lead.id);
      await supabase.from('lead_stage_history').insert({
        lead_id: lead.id,
        stage_id: action.target_stage_id,
      });
      results.push({ action: 'move_stage', success: true, detail: action.target_stage_id });
    } catch (err) {
      results.push({ action: 'move_stage', success: false, error: (err as Error).message });
    }
  }

  // Delay: se configurado, enfileira mensagem/agente/email para mais tarde.
  const delayMin = Number(action.delay_minutes ?? 0) || 0;
  const hasDelayedWork = !!(action.inline_message || action.agent_id || action.email_template_id);
  const isDelayed = delayMin > 0 && hasDelayedWork;
  // 4.1) Send flow or inline message
  if (!isDelayed && action.send_mode === 'message' && action.inline_message) {
    try {
      const vars: Record<string, string> = buildVars(lead, ctx.eventData);
      const message = replaceVars(action.inline_message, vars);
      if (action.message_channel === 'whatsapp' && lead.phone) {
        const phone = normalizePhone(lead.phone);
        const { data: sendData, error: sendErr } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            type: 'text',
            to: phone,
            payload: { text: message },
            organization_id: ctx.organizationId,
            instance_id: action.evolution_instance_id ?? undefined,
          },
        });
        if (sendErr || (sendData && sendData.error)) {
          throw new Error(sendErr?.message || sendData?.error || 'whatsapp-send failed');
        }
      } else if (action.message_channel === 'email' && lead.email) {
        await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_email',
          payload: {
            to: lead.email,
            subject: `Sobre ${ctx.eventData?.product_name ?? 'sua compra'}`,
            html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
            organization_id: ctx.organizationId,
            lead_id: lead.id,
          },
        });
      }
      results.push({ action: 'send_inline_message', success: true });
    } catch (err) {
      results.push({ action: 'send_inline_message', success: false, error: (err as Error).message });
    }
  } else if (!isDelayed && action.send_mode === 'flow' && action.flow_id) {
    // Flow execution: por ora apenas registramos o disparo no metadata do lead
    // (motor de execução de chat_flows é acionado em outro contexto).
    try {
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        organization_id: ctx.organizationId,
        content: `Fluxo pós-venda disparado (evento: ${ctx.eventType})`,
        note_type: 'system',
        metadata: { flow_id: action.flow_id, event_type: ctx.eventType },
      });
      results.push({ action: 'send_flow', success: true, detail: action.flow_id });
    } catch (err) {
      results.push({ action: 'send_flow', success: false, error: (err as Error).message });
    }
  }

  // 4.2) Forward lead to sector or user
  if (action.assign_user_id || action.assign_sector_id) {
    try {
      const update: Record<string, any> = {};
      if (action.assign_user_id) update.assigned_to = action.assign_user_id;
      if (action.assign_sector_id) update.sector_id = action.assign_sector_id;
      await supabase.from('leads').update(update).eq('id', lead.id);
      results.push({ action: 'forward_lead', success: true, detail: update });
    } catch (err) {
      results.push({ action: 'forward_lead', success: false, error: (err as Error).message });
    }
  }

  // Enfileira disparos atrasados (mensagem/agente/email) na fila de scheduled_runs
  if (isDelayed) {
    try {
      const runAt = new Date(Date.now() + delayMin * 60_000).toISOString();
      const { error: schedErr } = await supabase.from('post_sale_scheduled_runs').insert({
        organization_id: ctx.organizationId,
        product_id: ctx.productId,
        action_id: action.id,
        lead_id: lead.id,
        event_type: ctx.eventType,
        source: ctx.source,
        event_data: ctx.eventData || {},
        run_at: runAt,
      });
      if (schedErr) throw schedErr;
      results.push({ action: 'schedule_delayed', success: true, detail: { run_at: runAt, delay_minutes: delayMin } });
    } catch (err) {
      results.push({ action: 'schedule_delayed', success: false, error: (err as Error).message });
    }
  }

  // 5) Send email via template
  if (!isDelayed && action.email_template_id && lead.email) {
    try {
      const { data: tpl } = await supabase
        .from('email_templates')
        .select('subject, html_content, text_content, name')
        .eq('id', action.email_template_id)
        .single();

      if (tpl) {
        const vars = buildVars(lead, ctx.eventData);

        const subject = replaceVars(tpl.subject || '', vars);
        const html = replaceVars(tpl.html_content || '', vars);

        // Enqueue via existing email queue
        await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_email',
          payload: {
            to: lead.email,
            subject,
            html,
            organization_id: ctx.organizationId,
            template_id: action.email_template_id,
            lead_id: lead.id,
          },
        });
        results.push({ action: 'send_email', success: true });
      }
    } catch (err) {
      results.push({ action: 'send_email', success: false, error: (err as Error).message });
    }
  }

  // 6) Notify user (in-app)
  if (action.notify_user_id) {
    try {
      await supabase.from('notifications').insert({
        user_id: action.notify_user_id,
        type: 'system',
        title: `Evento pós-venda: ${ctx.eventType}`,
        message: `Lead ${lead.name || lead.email || lead.phone} — ${ctx.eventType} (${ctx.source})`,
        product_id: ctx.productId,
        metadata: { lead_id: lead.id, event_type: ctx.eventType, source: ctx.source },
      });
      results.push({ action: 'notify_user', success: true });
    } catch (err) {
      results.push({ action: 'notify_user', success: false, error: (err as Error).message });
    }
  }

  // 7) AI agent outreach — invoke webhook-receiver internally via existing path
  //    To avoid duplicating ~200 LOC of agent message generation, we delegate to
  //    the dedicated edge function `manual-outreach` (single lead, full agent context).
  if (!isDelayed && action.agent_id && lead.phone) {
    try {
      // Pré-checagem: instância WhatsApp precisa estar conectada antes de tentar enviar.
      // Se a action tem instance_id específico, valida ela; senão, basta existir alguma `connected` na org.
      let instanceOk = false;
      if (action.evolution_instance_id) {
        const { data: inst } = await supabase
          .from('evolution_instances')
          .select('status')
          .eq('id', action.evolution_instance_id)
          .eq('organization_id', ctx.organizationId)
          .maybeSingle();
        instanceOk = inst?.status === 'connected' || inst?.status === 'online';
      } else {
        const { data: anyInst } = await supabase
          .from('evolution_instances')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .or('status.eq.connected,status.eq.online')
          .limit(1)
          .maybeSingle();
        instanceOk = !!anyInst?.id;
      }

      if (!instanceOk) {
        results.push({
          action: 'ai_agent_outreach',
          success: false,
          error: 'whatsapp_disconnected',
        });
        // Notifica admins da empresa: compra processada mas mensagem não saiu.
        try {
          await supabase.from('admin_notifications').insert({
            organization_id: ctx.organizationId,
            type: 'system',
            title: 'WhatsApp desconectado — mensagem pós-venda não enviada',
            message: `Lead ${lead.name || lead.email || lead.phone} comprou (${ctx.eventType}) mas a instância do WhatsApp não está conectada. Reconecte para retomar os envios.`,
            action_url: '/admin?tab=integrations',
            scope: 'all',
            scope_filters: {
              lead_id: lead.id,
              event_type: ctx.eventType,
              source: ctx.source,
              evolution_instance_id: action.evolution_instance_id ?? null,
            },
          });
        } catch (notifErr) {
          console.error('[post-sale-engine] admin_notifications insert failed', notifErr);
        }
      } else {
        const { data: outreachData, error: outreachErr } = await supabase.functions.invoke(
          'manual-outreach',
          {
            body: {
              lead_ids: [lead.id],
              agent_id: action.agent_id,
              organization_id: ctx.organizationId,
              instance_id: action.evolution_instance_id ?? undefined,
              objective: action.agent_objective || `Evento ${ctx.eventType}`,
              extra_context: action.agent_extra_context,
              mode: (action as any).agent_outreach_mode || 'direct',
              event_context: {
                event_type: ctx.eventType,
                source: ctx.source,
                ...(ctx.eventData || {}),
              },
            },
          },
        );

        if (outreachErr) throw outreachErr;
        results.push({ action: 'ai_agent_outreach', success: true, detail: outreachData });
      }
    } catch (err) {
      results.push({ action: 'ai_agent_outreach', success: false, error: (err as Error).message });
    }
  }

  // 8) Log execution
  try {
    await supabase.from('post_sale_event_logs').insert({
      organization_id: ctx.organizationId,
      product_id: ctx.productId,
      event_type: ctx.eventType,
      lead_id: lead.id,
      source: ctx.source,
      action_id: action.id,
      executed_actions: results,
      event_data: ctx.eventData || {},
    });
  } catch {
    // log table optional; ignore failure
  }

  return { executed: results, matched: true };
}

export { type PostSaleContext, normalizePhone };
