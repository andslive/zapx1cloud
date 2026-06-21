// Recebe eventos da Cakto (via cakto-webhook), decide se dispara o agente de
// recuperação automática e envia a primeira mensagem via WhatsApp.
//
// Fluxo:
// 1) Lê config da org (cakto_recovery_config)
// 2) Verifica se o evento está habilitado
// 3) Aplica cooldown (não dispara o mesmo evento pro mesmo lead em <X min)
// 4) Localiza/cria o lead (pelo telefone/email da Cakto)
// 5) Gera mensagem inicial com a IA usando o agente configurado
// 6) Envia via WhatsApp (BotConversa ou IsiChat)
// 7) Cria a conversa (webchat_conversations) pra IA continuar respondendo
// 8) Loga em cakto_recovery_dispatches

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

type CaktoOrderItem = {
  product_cakto_id: string | null;
  name: string | null;
  role: 'main' | 'orderbump' | 'upsell' | 'downsell';
  amount: number | null;
  quantity: number;
};

type CaktoOrderRow = {
  id: string;
  organization_id: string;
  cakto_id: string;
  status: string;
  amount: number | null;
  product_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  pix_code: string | null;
  checkout_url: string | null;
  items: CaktoOrderItem[] | null;
};

const STATUS_TO_EVENT: Record<string, 'abandoned' | 'paid' | 'refunded'> = {
  pending: 'abandoned',
  waiting_payment: 'abandoned',
  paid: 'paid',
  approved: 'paid',
  refunded: 'refunded',
  chargeback: 'refunded',
};

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

  let payload: { cakto_order_id?: string; organization_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const { cakto_order_id, organization_id } = payload;
  if (!cakto_order_id || !organization_id) {
    return json({ error: 'cakto_order_id e organization_id obrigatórios' }, 400);
  }

  // 1) Carrega o pedido
  const { data: order, error: orderErr } = await supabase
    .from('cakto_orders')
    .select(
      'id, organization_id, cakto_id, status, amount, product_id, product_name, customer_name, customer_email, customer_phone, payment_method, pix_code, checkout_url, items',
    )
    .eq('id', cakto_order_id)
    .maybeSingle<CaktoOrderRow>();

  if (orderErr || !order) {
    return json({ error: 'pedido não encontrado', details: orderErr?.message }, 404);
  }

  const event = STATUS_TO_EVENT[order.status];
  if (!event) {
    return json({ skipped: true, reason: `status sem mapeamento: ${order.status}` });
  }

  // 2) Config da org
  const { data: config } = await supabase
    .from('cakto_recovery_config')
    .select('*')
    .eq('organization_id', organization_id)
    .maybeSingle();

  if (!config || !config.is_enabled || !config.recovery_agent_id) {
    await logDispatch(supabase, {
      organization_id,
      cakto_order_id: order.id,
      cakto_event: event,
      cakto_status: order.status,
      success: false,
      skipped_reason: 'recovery_disabled',
    });
    return json({ skipped: true, reason: 'recovery disabled' });
  }

  const eventEnabled =
    (event === 'abandoned' && config.trigger_on_abandoned) ||
    (event === 'paid' && config.trigger_on_paid) ||
    (event === 'refunded' && config.trigger_on_refunded);

  if (!eventEnabled) {
    return json({ skipped: true, reason: `evento ${event} desativado` });
  }

  const phone = normalizePhone(order.customer_phone);
  if (!phone) {
    await logDispatch(supabase, {
      organization_id,
      cakto_order_id: order.id,
      cakto_event: event,
      cakto_status: order.status,
      success: false,
      skipped_reason: 'no_phone',
    });
    return json({ skipped: true, reason: 'sem telefone' });
  }

  // 3) Localiza lead pelo telefone ou email (cria se não existir)
  let leadId: string | null = null;
  {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('organization_id', organization_id)
      .or(
        [
          `phone.eq.${phone}`,
          order.customer_email ? `email.eq.${order.customer_email}` : null,
        ]
          .filter(Boolean)
          .join(','),
      )
      .maybeSingle();
    leadId = existing?.id ?? null;
  }

  if (!leadId) {
    const { data: created } = await supabase
      .from('leads')
      .insert({
        organization_id,
        name: order.customer_name || 'Cliente Cakto',
        email: order.customer_email,
        phone,
        product_id: order.product_id,
        lead_origin: 'cakto',
        lead_channel: 'whatsapp',
        metadata: { cakto_order_id: order.id, cakto_id: order.cakto_id },
      })
      .select('id')
      .single();
    leadId = created?.id ?? null;
  }

  if (!leadId) {
    return json({ error: 'falha ao criar/localizar lead' }, 500);
  }

  // 4) Cooldown: já disparou esse evento pra esse lead recentemente?
  const cooldownAt = new Date(Date.now() - config.cooldown_minutes * 60_000).toISOString();
  const { data: recent } = await supabase
    .from('cakto_recovery_dispatches')
    .select('id')
    .eq('lead_id', leadId)
    .eq('cakto_event', event)
    .eq('success', true)
    .gte('created_at', cooldownAt)
    .limit(1);

  if (recent && recent.length > 0) {
    await logDispatch(supabase, {
      organization_id,
      cakto_order_id: order.id,
      cakto_event: event,
      cakto_status: order.status,
      lead_id: leadId,
      success: false,
      skipped_reason: 'cooldown',
    });
    return json({ skipped: true, reason: 'cooldown ativo' });
  }

  // 5) Agente
  const { data: agent } = await supabase
    .from('product_agents')
    .select('*')
    .eq('id', config.recovery_agent_id)
    .maybeSingle();

  if (!agent) {
    return json({ error: 'agente de recuperação não encontrado' }, 404);
  }

  // Conhecimento (limitado pra não estourar contexto)
  const { data: knowledgeSources } = await supabase
    .from('ai_knowledge_base')
    .select('title, content, category')
    .eq('product_id', agent.product_id)
    .eq('is_active', true)
    .limit(8);

  const knowledgeContext = (knowledgeSources || [])
    .map((k: any) => `[${k.category}] ${k.title}: ${String(k.content).slice(0, 600)}`)
    .join('\n\n');

  // 5b) Carrega cenários pós-venda configurados pra esse evento
  const { data: scenariosRaw } = await supabase
    .from('agent_post_sale_scenarios')
    .select('name, instruction, links, tags_to_apply, filters, priority')
    .eq('organization_id', organization_id)
    .eq('trigger_event', event)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  type Scenario = {
    name: string;
    instruction: string;
    links: Array<{ label: string; url: string; when_to_offer?: string }> | null;
    tags_to_apply: string[] | null;
    filters: Record<string, unknown> | null;
    priority: number;
  };

  // Filtra cenários pelos filters (ex: produto específico, valor mínimo)
  const matchScenario = (s: Scenario): boolean => {
    const f = s.filters || {};
    if (f.product_cakto_id && order.product_cakto_id !== f.product_cakto_id) return false;
    if (typeof f.min_amount === 'number' && (order.amount ?? 0) < f.min_amount) return false;
    if (typeof f.max_amount === 'number' && (order.amount ?? 0) > f.max_amount) return false;
    if (Array.isArray(f.required_orderbumps) && f.required_orderbumps.length > 0) {
      const bumpIds = bumpItemsForFilter(items).map((b: any) => b.product_cakto_id);
      if (!f.required_orderbumps.every((id: string) => bumpIds.includes(id))) return false;
    }
    return true;
  };
  // Helper definido fora do trecho para evitar dependência circular de items
  function bumpItemsForFilter(arr: any[]): any[] {
    return (arr || []).filter((i) => i?.role === 'orderbump');
  }

  const scenarios: Scenario[] = ((scenariosRaw as Scenario[] | null) || []).filter(matchScenario);
  const scenarioTagsToApply = Array.from(
    new Set(scenarios.flatMap((s) => s.tags_to_apply || [])),
  );

  // 6) (provider WhatsApp removido — sempre Evolution Go)

  // 7) Gera a mensagem inicial
  // Monta a descrição da composição do pedido (principal + orderbumps)
  const items = Array.isArray(order.items) ? order.items : [];
  const mainItems = items.filter((i) => i.role === 'main');
  const bumpItems = items.filter((i) => i.role === 'orderbump');
  const upsellItems = items.filter((i) => i.role === 'upsell' || i.role === 'downsell');

  const formatItem = (i: CaktoOrderItem) =>
    `${i.name ?? 'item'}${i.amount ? ` (R$ ${i.amount.toFixed(2)})` : ''}`;

  let cartDescription = '';
  if (items.length > 1) {
    const parts: string[] = [];
    if (mainItems.length) parts.push(`Principal: ${mainItems.map(formatItem).join(', ')}`);
    if (bumpItems.length) parts.push(`Order bumps (${bumpItems.length}): ${bumpItems.map(formatItem).join(', ')}`);
    if (upsellItems.length) parts.push(`Upsells: ${upsellItems.map(formatItem).join(', ')}`);
    cartDescription = `\nCOMPOSIÇÃO DO CHECKOUT:\n- ${parts.join('\n- ')}\nTOTAL: R$ ${order.amount?.toFixed(2) ?? '?'}`;
  }

  const productLabel =
    items.length > 1
      ? `${order.product_name ?? 'o produto principal'} + ${bumpItems.length} bônus`
      : order.product_name ?? 'o produto';

  const eventBriefing =
    event === 'abandoned'
      ? `O cliente acabou de gerar um ${order.payment_method || 'pagamento'} no valor de R$ ${order.amount?.toFixed(2) ?? '?'} para "${productLabel}" mas AINDA NÃO PAGOU.${cartDescription}\n\nSua missão: tirar dúvidas, criar urgência leve e ajudar a finalizar. Se útil, ofereça reenviar o link/Pix. Se houver order bumps, mencione o conjunto, não só o principal.`
      : event === 'paid'
        ? `O cliente acabou de PAGAR R$ ${order.amount?.toFixed(2) ?? '?'} por "${productLabel}".${cartDescription}\n\nSua missão: agradecer, confirmar a compra, orientar próximos passos e — se fizer sentido — apresentar um upsell/cross-sell de algo que ele AINDA NÃO levou.`
        : `O cliente teve um pedido REEMBOLSADO/ESTORNADO no valor de R$ ${order.amount?.toFixed(2) ?? '?'} ("${productLabel}").${cartDescription}\n\nSua missão: ser empático, entender o motivo, recuperar a relação e — se possível — propor uma alternativa.`;

  const systemPrompt = `Você é ${agent.name}, agente de ${agent.agent_type} da empresa.
MISSÃO PRINCIPAL: ${agent.primary_objective}
TOM: ${agent.tone_style || 'Consultivo, próximo, sem pressão'}
ESTILO: ${agent.message_style || 'Curta, direta, humana'}

CONTEXTO DESTA CONVERSA — RECUPERAÇÃO AUTOMÁTICA CAKTO:
${eventBriefing}

${agent.can_do?.length ? `O QUE VOCÊ PODE FAZER:\n${agent.can_do.map((c: string) => `- ${c}`).join('\n')}` : ''}
${agent.cannot_do?.length ? `O QUE VOCÊ NÃO PODE FAZER:\n${agent.cannot_do.map((c: string) => `- ${c}`).join('\n')}` : ''}
${knowledgeContext ? `CONHECIMENTO DO PRODUTO:\n${knowledgeContext}` : ''}
${
  scenarios.length
    ? `\nCENÁRIOS DE PÓS-VENDA APLICÁVEIS (siga na ordem de prioridade — só faça o que estiver descrito aqui):\n${scenarios
        .map(
          (s, idx) =>
            `\n[Cenário ${idx + 1} — ${s.name}]\nInstrução: ${s.instruction}${
              s.links?.length
                ? `\nLinks disponíveis:\n${s.links.map((l) => `  • ${l.label}: ${l.url}${l.when_to_offer ? ` (oferecer quando: ${l.when_to_offer})` : ''}`).join('\n')}`
                : ''
            }`,
        )
        .join('\n')}`
    : ''
}

REGRAS DA MENSAGEM INICIAL:
- Gere APENAS a mensagem (sem prefixos, sem aspas, sem explicações)
- Use o nome do cliente: ${order.customer_name || 'cliente'}
- Mencione o que ele estava levando: ${productLabel}
- WhatsApp: curta (máx 2 parágrafos), sem markdown, sem emoji exagerado (1 só)
- Termine com pergunta clara
- NUNCA pareça um robô. Soa como vendedor humano que viu o pedido e resolveu chamar.`;

  const userPrompt = `Gere a mensagem inicial de WhatsApp para esta situação. Cliente: ${order.customer_name || 'sem nome'}. Telefone: ${phone}.`;

  const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
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

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    await logDispatch(supabase, {
      organization_id,
      cakto_order_id: order.id,
      cakto_event: event,
      cakto_status: order.status,
      lead_id: leadId,
      agent_id: agent.id,
      customer_phone: phone,
      customer_email: order.customer_email,
      success: false,
      error_message: `AI ${aiResp.status}: ${errText.slice(0, 200)}`,
    });
    return json({ error: 'AI failed', status: aiResp.status }, 500);
  }

  const aiData = await aiResp.json();
  const message: string | undefined = aiData.choices?.[0]?.message?.content?.trim();
  if (!message) {
    return json({ error: 'AI returned empty' }, 500);
  }

  // 8) Envia via Evolution Go (auto-resolve instância conectada da org)
  let sent = false;
  let sendError: string | null = null;
  try {
    const { data: sendData, error: sendErr } = await supabase.functions.invoke('whatsapp-send', {
      body: {
        organization_id,
        type: 'text',
        to: phone,
        payload: { text: message },
      },
    });
    sent = !sendErr && (sendData as any)?.ok !== false;
    if (!sent) sendError = sendErr?.message || (sendData as any)?.error || 'whatsapp-send failed';
  } catch (e: any) {
    sendError = `whatsapp-send err: ${e?.message ?? e}`;
  }

  if (!sent) {
    await logDispatch(supabase, {
      organization_id,
      cakto_order_id: order.id,
      cakto_event: event,
      cakto_status: order.status,
      lead_id: leadId,
      agent_id: agent.id,
      customer_phone: phone,
      customer_email: order.customer_email,
      message_sent: message,
      success: false,
      error_message: sendError ?? 'send failed',
    });
    return json({ error: 'send failed', detail: sendError }, 502);
  }

  // 9) Cria/garante a conversa para o webchat-bot continuar conduzindo
  let conversationId: string | null = null;
  const { data: existingConv } = await supabase
    .from('webchat_conversations')
    .select('id')
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
    await supabase
      .from('webchat_conversations')
      .update({
        status: 'bot_active',
        current_agent_id: agent.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  } else {
    const { data: created } = await supabase
      .from('webchat_conversations')
      .insert({
        organization_id,
        visitor_name: order.customer_name || 'Cliente Cakto',
        visitor_email: order.customer_email,
        visitor_phone: phone,
        channel: 'whatsapp',
        status: 'bot_active',
        lead_id: leadId,
        current_agent_id: agent.id,
        metadata: {
          cakto_recovery: true,
          cakto_order_id: order.id,
          cakto_event: event,
        },
      })
      .select('id')
      .single();
    conversationId = created?.id ?? null;
  }

  if (conversationId) {
    await supabase.from('webchat_messages').insert({
      conversation_id: conversationId,
      content: message,
      sender_type: 'bot',
      direction: 'outbound',
    });
  }

  // 10) Aplica automaticamente as tags definidas nos cenários ativos
  if (scenarioTagsToApply.length > 0 && leadId) {
    try {
      for (const tagName of scenarioTagsToApply) {
        // Garante que a tag exista (busca ou cria)
        const { data: existingTag } = await supabase
          .from('lead_tags')
          .select('id')
          .eq('organization_id', organization_id)
          .eq('name', tagName)
          .maybeSingle();

        let tagId = existingTag?.id;
        if (!tagId) {
          const { data: createdTag } = await supabase
            .from('lead_tags')
            .insert({ organization_id, name: tagName, color: '#3b82f6' })
            .select('id')
            .single();
          tagId = createdTag?.id;
        }

        if (tagId) {
          await supabase
            .from('lead_tag_assignments')
            .insert({ lead_id: leadId, tag_id: tagId })
            .select()
            .maybeSingle()
            .then(() => null)
            .catch(() => null); // ignora duplicatas
        }
      }
    } catch (e) {
      console.error('[recovery] tag apply failed', e);
    }
  }

  await logDispatch(supabase, {
    organization_id,
    cakto_order_id: order.id,
    cakto_event: event,
    cakto_status: order.status,
    lead_id: leadId,
    agent_id: agent.id,
    conversation_id: conversationId,
    customer_phone: phone,
    customer_email: order.customer_email,
    message_sent: message,
    success: true,
  });

  return json({ ok: true, event, lead_id: leadId, conversation_id: conversationId });
});

async function logDispatch(
  supabase: any,
  row: {
    organization_id: string;
    cakto_order_id?: string | null;
    cakto_event: string;
    cakto_status?: string | null;
    lead_id?: string | null;
    agent_id?: string | null;
    conversation_id?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    message_sent?: string | null;
    success: boolean;
    error_message?: string | null;
    skipped_reason?: string | null;
  },
) {
  try {
    await supabase.from('cakto_recovery_dispatches').insert(row);
  } catch (e) {
    console.error('[recovery] log failed', e);
  }
}
