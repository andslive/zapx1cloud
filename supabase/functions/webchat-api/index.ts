import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface InitRequest {
  widget_id: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  current_page_url?: string;
  referrer_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface SendMessageRequest {
  conversation_id: string;
  content: string;
  visitor_id: string;
  visitor_name?: string;
}

interface HandoffRequest {
  conversation_id: string;
  visitor_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION: Initialize or get existing conversation
    if (action === 'init' && req.method === 'POST') {
      const body: InitRequest = await req.json();
      
      if (!body.widget_id || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'widget_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get widget config with product info
      const { data: widget, error: widgetError } = await supabase
        .from('webchat_widgets')
        .select('*, webchat_agent_configs(*), products(name)')
        .eq('id', body.widget_id)
        .eq('is_active', true)
        .single();

      if (widgetError || !widget) {
        return new Response(
          JSON.stringify({ error: 'Widget not found or inactive' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const agentConfig = widget.webchat_agent_configs?.[0];
      const collectBeforeChat = agentConfig?.collect_before_chat !== false;

      // Try to find existing conversation (including closed ones)
      let { data: existingConversations } = await supabase
        .from('webchat_conversations')
        .select('*')
        .eq('widget_id', body.widget_id)
        .eq('visitor_id', body.visitor_id)
        .order('created_at', { ascending: false })
        .limit(1);

      let conversation = existingConversations?.[0] || null;

      if (conversation) {
        // If conversation exists but is closed, reopen it AND reset orchestrator state
        // so the next inbound message goes through triage from scratch.
        if (conversation.status === 'closed') {
          console.log('[webchat-api] Reopening closed conversation → back to human queue:', conversation.id);
          const { data: reopened, error: reopenError } = await supabase
            .from('webchat_conversations')
            .update({
              status: 'waiting_human',
              orchestrator_state: 'triagem',
              orchestrator_context: null,
              orchestrator_question_count: 0,
              current_agent_id: null,
              assigned_user_id: null,
              sector_id: null,
              needs_human: true,
              closed_at: null,
              accepted_at: null,
              accepted_by: null,
            })
            .eq('id', conversation.id)
            .select()
            .single();
          
          if (reopenError) {
            console.error('Error reopening conversation:', reopenError);
          } else {
            conversation = reopened;
          }
        }
        // Otherwise, use the existing active conversation as-is
      } else {
        // Create new conversation only if none exists
        console.log('[webchat-api] Creating new conversation for visitor:', body.visitor_id);

        // New conversations always start fresh in the orchestrator triage —
        // we no longer auto-reassign to a previous agent, otherwise the
        // orchestrator would be skipped for returning visitors.
        // NOTE: status fica `bot_active` para o bot responder; a UI da inbox
        // exibe `bot_active` na aba "Aguardando" enquanto nenhum humano aceitar.
        const autoAssignUserId: string | null = null;
        const autoStatus = 'bot_active';

        const { data: newConv, error: createError } = await supabase
          .from('webchat_conversations')
          .insert({
            organization_id: widget.organization_id,
            widget_id: body.widget_id,
            visitor_id: body.visitor_id,
            visitor_name: body.visitor_name,
            visitor_email: body.visitor_email,
            visitor_phone: body.visitor_phone,
            current_page_url: body.current_page_url,
            referrer_url: body.referrer_url,
            utm_source: body.utm_source,
            utm_medium: body.utm_medium,
            utm_campaign: body.utm_campaign,
            utm_content: body.utm_content,
            utm_term: body.utm_term,
            status: autoStatus,
            assigned_user_id: autoAssignUserId,
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          return new Response(
            JSON.stringify({ error: 'Failed to create conversation', details: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        conversation = newConv;

        // ===== AUTO-CREATE LEAD =====
        // Toda conversa nova vira um lead imediatamente — sem vinculação manual.
        // Se já existir lead pelo email/telefone, reaproveita.
        try {
          let existingLeadId: string | null = null;
          if (body.visitor_email || body.visitor_phone) {
            const orFilters: string[] = [];
            if (body.visitor_email) orFilters.push(`email.eq.${body.visitor_email}`);
            if (body.visitor_phone) {
              orFilters.push(`phone.eq.${body.visitor_phone}`);
              orFilters.push(`phone_normalized.eq.${body.visitor_phone}`);
            }
            const { data: existingLead } = await supabase
              .from('leads')
              .select('id')
              .eq('organization_id', widget.organization_id)
              .or(orFilters.join(','))
              .limit(1)
              .maybeSingle();
            existingLeadId = existingLead?.id || null;
          }

          let leadId = existingLeadId;
          if (!leadId) {
            const visitorShort = String(body.visitor_id || '').slice(-6) || 'novo';
            const { data: newLead, error: leadErr } = await supabase
              .from('leads')
              .insert({
                organization_id: widget.organization_id,
                name: body.visitor_name || `Visitante #${visitorShort}`,
                email: body.visitor_email || null,
                phone: body.visitor_phone || null,
                source: 'webchat',
              })
              .select('id')
              .single();
            if (leadErr) {
              console.error('[webchat-api] auto-create lead failed (non-fatal):', leadErr);
            } else {
              leadId = newLead?.id || null;
              console.log('[webchat-api] auto-created lead:', leadId);
            }
          }

          if (leadId) {
            await supabase
              .from('webchat_conversations')
              .update({ lead_id: leadId })
              .eq('id', conversation.id);
            conversation.lead_id = leadId;
          }
        } catch (e) {
          console.error('[webchat-api] auto-create lead error (non-fatal):', e);
        }

        // Check for active chat flow for this product
        let initialFlowMessage = null;
        if (widget.product_id) {
          const { data: activeFlow } = await supabase
            .from('chat_flows')
            .select('*')
            .eq('product_id', widget.product_id)
            .eq('is_active', true)
            .maybeSingle();

          if (activeFlow && activeFlow.start_block_id) {
            console.log('[webchat-api] Active flow found:', activeFlow.id, 'Starting block:', activeFlow.start_block_id);
            
            // Update conversation with flow state
            await supabase
              .from('webchat_conversations')
              .update({
                current_flow_id: activeFlow.id,
                current_block_id: activeFlow.start_block_id,
                flow_variables: {},
                flow_completed: false,
              })
              .eq('id', conversation.id);

            // Execute the first block of the flow
            const startBlock = activeFlow.blocks?.find((b: any) => b.id === activeFlow.start_block_id);
            if (startBlock) {
              const flowResponse = await executeInitialFlowBlock(supabase, conversation.id, activeFlow, startBlock);
              if (flowResponse?.message) {
                initialFlowMessage = flowResponse.message;
              }
            }
          }
        }

        // Only send greeting if NOT collecting data first and it's a new conversation AND no flow
        if (!collectBeforeChat && agentConfig?.greeting_message && !initialFlowMessage) {
          await supabase.from('webchat_messages').insert({
            conversation_id: conversation.id,
            direction: 'outbound',
            sender_type: 'bot',
            content: agentConfig.greeting_message,
          });
        }
      }

      // Get messages for this conversation
      const { data: messages } = await supabase
        .from('webchat_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      return new Response(
        JSON.stringify({
          widget: {
            id: widget.id,
            name: widget.name,
            primary_color: widget.primary_color,
            secondary_color: widget.secondary_color,
            welcome_message: widget.welcome_message,
            placeholder_text: widget.placeholder_text,
            position: widget.position,
            avatar_url: widget.avatar_url,
            collect_email: widget.collect_email,
            collect_phone: widget.collect_phone,
            collect_name: widget.collect_name,
            collect_before_chat: agentConfig?.collect_before_chat !== false,
            product_name: widget.products?.name || null,
          },
          agent: agentConfig ? {
            name: agentConfig.agent_name,
            avatar_url: agentConfig.agent_avatar_url,
          } : null,
          conversation,
          messages: messages || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Send message from visitor
    if (action === 'send' && req.method === 'POST') {
      const body: SendMessageRequest = await req.json();

      if (!body.conversation_id || !body.content || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id, content, and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify conversation exists and belongs to visitor
      const { data: conversation, error: convError } = await supabase
        .from('webchat_conversations')
        .select('*, webchat_widgets(*, webchat_agent_configs(*))')
        .eq('id', body.conversation_id)
        .eq('visitor_id', body.visitor_id)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Save visitor message
      const { data: message, error: msgError } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'inbound',
          sender_type: 'visitor',
          content: body.content,
        })
        .select()
        .single();

      if (msgError) {
        return new Response(
          JSON.stringify({ error: 'Failed to save message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update conversation last_message_at and unread count
      await supabase
        .from('webchat_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count_agents: conversation.unread_count_agents + 1,
        })
        .eq('id', body.conversation_id);

      // If bot is active, generate AI response
      let botResponse = null;
      if (conversation.status === 'bot_active') {
        const agentConfig = conversation.webchat_widgets?.webchat_agent_configs?.[0];
        
        if (agentConfig) {
          // Check for handoff triggers
          const triggers = agentConfig.handoff_triggers || [];
          const messageLower = body.content.toLowerCase();
          const shouldHandoff = triggers.some((trigger: string) => 
            messageLower.includes(trigger.toLowerCase())
          );

          if (shouldHandoff && agentConfig.auto_handoff_enabled) {
            // Trigger handoff
            await supabase
              .from('webchat_conversations')
              .update({ status: 'waiting_human' })
              .eq('id', body.conversation_id);

            // Send handoff message
            const { data: handoffMsg } = await supabase
              .from('webchat_messages')
              .insert({
                conversation_id: body.conversation_id,
                direction: 'outbound',
                sender_type: 'bot',
                content: agentConfig.handoff_message || 'Estou transferindo você para um atendente. Aguarde um momento.',
              })
              .select()
              .single();

            botResponse = handoffMsg;

            // Create notification for agents
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id')
              .eq('organization_id', conversation.organization_id);

            if (profiles) {
              const notifications = profiles.map((p: { id: string }) => ({
                user_id: p.id,
                title: 'Nova conversa aguardando atendimento',
                message: `Visitante ${conversation.visitor_name || 'anônimo'} solicitou atendimento humano`,
                type: 'opportunity',
                action_url: '/admin?section=webchat',
              }));

              await supabase.from('notifications').insert(notifications);
            }
          } else {
            // Call AI to generate response with product brain support
            try {
              // Get product_id from widget
              const productId = conversation.webchat_widgets?.product_id;
              
              console.log('[webchat-api] Calling webchat-bot for conversation:', body.conversation_id);
              console.log('[webchat-api] Visitor name from request:', body.visitor_name);
              console.log('[webchat-api] Visitor name from conversation:', conversation.visitor_name);
              
              // Use visitor_name from request body first, then fall back to conversation data
              const visitorName = body.visitor_name || conversation.visitor_name || '';
              
              // Build flow context from conversation
              const flowContext = {
                current_flow_id: conversation.current_flow_id || null,
                current_block_id: conversation.current_block_id || null,
                flow_variables: conversation.flow_variables || {},
                flow_completed: conversation.flow_completed || false,
              };
              
              console.log('[webchat-api] Flow context:', flowContext);
              
              const aiResponse = await fetch(`${supabaseUrl}/functions/v1/webchat-bot`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  conversation_id: body.conversation_id,
                  message: body.content,
                  product_id: productId,
                  visitor_name: visitorName,
                  flow_context: flowContext,
                  agent_config: {
                    ...agentConfig,
                    temperature: agentConfig.temperature ?? 0.7,
                    max_tokens: agentConfig.max_tokens ?? 500,
                    use_product_brain: agentConfig.use_product_brain !== false,
                    persona_style: agentConfig.persona_style || 'friendly',
                  },
                }),
              });

              console.log('[webchat-api] webchat-bot response status:', aiResponse.status);

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                console.log('[webchat-api] Bot response received:', aiData.message?.id || 'no id');
                
                // Check for special actions from flow
                if (aiData.action) {
                  return new Response(
                    JSON.stringify({
                      message,
                      botResponse: aiData.message,
                      conversationStatus: conversation.status,
                      action: aiData.action,
                      actionData: aiData.action_data,
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
                
                botResponse = aiData.message;
              } else {
                const errorText = await aiResponse.text();
                console.error('[webchat-api] Bot API error:', aiResponse.status, errorText);
                throw new Error(`Bot returned ${aiResponse.status}: ${errorText}`);
              }
            } catch (error) {
              console.error('[webchat-api] Error calling AI:', error);
              // Send fallback message
              const { data: fallbackMsg } = await supabase
                .from('webchat_messages')
                .insert({
                  conversation_id: body.conversation_id,
                  direction: 'outbound',
                  sender_type: 'bot',
                  content: agentConfig.fallback_message || 'Desculpe, estou com dificuldades técnicas. Posso transferir você para um atendente?',
                })
                .select()
                .single();
              
              botResponse = fallbackMsg;
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          message,
          botResponse,
          conversationStatus: conversation.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Get messages
    if (action === 'messages' && req.method === 'GET') {
      const conversationId = url.searchParams.get('conversation_id');
      const visitorId = url.searchParams.get('visitor_id');

      if (!conversationId || !visitorId) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify conversation belongs to visitor
      const { data: conversation } = await supabase
        .from('webchat_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('visitor_id', visitorId)
        .single();

      if (!conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: messages } = await supabase
        .from('webchat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      return new Response(
        JSON.stringify({ messages: messages || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Request handoff to human
    if (action === 'handoff' && req.method === 'POST') {
      const body: HandoffRequest = await req.json();

      if (!body.conversation_id || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify and update conversation
      const { data: conversation, error: convError } = await supabase
        .from('webchat_conversations')
        .select('*, webchat_widgets(webchat_agent_configs(*))')
        .eq('id', body.conversation_id)
        .eq('visitor_id', body.visitor_id)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update status
      await supabase
        .from('webchat_conversations')
        .update({ status: 'waiting_human' })
        .eq('id', body.conversation_id);

      // Send handoff message
      const agentConfig = conversation.webchat_widgets?.webchat_agent_configs?.[0];
      const { data: handoffMsg } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          sender_type: 'bot',
          content: agentConfig?.handoff_message || 'Estou transferindo você para um atendente. Aguarde um momento.',
        })
        .select()
        .single();

      // Create notifications
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', conversation.organization_id);

      if (profiles) {
        const notifications = profiles.map((p: { id: string }) => ({
          user_id: p.id,
          title: 'Nova conversa aguardando atendimento',
          message: `Visitante ${conversation.visitor_name || 'anônimo'} solicitou atendimento humano`,
          type: 'opportunity',
          action_url: '/admin?section=webchat',
        }));

        await supabase.from('notifications').insert(notifications);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: handoffMsg,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Update visitor info
    if (action === 'update-visitor' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateData: Record<string, string> = {};
      if (body.visitor_name) updateData.visitor_name = body.visitor_name;
      if (body.visitor_email) updateData.visitor_email = body.visitor_email;
      if (body.visitor_phone) updateData.visitor_phone = body.visitor_phone;

      const { error } = await supabase
        .from('webchat_conversations')
        .update(updateData)
        .eq('id', body.conversation_id)
        .eq('visitor_id', body.visitor_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to update visitor info' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in webchat-api:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Execute initial flow block for new conversations
async function executeInitialFlowBlock(
  supabase: any,
  conversationId: string,
  flow: any,
  block: any
): Promise<{ message?: any }> {
  try {
    let responseContent = '';
    let messageType = 'text';
    let responseButtons: any[] | undefined;
    let responseVideoUrl: string | undefined;

    switch (block.type) {
      case 'message':
        responseContent = block.data.content || '';
        break;

      case 'input':
        responseContent = block.data.placeholder || 'Digite sua resposta...';
        break;

      case 'buttons':
        responseContent = block.data.content || 'Escolha uma opção:';
        messageType = 'buttons';
        responseButtons = block.data.buttons?.map((btn: any, index: number) => ({
          id: btn.id,
          label: `${btn.emoji || ''} ${btn.label}`.trim(),
          type: btn.action_type === 'url' ? 'url' : 
                btn.action_type === 'whatsapp' ? 'whatsapp' : 'flow_button',
          action: btn.action_type === 'url' ? btn.url : 
                  btn.action_type === 'whatsapp' ? btn.whatsapp_number : btn.id,
          style: index === 0 ? 'primary' : 'secondary',
          cta_type: btn.action_type || 'flow',
          action_type: btn.action_type || 'next_block',
          whatsapp_message: btn.whatsapp_message,
          open_in_new_tab: btn.open_in_new_tab,
        }));
        break;

      case 'video':
        responseContent = block.data.video_title || 'Assista a este vídeo:';
        responseVideoUrl = block.data.video_url;
        messageType = 'video';
        break;

      default:
        return {};
    }

    // Save message if we have content
    if (responseContent) {
      const { data: msg } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'bot',
          content: responseContent,
          message_type: messageType,
          buttons: responseButtons || null,
          video_url: responseVideoUrl || null,
        })
        .select()
        .single();

      return { message: msg };
    }

    return {};
  } catch (error) {
    console.error('[executeInitialFlowBlock] Error:', error);
    return {};
  }
}
