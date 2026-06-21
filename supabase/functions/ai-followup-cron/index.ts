import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default timezone for business-hour calculations.
// Brazil-only product → São Paulo. Override with org-level setting later if needed.
const TZ = 'America/Sao_Paulo';

function getZonedParts(date: Date): { dayOfWeek: number; minutes: number } {
  // Use Intl to extract weekday/hour/minute in the target TZ
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const wd = parts.find(p => p.type === 'weekday')?.value || 'Sun';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dayOfWeek: map[wd] ?? 0, minutes: hour * 60 + minute };
}

// Returns a UTC Date that corresponds to the given local Y/M/D + HH:MM in TZ.
function zonedTimeToUtc(year: number, month: number, day: number, h: number, m: number): Date {
  // Approximation good enough for hourly business windows: build a UTC date,
  // then shift by the TZ offset at that moment.
  const guess = new Date(Date.UTC(year, month - 1, day, h, m, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(guess);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
  const tzY = get('year'), tzMo = get('month'), tzD = get('day'), tzH = get('hour'), tzMi = get('minute');
  const tzMs = Date.UTC(tzY, tzMo - 1, tzD, tzH, tzMi, 0);
  const offset = tzMs - guess.getTime();
  return new Date(guess.getTime() - offset);
}

// Adjust a date to the next valid business time (interpreted in TZ)
function adjustToBusinessHours(date: Date, startTime: string, endTime: string, businessDays: number[]): Date {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let cursor = new Date(date);

  for (let i = 0; i < 14; i++) {
    const { dayOfWeek, minutes } = getZonedParts(cursor);
    // Get cursor's local Y/M/D in TZ
    const dParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(cursor);
    const Y = parseInt(dParts.find(p => p.type === 'year')!.value, 10);
    const Mo = parseInt(dParts.find(p => p.type === 'month')!.value, 10);
    const D = parseInt(dParts.find(p => p.type === 'day')!.value, 10);

    if (businessDays.includes(dayOfWeek)) {
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (minutes < startMinutes) return zonedTimeToUtc(Y, Mo, D, startH, startM);
      if (minutes < endMinutes) return cursor;
    }
    // advance one day at start-of-business in TZ
    cursor = zonedTimeToUtc(Y, Mo, D + 1, startH, startM);
  }
  return cursor;
}

// Check if current time is within business hours (in TZ)
function isWithinBusinessHours(now: Date, startTime: string, endTime: string, businessDays: number[]): boolean {
  const { dayOfWeek, minutes } = getZonedParts(now);
  if (!businessDays.includes(dayOfWeek)) return false;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  return minutes >= startH * 60 + startM && minutes < endH * 60 + endM;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // (provider WhatsApp removido — sempre Evolution Go)
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: pendingFollowups, error: fetchError } = await supabase
      .from('ai_outreach_queue')
      .select('*')
      .eq('status', 'sent')
      .eq('followup_enabled', true)
      .lte('next_followup_at', nowIso)
      .order('next_followup_at', { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error('[FollowupCron] Error fetching queue:', fetchError);
      throw fetchError;
    }

    if (!pendingFollowups || pendingFollowups.length === 0) {
      console.log('[FollowupCron] No pending follow-ups');
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[FollowupCron] Processing ${pendingFollowups.length} follow-ups`);
    let processed = 0;
    let failed = 0;

    for (const item of pendingFollowups) {
      try {
        const steps: Array<{ delay_hours: number; instruction?: string }> = item.followup_steps || [];
        const maxFollowups = steps.length > 0 ? steps.length : (item.max_followups || 3);
        const businessStart = item.business_hours_start || '09:00';
        const businessEnd = item.business_hours_end || '18:00';
        const businessDays: number[] = item.business_days || [1, 2, 3, 4, 5];

        // Check if max follow-ups reached
        if (item.followups_sent >= maxFollowups) {
          await supabase
            .from('ai_outreach_queue')
            .update({ status: 'completed' })
            .eq('id', item.id);
          continue;
        }

        // Check business hours - if not in hours, reschedule
        if (!isWithinBusinessHours(now, businessStart, businessEnd, businessDays)) {
          const nextBizTime = adjustToBusinessHours(now, businessStart, businessEnd, businessDays);
          await supabase
            .from('ai_outreach_queue')
            .update({ next_followup_at: nextBizTime.toISOString() })
            .eq('id', item.id);
          console.log(`[FollowupCron] Outside business hours, rescheduled ${item.id} to ${nextBizTime.toISOString()}`);
          continue;
        }

        // Check if lead replied OR if a human took over the conversation
        if (item.conversation_id) {
          const { data: convInfo } = await supabase
            .from('webchat_conversations')
            .select('status')
            .eq('id', item.conversation_id)
            .maybeSingle();

          if (convInfo?.status === 'human_active' || convInfo?.status === 'waiting_human') {
            await supabase
              .from('ai_outreach_queue')
              .update({ status: 'completed', followup_enabled: false, next_followup_at: null })
              .eq('id', item.id);
            console.log(`[FollowupCron] Human took over conv ${item.conversation_id}, stopping follow-ups for ${item.id}`);
            continue;
          }

          const { data: inboundMessages } = await supabase
            .from('webchat_messages')
            .select('id')
            .eq('conversation_id', item.conversation_id)
            .eq('sender_type', 'visitor')
            .limit(1);

          if (inboundMessages && inboundMessages.length > 0) {
            await supabase
              .from('ai_outreach_queue')
              .update({ status: 'replied' })
              .eq('id', item.id);
            console.log(`[FollowupCron] Lead replied, marking ${item.id} as replied`);
            continue;
          }
        }

        // Get agent
        const { data: agent } = await supabase
          .from('product_agents')
          .select('*')
          .eq('id', item.agent_id)
          .single();

        if (!agent) {
          console.error(`[FollowupCron] Agent ${item.agent_id} not found`);
          continue;
        }

        // Get conversation history
        let previousMessages: string[] = [];
        if (item.conversation_id) {
          const { data: messages } = await supabase
            .from('webchat_messages')
            .select('content, sender_type')
            .eq('conversation_id', item.conversation_id)
            .order('created_at', { ascending: true });

          previousMessages = (messages || []).map(
            m => `[${m.sender_type === 'bot' ? 'Agente' : 'Lead'}]: ${m.content}`
          );
        }

        // Get step-specific instruction
        const currentStepIndex = item.followups_sent;
        const currentStep = steps[currentStepIndex];
        const stepInstruction = currentStep?.instruction || '';
        const attemptNumber = item.followups_sent + 1;
        const isLastAttempt = attemptNumber >= maxFollowups;

        // Build follow-up prompt
        const systemPrompt = `Você é ${agent.name}, um agente de ${agent.agent_type}.
TOM DE VOZ: ${agent.tone_style || 'Consultivo'}
ESTILO: ${agent.message_style || 'Curta e objetiva'}
OBJETIVO: ${item.objective || agent.primary_objective}
${item.extra_context ? `CONTEXTO: ${item.extra_context}` : ''}

REGRAS:
- Gere APENAS a mensagem, sem explicações
- Seja natural e humano
- Mensagem para WhatsApp (curta, direta)
- DIFERENTE das mensagens anteriores
${stepInstruction ? `- INSTRUÇÃO ESPECÍFICA PARA ESTE FOLLOW-UP: ${stepInstruction}` : ''}
${isLastAttempt ? '- Esta é a ÚLTIMA tentativa. Crie urgência sutil sem ser agressivo.' : ''}`;

        const userPrompt = `Você já enviou ${item.followups_sent + 1} mensagens para este lead sem resposta.

Histórico:
${previousMessages.join('\n')}

Lead: ${item.lead_data?.name || 'Lead'}
Tentativa ${attemptNumber + 1} de ${maxFollowups}

Gere uma mensagem de follow-up estratégica DIFERENTE das anteriores.`;

        // Call AI
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
          console.error(`[FollowupCron] AI error for ${item.id}:`, aiResponse.status, errText);
          failed++;
          continue;
        }

        const aiData = await aiResponse.json();
        const followupMessage = aiData.choices?.[0]?.message?.content?.trim();

        if (!followupMessage) {
          console.error(`[FollowupCron] Empty AI response for ${item.id}`);
          failed++;
          continue;
        }

        // Send via configured provider
        const phone = item.lead_data?.phone;
        if (!phone) {
          console.error(`[FollowupCron] No phone for ${item.id}`);
          failed++;
          continue;
        }

        // Send via Evolution Go (auto-resolve instância conectada)
        let sendSuccess = false;
        try {
          const { data: sendData, error: sendErr } = await supabase.functions.invoke('whatsapp-send', {
            body: {
              organization_id: item.organization_id,
              type: 'text',
              to: phone,
              payload: { text: followupMessage },
            },
          });
          sendSuccess = !sendErr && (sendData as any)?.ok !== false;
          if (!sendSuccess) {
            console.error(`[FollowupCron] Evolution send failed for ${item.id}:`, sendErr || sendData);
            failed++;
            continue;
          }
        } catch (e) {
          console.error(`[FollowupCron] Evolution send exception for ${item.id}:`, e);
          failed++;
          continue;
        }

        // Save message in conversation
        if (item.conversation_id) {
          await supabase
            .from('webchat_messages')
            .insert({
              conversation_id: item.conversation_id,
              content: followupMessage,
              sender_type: 'bot',
              direction: 'outbound',
            });
        }

        // Calculate next follow-up
        const newFollowupsSent = item.followups_sent + 1;
        const isNowComplete = newFollowupsSent >= maxFollowups;

        let nextFollowupAt: string | null = null;
        if (!isNowComplete) {
          const nextStep = steps[newFollowupsSent];
          const delayHours = nextStep?.delay_hours || (item.followup_interval_hours || 24);
          const rawNext = new Date(Date.now() + delayHours * 3600000);
          nextFollowupAt = adjustToBusinessHours(rawNext, businessStart, businessEnd, businessDays).toISOString();
        }

        await supabase
          .from('ai_outreach_queue')
          .update({
            followups_sent: newFollowupsSent,
            last_outreach_at: new Date().toISOString(),
            next_followup_at: nextFollowupAt,
            status: isNowComplete ? 'completed' : 'sent',
          })
          .eq('id', item.id);

        console.log(`[FollowupCron] Follow-up ${newFollowupsSent}/${maxFollowups} sent for ${item.id}`);
        processed++;
      } catch (itemError: any) {
        console.error(`[FollowupCron] Error processing ${item.id}:`, itemError);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, failed, total: pendingFollowups.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[FollowupCron] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
