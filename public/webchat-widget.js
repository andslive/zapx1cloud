/**
 * SalesOS WebChat Widget - Super Sales AI Edition
 * 
 * Features:
 * - Smart loading state for mobile
 * - Chunked messages with typing effect
 * - Agent name from config
 * - Optimized mobile experience
 * 
 * Usage:
 * <script 
 *   src="https://your-domain.com/webchat-widget.js" 
 *   data-widget-id="YOUR_WIDGET_ID"
 *   async
 * ></script>
 */
(function() {
  'use strict';

  // Get configuration from script tag
  const currentScript = document.currentScript;
  const widgetId = currentScript?.dataset?.widgetId;
  
  if (!widgetId) {
    console.error('[SalesOS WebChat] Missing data-widget-id attribute');
    return;
  }

  // Configuration — defaults to this project's Supabase, but can be overridden
  // via data-api-base / data-anon-key on the <script> tag.
  const SUPABASE_PROJECT_REF = 'vnqqrtbzvsaajumqxzrh';
  const DEFAULT_ANON_KEY = 'sb_publishable_x_7iyzeKr74_i-vw8i0Szw_1Nyguj9F';

  const overrideApiBase = currentScript?.dataset?.apiBase;
  const overrideAnonKey = currentScript?.dataset?.anonKey;

  const config = {
    widgetId: widgetId,
    apiBase: overrideApiBase || `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1`,
    realtimeUrl: (overrideApiBase
      ? overrideApiBase.replace(/^http/, 'ws').replace(/\/functions\/v1\/?$/, '')
      : `wss://${SUPABASE_PROJECT_REF}.supabase.co`) + '/realtime/v1/websocket',
    anonKey: overrideAnonKey || DEFAULT_ANON_KEY,
    cacheVersion: 'v2-' + SUPABASE_PROJECT_REF
  };

  // State
  let state = {
    isOpen: false,
    isLoading: true,
    isInitialized: false,
    phase: 'loading', // loading, collecting, chatting
    widgetConfig: null,
    agentConfig: null,
    conversation: null,
    messages: [],
    visitorId: null,
    visitorData: {
      name: '',
      whatsapp: '',
      email: ''
    },
    collectingField: null,
    isTyping: false,
    typingQueue: [], // Queue for chunked messages
    isProcessingQueue: false,
    soundEnabled: localStorage.getItem(`salesos_sound_${config.widgetId}`) !== 'false'
  };

  // Sound Manager - Web Audio API
  const soundManager = {
    play: function() {
      if (!state.soundEnabled || !state.isOpen) return;
      
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Softer notification sound for visitors
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(800, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(900, ctx.currentTime + 0.12);
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
        
        setTimeout(() => ctx.close(), 300);
      } catch (e) {
        // Silently fail if audio not supported
      }
    },
    
    toggle: function() {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(`salesos_sound_${config.widgetId}`, state.soundEnabled.toString());
      render();
      return state.soundEnabled;
    }
  };

  // Generate or get visitor ID
  function getVisitorId() {
    const storageKey = `salesos_visitor_${config.widgetId}`;
    let visitorId = localStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(storageKey, visitorId);
    }
    return visitorId;
  }

  // Get saved visitor data
  function getSavedVisitorData() {
    const storageKey = `salesos_visitor_data_${config.widgetId}`;
    try {
      const data = localStorage.getItem(storageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // Save visitor data
  function saveVisitorData(data) {
    const storageKey = `salesos_visitor_data_${config.widgetId}`;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  // Get cached widget config (for faster initial load)
  function getCachedConfig() {
    const storageKey = `salesos_widget_cache_${config.widgetId}`;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const data = JSON.parse(cached);
        // Invalidate caches written by older versions / wrong project
        if (data.cacheVersion !== config.cacheVersion) {
          localStorage.removeItem(storageKey);
          return null;
        }
        // Cache valid for 1 hour
        if (Date.now() - data.timestamp < 3600000) {
          return data;
        }
      }
    } catch {}
    return null;
  }

  // Save widget config to cache
  function cacheConfig(widgetConfig, agentConfig) {
    const storageKey = `salesos_widget_cache_${config.widgetId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        widgetConfig,
        agentConfig,
        cacheVersion: config.cacheVersion,
        timestamp: Date.now()
      }));
    } catch {}
  }

  // Get page metadata
  function getPageMetadata() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      currentPageUrl: window.location.href,
      referrerUrl: document.referrer || null,
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign'),
      utmContent: urlParams.get('utm_content'),
      utmTerm: urlParams.get('utm_term')
    };
  }

  // API calls
  async function apiCall(action, body = {}, method = 'POST') {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey
      }
    };
    
    if (method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const url = method === 'GET' 
      ? `${config.apiBase}/webchat-api?action=${action}&${new URLSearchParams(body).toString()}`
      : `${config.apiBase}/webchat-api?action=${action}`;

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  }

  // Process chunked messages with typing effect
  async function processMessageQueue() {
    if (state.isProcessingQueue || state.typingQueue.length === 0) return;
    
    state.isProcessingQueue = true;
    
    while (state.typingQueue.length > 0) {
      const chunk = state.typingQueue.shift();
      
      // Show typing indicator
      state.isTyping = true;
      render();
      scrollToBottom();
      
      // Wait for the delay
      await delay(chunk.delay || 1500);
      
      // Add the message
      state.messages.push({
        id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substring(7),
        content: chunk.content,
        direction: 'outbound',
        sender_type: 'bot',
        created_at: new Date().toISOString()
      });
      
      state.isTyping = false;
      
      // Play sound for bot messages
      soundManager.play();
      
      render();
      scrollToBottom();
      
      // Small pause between messages
      if (state.typingQueue.length > 0) {
        await delay(300);
      }
    }
    
    state.isProcessingQueue = false;
  }

  // Delay helper
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Handle flow actions (URL, WhatsApp, etc.)
  function handleFlowAction(action, actionData) {
    console.log('[SalesOS WebChat] Handling flow action:', action, actionData);
    
    switch (action) {
      case 'open_url':
        if (actionData?.url) {
          if (actionData.open_in_new_tab !== false) {
            window.open(actionData.url, '_blank');
          } else {
            window.location.href = actionData.url;
          }
        }
        break;
        
      case 'open_whatsapp':
        if (actionData?.number) {
          const cleanNumber = actionData.number.replace(/\D/g, '');
          const message = actionData.message ? encodeURIComponent(actionData.message) : '';
          window.open('https://wa.me/' + cleanNumber + (message ? '?text=' + message : ''), '_blank');
        }
        break;
        
      default:
        console.log('[SalesOS WebChat] Unknown action:', action);
    }
  }

  // Initialize widget
  async function initWidget() {
    state.visitorId = getVisitorId();
    const savedData = getSavedVisitorData();
    const cached = getCachedConfig();
    
    // Pre-populate from cache for instant display
    if (cached) {
      state.widgetConfig = cached.widgetConfig;
      state.agentConfig = cached.agentConfig;
      if (savedData) {
        state.visitorData = savedData;
      }
    }
    
    // Initial render with loading or cached data
    render();
    
    try {
      const metadata = getPageMetadata();
      const result = await apiCall('init', {
        widget_id: config.widgetId,
        visitor_id: state.visitorId,
        visitor_name: savedData?.name,
        visitor_email: savedData?.email,
        visitor_phone: savedData?.whatsapp,
        current_page_url: metadata.currentPageUrl,
        referrer_url: metadata.referrerUrl,
        utm_source: metadata.utmSource,
        utm_medium: metadata.utmMedium,
        utm_campaign: metadata.utmCampaign,
        utm_content: metadata.utmContent,
        utm_term: metadata.utmTerm
      });
      
      state.widgetConfig = result.widget;
      state.agentConfig = result.agent;
      state.conversation = result.conversation;
      state.messages = result.messages || [];
      state.isLoading = false;
      state.isInitialized = true;
      
      // Cache the config
      cacheConfig(result.widget, result.agent);
      
      // Check if we need to collect data
      const collectBeforeChat = state.widgetConfig?.collect_before_chat !== false;
      const hasRequiredData = savedData?.name;
      
      if (collectBeforeChat && !hasRequiredData) {
        state.phase = 'collecting';
        state.collectingField = 'name';
      } else {
        state.phase = 'chatting';
        if (savedData) {
          state.visitorData = savedData;
        }
      }
      
      render();
      setupRealtime();
      setupPresence();
    } catch (error) {
      console.error('[SalesOS WebChat] Init error:', error);
      state.isLoading = false;
      state.phase = 'chatting';
      render();
    }
  }

  // Setup realtime subscription
  function setupRealtime() {
    if (!state.conversation?.id) return;
    
    const channel = new WebSocket(
      `${config.realtimeUrl}?apikey=${config.anonKey}&vsn=1.0.0`
    );
    
    channel.onopen = () => {
      channel.send(JSON.stringify({
        topic: `realtime:public:webchat_messages:conversation_id=eq.${state.conversation.id}`,
        event: 'phx_join',
        payload: {},
        ref: '1'
      }));
    };
    
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'INSERT' && data.payload?.record) {
          const newMessage = data.payload.record;
          if (!state.messages.find(m => m.id === newMessage.id)) {
            state.messages.push(newMessage);
            state.isTyping = false;
            
            // Play sound for messages from bot/agent
            if (newMessage.sender_type !== 'visitor') {
              soundManager.play();
            }
            
            render();
            scrollToBottom();
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
  }

  // -------------------------------------------------------------------------
  // Realtime Presence + Typing
  // Opens a Phoenix-protocol WebSocket on the channel
  //   `presence:conversation:{conversation_id}`
  // and:
  //   - tracks the visitor as online (presence_state)
  //   - listens for "typing" broadcasts from agents to show the bubble
  //   - exposes window.salesosSendTyping() to broadcast typing from the visitor
  // -------------------------------------------------------------------------
  let presenceState = {
    socket: null,
    joinRef: null,
    msgRef: 1,
    topic: null,
    heartbeatTimer: null,
    lastTypingSent: 0,
    agentTypingTimer: null,
    isAgentTyping: false,
  };

  function setupPresence() {
    if (!state.conversation?.id) return;
    // Close any previous connection (e.g. handoff or reconnect)
    if (presenceState.socket) {
      try { presenceState.socket.close(); } catch (_) {}
    }
    presenceState = {
      socket: null,
      joinRef: '1',
      msgRef: 1,
      topic: 'realtime:presence:conversation:' + state.conversation.id,
      heartbeatTimer: null,
      lastTypingSent: 0,
      agentTypingTimer: null,
      isAgentTyping: false,
    };

    const url = config.realtimeUrl + '?apikey=' + config.anonKey + '&vsn=1.0.0';
    const sock = new WebSocket(url);
    presenceState.socket = sock;

    function nextRef() {
      presenceState.msgRef += 1;
      return String(presenceState.msgRef);
    }

    sock.onopen = function () {
      // phx_join with presence config
      sock.send(JSON.stringify({
        topic: presenceState.topic,
        event: 'phx_join',
        payload: {
          config: {
            presence: { key: 'visitor-' + (state.visitorId || Date.now()) },
            broadcast: { self: false, ack: false },
          },
        },
        ref: presenceState.joinRef,
      }));

      // Heartbeat every 25s
      presenceState.heartbeatTimer = setInterval(function () {
        try {
          sock.send(JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: nextRef(),
          }));
        } catch (_) {}
      }, 25000);
    };

    sock.onmessage = function (ev) {
      try {
        const data = JSON.parse(ev.data);

        // Track presence after the join is acknowledged
        if (data.ref === presenceState.joinRef && data.event === 'phx_reply') {
          sock.send(JSON.stringify({
            topic: presenceState.topic,
            event: 'access_token',
            payload: { access_token: config.anonKey },
            ref: nextRef(),
          }));
          sock.send(JSON.stringify({
            topic: presenceState.topic,
            event: 'presence',
            payload: {
              type: 'presence',
              event: 'track',
              payload: {
                actor: 'visitor',
                name: state.visitorData?.name || 'Visitante',
                conversation_id: state.conversation.id,
                at: Date.now(),
              },
            },
            ref: nextRef(),
          }));
          return;
        }

        // Broadcast typing from agent → show bubble in widget
        if (data.event === 'broadcast' && data.payload && data.payload.event === 'typing') {
          const p = data.payload.payload || {};
          if (p.sender_type === 'agent') {
            presenceState.isAgentTyping = true;
            state.isTyping = true;
            render();
            scrollToBottom();
            if (presenceState.agentTypingTimer) clearTimeout(presenceState.agentTypingTimer);
            presenceState.agentTypingTimer = setTimeout(function () {
              presenceState.isAgentTyping = false;
              // Only clear UI typing if the chunk-queue isn't driving it
              if (!state.isProcessingQueue && state.typingQueue.length === 0) {
                state.isTyping = false;
                render();
              }
            }, 3500);
          }
        }
      } catch (_) {
        // Ignore parse errors
      }
    };

    sock.onclose = function () {
      if (presenceState.heartbeatTimer) {
        clearInterval(presenceState.heartbeatTimer);
        presenceState.heartbeatTimer = null;
      }
    };
  }

  // Broadcast a "typing" event from the visitor (throttled to 1 per 1.5s)
  window.salesosSendTyping = function () {
    const sock = presenceState.socket;
    if (!sock || sock.readyState !== 1 /* OPEN */) return;
    const now = Date.now();
    if (now - presenceState.lastTypingSent < 1500) return;
    presenceState.lastTypingSent = now;
    try {
      sock.send(JSON.stringify({
        topic: presenceState.topic,
        event: 'broadcast',
        payload: {
          type: 'broadcast',
          event: 'typing',
          payload: { sender_type: 'visitor', name: state.visitorData?.name },
        },
        ref: String(++presenceState.msgRef),
      }));
    } catch (_) {}
  };


  // Handle visitor data collection
  async function handleDataCollection(input) {
    const value = input.trim();
    if (!value) return;

    const agentName = state.agentConfig?.name || 'Assistente';

    if (state.collectingField === 'name') {
      state.visitorData.name = value;
      state.messages.push({
        id: 'collect_name_' + Date.now(),
        content: value,
        direction: 'inbound',
        sender_type: 'visitor',
        created_at: new Date().toISOString()
      });
      
      if (state.widgetConfig?.collect_phone !== false) {
        state.collectingField = 'whatsapp';
        setTimeout(() => {
          state.messages.push({
            id: 'ask_whatsapp_' + Date.now(),
            content: `Prazer, ${value}! 😊 Qual seu WhatsApp para eu poder te ajudar melhor?`,
            direction: 'outbound',
            sender_type: 'bot',
            created_at: new Date().toISOString()
          });
          render();
          scrollToBottom();
        }, 500);
      } else if (state.widgetConfig?.collect_email !== false) {
        state.collectingField = 'email';
        setTimeout(() => {
          state.messages.push({
            id: 'ask_email_' + Date.now(),
            content: `Prazer, ${value}! 😊 Qual seu e-mail?`,
            direction: 'outbound',
            sender_type: 'bot',
            created_at: new Date().toISOString()
          });
          render();
          scrollToBottom();
        }, 500);
      } else {
        finishDataCollection();
      }
    } else if (state.collectingField === 'whatsapp') {
      state.visitorData.whatsapp = value;
      state.messages.push({
        id: 'collect_whatsapp_' + Date.now(),
        content: value,
        direction: 'inbound',
        sender_type: 'visitor',
        created_at: new Date().toISOString()
      });
      
      if (state.widgetConfig?.collect_email !== false) {
        state.collectingField = 'email';
        setTimeout(() => {
          state.messages.push({
            id: 'ask_email_' + Date.now(),
            content: 'Ótimo! E qual seu e-mail?',
            direction: 'outbound',
            sender_type: 'bot',
            created_at: new Date().toISOString()
          });
          render();
          scrollToBottom();
        }, 500);
      } else {
        finishDataCollection();
      }
    } else if (state.collectingField === 'email') {
      state.visitorData.email = value;
      state.messages.push({
        id: 'collect_email_' + Date.now(),
        content: value,
        direction: 'inbound',
        sender_type: 'visitor',
        created_at: new Date().toISOString()
      });
      finishDataCollection();
    }

    render();
    scrollToBottom();
  }

  // Finish data collection
  async function finishDataCollection() {
    saveVisitorData(state.visitorData);
    
    try {
      await apiCall('update-visitor', {
        conversation_id: state.conversation.id,
        visitor_id: state.visitorId,
        visitor_name: state.visitorData.name,
        visitor_email: state.visitorData.email,
        visitor_phone: state.visitorData.whatsapp
      });
    } catch (e) {
      console.error('[SalesOS WebChat] Failed to update visitor:', e);
    }

    setTimeout(() => {
      const productName = state.widgetConfig?.product_name || 'nosso produto';
      state.messages.push({
        id: 'start_chat_' + Date.now(),
        content: `Perfeito, ${state.visitorData.name}! 🎉 Agora me conta, qual sua dúvida sobre ${productName}?`,
        direction: 'outbound',
        sender_type: 'bot',
        created_at: new Date().toISOString()
      });
      state.phase = 'chatting';
      state.collectingField = null;
      render();
      scrollToBottom();
    }, 600);
  }

  // Send message
  async function sendMessage(content) {
    if (!content.trim()) return;
    
    if (state.phase === 'collecting') {
      handleDataCollection(content);
      return;
    }

    if (!state.conversation?.id) return;
    
    // Optimistic update
    const tempMessage = {
      id: 'temp_' + Date.now(),
      content: content,
      direction: 'inbound',
      sender_type: 'visitor',
      created_at: new Date().toISOString()
    };
    state.messages.push(tempMessage);
    state.isTyping = true;
    render();
    scrollToBottom();
    
    try {
      const result = await apiCall('send', {
        conversation_id: state.conversation.id,
        content: content,
        visitor_id: state.visitorId,
        visitor_name: state.visitorData.name || ''
      });
      
      // Replace temp message
      const tempIndex = state.messages.findIndex(m => m.id === tempMessage.id);
      if (tempIndex > -1) {
        state.messages[tempIndex] = result.message;
      }
      
      // Handle bot response - check if it's chunked
      if (result.botResponse) {
        if (result.botResponse.chunked && Array.isArray(result.botResponse.chunks)) {
          // Process chunked messages
          state.isTyping = false;
          state.typingQueue = result.botResponse.chunks.map((chunk, i) => ({
            content: chunk,
            delay: i === 0 ? 800 : 1200 + (Math.random() * 500)
          }));
          processMessageQueue();
        } else {
          // Regular single message
          state.messages.push(result.botResponse);
          state.isTyping = false;
        }
      } else {
        state.isTyping = false;
      }
      
      // Handle special actions from flow (URL, WhatsApp, etc.)
      if (result.action) {
        handleFlowAction(result.action, result.actionData);
      }
      
      render();
      scrollToBottom();
    } catch (error) {
      console.error('[SalesOS WebChat] Send error:', error);
      state.isTyping = false;
      render();
    }
  }

  // Request human handoff
  async function requestHandoff() {
    if (!state.conversation?.id) return;
    
    try {
      await apiCall('handoff', {
        conversation_id: state.conversation.id,
        visitor_id: state.visitorId
      });
      
      state.messages.push({
        id: 'handoff_' + Date.now(),
        content: 'Aguarde, vou transferir você para um atendente humano. 👋',
        direction: 'outbound',
        sender_type: 'bot',
        created_at: new Date().toISOString()
      });
      
      render();
      scrollToBottom();
    } catch (error) {
      console.error('[SalesOS WebChat] Handoff error:', error);
    }
  }

  // Scroll to bottom
  function scrollToBottom() {
    setTimeout(() => {
      const container = document.getElementById('salesos-chat-messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }

  // Toggle chat
  function toggleChat() {
    state.isOpen = !state.isOpen;
    render();
    if (state.isOpen) {
      scrollToBottom();
      setTimeout(() => {
        const input = document.getElementById('salesos-chat-input');
        if (input) input.focus();
      }, 300);
    }
  }

  // Format time
  function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Get placeholder
  function getPlaceholder() {
    if (state.phase === 'collecting') {
      switch (state.collectingField) {
        case 'name': return 'Digite seu nome...';
        case 'whatsapp': return 'Digite seu WhatsApp...';
        case 'email': return 'Digite seu e-mail...';
        default: return 'Digite aqui...';
      }
    }
    return state.widgetConfig?.placeholder_text || 'Digite sua mensagem...';
  }

  // Get greeting messages
  function getGreetingMessages() {
    const agentName = state.agentConfig?.name || 'Assistente';
    const welcomeMsg = state.widgetConfig?.welcome_message;
    
    if (state.phase === 'collecting' && state.messages.length === 0) {
      return [
        {
          id: 'greeting_1',
          content: welcomeMsg || `Olá! 👋 Seja muito bem-vindo(a)! Eu sou ${agentName}, assistente virtual.`,
          direction: 'outbound',
          sender_type: 'bot',
          created_at: new Date().toISOString()
        },
        {
          id: 'greeting_2',
          content: 'Para começarmos, qual é o seu nome?',
          direction: 'outbound',
          sender_type: 'bot',
          created_at: new Date().toISOString()
        }
      ];
    }
    
    return [];
  }

  // Render loading skeleton
  function renderLoadingSkeleton() {
    return `
      <div class="salesos-skeleton-container">
        <div class="salesos-skeleton salesos-skeleton-msg"></div>
        <div class="salesos-skeleton salesos-skeleton-msg short"></div>
        <div class="salesos-skeleton salesos-skeleton-msg" style="align-self: flex-end"></div>
      </div>
    `;
  }

  // Render widget
  function render() {
    let container = document.getElementById('salesos-webchat-container');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'salesos-webchat-container';
      document.body.appendChild(container);
    }

    const primaryColor = state.widgetConfig?.primary_color || '#14B8A6';
    const secondaryColor = state.widgetConfig?.secondary_color || '#0F766E';
    const position = state.widgetConfig?.position || 'bottom-right';
    const positionStyle = position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';
    const agentName = state.agentConfig?.name || 'Assistente Virtual';
    
    const greetingMessages = getGreetingMessages();
    const allMessages = [...greetingMessages, ...state.messages];

    container.innerHTML = `
      <style>
        #salesos-webchat-container * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .salesos-widget-button {
          position: fixed;
          bottom: 20px;
          ${positionStyle}
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 999998;
        }
        
        .salesos-widget-button:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        }
        
        .salesos-widget-button svg {
          width: 28px;
          height: 28px;
          fill: white;
        }
        
        .salesos-chat-window {
          position: fixed;
          bottom: 90px;
          ${positionStyle}
          width: min(380px, calc(100vw - 40px));
          height: min(560px, calc(100vh - 120px));
          max-height: 70vh;
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          display: ${state.isOpen ? 'flex' : 'none'};
          flex-direction: column;
          overflow: hidden;
          z-index: 999999;
          animation: salesos-slide-up 0.3s ease-out;
        }

        @keyframes salesos-slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @media (max-width: 768px) {
          .salesos-chat-window {
            width: min(360px, calc(100vw - 24px));
            height: min(500px, calc(100vh - 100px));
            max-height: 75vh;
            bottom: 85px;
          }
          
          .salesos-widget-button {
            width: 56px;
            height: 56px;
          }
        }
        
        @media (max-width: 480px) {
          .salesos-chat-window {
            width: calc(100% - 20px);
            height: calc(100vh - 140px);
            max-height: 80vh;
            bottom: 80px;
            left: 10px;
            right: 10px;
            border-radius: 12px;
          }
          
          .salesos-widget-button {
            width: 54px;
            height: 54px;
            bottom: 16px;
          }
          
          .salesos-widget-button svg {
            width: 24px;
            height: 24px;
          }
        }
        
        .salesos-chat-header {
          background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
          color: white;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        
        .salesos-chat-header-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        
        .salesos-chat-header-avatar img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }
        
        .salesos-chat-header-avatar svg {
          width: 24px;
          height: 24px;
          fill: white;
        }
        
        .salesos-chat-header-info {
          flex: 1;
          min-width: 0;
        }
        
        .salesos-chat-header-info h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .salesos-chat-header-info p {
          margin: 2px 0 0;
          font-size: 12px;
          opacity: 0.9;
        }

        .salesos-chat-header-close {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .salesos-chat-header-close:hover {
          background: rgba(255,255,255,0.3);
        }

        .salesos-chat-header-close svg,
        .salesos-chat-header-sound svg {
          width: 18px;
          height: 18px;
          fill: white;
        }

        .salesos-chat-header-sound {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .salesos-chat-header-sound:hover {
          background: rgba(255,255,255,0.3);
        }

        .salesos-chat-header-sound.muted {
          opacity: 0.6;
        }
        
        .salesos-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        }
        
        .salesos-message {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          animation: salesos-message-in 0.3s ease-out;
        }

        @keyframes salesos-message-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .salesos-message-inbound {
          align-self: flex-end;
          background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
          color: white;
          border-bottom-right-radius: 4px;
        }
        
        .salesos-message-outbound {
          align-self: flex-start;
          background: white;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .salesos-message-time {
          font-size: 10px;
          opacity: 0.7;
          margin-top: 4px;
        }
        
        .salesos-typing {
          align-self: flex-start;
          background: white;
          border: 1px solid #e2e8f0;
          padding: 14px 18px;
          border-radius: 18px;
          display: flex;
          gap: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .salesos-typing-dot {
          width: 8px;
          height: 8px;
          background: #94a3b8;
          border-radius: 50%;
          animation: salesos-bounce 1.4s ease-in-out infinite both;
        }
        
        .salesos-typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .salesos-typing-dot:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes salesos-bounce {
          0%, 80%, 100% { transform: scale(0.8); }
          40% { transform: scale(1.2); }
        }

        /* Loading skeleton */
        .salesos-skeleton-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
        }

        .salesos-skeleton {
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: salesos-shimmer 1.5s infinite;
          border-radius: 12px;
        }

        .salesos-skeleton-msg {
          height: 48px;
          width: 70%;
        }

        .salesos-skeleton-msg.short {
          width: 50%;
        }

        @keyframes salesos-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .salesos-loading-text {
          text-align: center;
          color: #64748b;
          font-size: 13px;
          padding: 20px;
        }
        
        .salesos-chat-input-area {
          padding: 12px 16px;
          background: white;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-shrink: 0;
        }
        
        .salesos-chat-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 24px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          min-width: 0;
        }
        
        .salesos-chat-input:focus {
          border-color: ${primaryColor};
          box-shadow: 0 0 0 3px ${primaryColor}20;
        }
        
        .salesos-chat-send {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
          flex-shrink: 0;
        }
        
        .salesos-chat-send:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px ${primaryColor}40;
        }
        
        .salesos-chat-send svg {
          width: 20px;
          height: 20px;
          fill: white;
        }
        
        .salesos-handoff-btn {
          width: calc(100% - 32px);
          margin: 0 16px 12px;
          padding: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .salesos-handoff-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #475569;
        }

        .salesos-powered {
          text-align: center;
          padding: 8px;
          font-size: 11px;
          color: #94a3b8;
          background: #f8fafc;
          flex-shrink: 0;
        }

        .salesos-powered a {
          color: #64748b;
          text-decoration: none;
        }

        .salesos-powered a:hover {
          text-decoration: underline;
        }
        
        /* CTA Buttons Styles */
        .salesos-cta-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }
        
        .salesos-cta-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          border: none;
        }
        
        .salesos-cta-btn-primary {
          background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
          color: white;
        }
        
        .salesos-cta-btn-primary:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .salesos-cta-btn-secondary {
          background: white;
          color: ${primaryColor};
          border: 2px solid ${primaryColor};
        }
        
        .salesos-cta-btn-secondary:hover {
          background: ${primaryColor}10;
        }
        
        .salesos-cta-btn svg {
          width: 18px;
          height: 18px;
        }
        
        /* Video Container Styles */
        .salesos-video-container {
          border-radius: 12px;
          overflow: hidden;
          margin-top: 12px;
          background: #000;
        }
        
        .salesos-video-container iframe {
          width: 100%;
          height: 180px;
          border: none;
          display: block;
        }
      </style>
      
      <button class="salesos-widget-button" onclick="window.salesosToggleChat()" aria-label="Abrir chat">
        ${state.isOpen ? `
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        ` : `
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        `}
      </button>
      
      <div class="salesos-chat-window">
        <div class="salesos-chat-header">
          <div class="salesos-chat-header-avatar">
            ${state.agentConfig?.avatar_url 
              ? `<img src="${state.agentConfig.avatar_url}" alt="Avatar" />` 
              : `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>`
            }
          </div>
          <div class="salesos-chat-header-info">
            <h3>${agentName}</h3>
            <p>${state.conversation?.status === 'human_active' ? '🟢 Atendente conectado' : '🟢 Online agora'}</p>
          </div>
          <button class="salesos-chat-header-sound ${state.soundEnabled ? '' : 'muted'}" onclick="window.salesosToggleSound()" aria-label="${state.soundEnabled ? 'Desativar som' : 'Ativar som'}" title="${state.soundEnabled ? 'Desativar som' : 'Ativar som'}">
            ${state.soundEnabled 
              ? `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`
              : `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`
            }
          </button>
          <button class="salesos-chat-header-close" onclick="window.salesosToggleChat()" aria-label="Fechar chat">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        
        <div class="salesos-chat-messages" id="salesos-chat-messages">
          ${state.isLoading && !state.isInitialized ? `
            ${renderLoadingSkeleton()}
            <div class="salesos-loading-text">Carregando conversa...</div>
          ` : allMessages.map(msg => {
            // Check for buttons
            const hasButtons = msg.message_type === 'buttons' && msg.buttons && msg.buttons.length > 0;
            const hasVideo = msg.message_type === 'video' && msg.video_url;
            
            let buttonsHtml = '';
            if (hasButtons) {
              buttonsHtml = '<div class="salesos-cta-buttons">' + 
                msg.buttons.map((btn, i) => {
                  const iconSvg = window.salesosGetButtonIcon(btn.cta_type || btn.type);
                  const styleClass = btn.style === 'primary' || i === 0 ? 'salesos-cta-btn-primary' : 'salesos-cta-btn-secondary';
                  return '<button class="salesos-cta-btn ' + styleClass + '" onclick="window.salesosHandleCTA(\'' + (btn.type || 'url') + '\', \'' + (btn.action || '').replace(/'/g, "\\'") + '\', \'' + (btn.cta_type || btn.type || '') + '\', \'' + (btn.label || '').replace(/'/g, "\\'") + '\')">' + iconSvg + btn.label + '</button>';
                }).join('') + '</div>';
            }
            
            let videoHtml = '';
            if (hasVideo) {
              const embedUrl = window.salesosGetEmbedUrl(msg.video_url);
              if (embedUrl) {
                videoHtml = '<div class="salesos-video-container"><iframe src="' + embedUrl + '" allowfullscreen></iframe></div>';
              }
            }
            
            const showTime = !(msg.id.startsWith('greeting_') || msg.id.startsWith('ask_') || msg.id.startsWith('collect_') || msg.id.startsWith('start_chat_') || msg.id.startsWith('bot_'));
            
            return '<div class="salesos-message salesos-message-' + msg.direction + '">' + 
              (msg.content || '') + 
              buttonsHtml + 
              videoHtml + 
              (showTime ? '<div class="salesos-message-time">' + formatTime(msg.created_at) + '</div>' : '') + 
            '</div>';
          }).join('')}
          
          ${state.isTyping ? `
            <div class="salesos-typing">
              <div class="salesos-typing-dot"></div>
              <div class="salesos-typing-dot"></div>
              <div class="salesos-typing-dot"></div>
            </div>
          ` : ''}
        </div>
        
        <div class="salesos-chat-input-area">
          <input 
            type="${state.collectingField === 'email' ? 'email' : 'text'}" 
            class="salesos-chat-input" 
            id="salesos-chat-input"
            placeholder="${getPlaceholder()}"
            onkeypress="if(event.key==='Enter')window.salesosSendMessage()"
            oninput="window.salesosSendTyping && window.salesosSendTyping()"
            autocomplete="${state.collectingField === 'email' ? 'email' : state.collectingField === 'whatsapp' ? 'tel' : 'name'}"
            ${state.isLoading && !state.isInitialized ? 'disabled' : ''}
          />
          <button class="salesos-chat-send" onclick="window.salesosSendMessage()" aria-label="Enviar mensagem" ${state.isLoading && !state.isInitialized ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        
        ${state.phase === 'chatting' && state.conversation?.status === 'bot_active' && state.isInitialized ? `
          <button class="salesos-handoff-btn" onclick="window.salesosRequestHandoff()">
            💬 Falar com um atendente humano
          </button>
        ` : ''}

        <div class="salesos-powered">
          &nbsp;
        </div>
      </div>
    `;
  }

  // Get embed URL for YouTube/Vimeo videos
  window.salesosGetEmbedUrl = function(url) {
    if (!url) return null;
    
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return 'https://www.youtube.com/embed/' + ytMatch[1] + '?autoplay=0';
    }
    
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) {
      return 'https://player.vimeo.com/video/' + vimeoMatch[1];
    }
    
    return url;
  };
  
  // Get button icon based on CTA type
  window.salesosGetButtonIcon = function(ctaType) {
    switch (ctaType) {
      case 'checkout':
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>';
      case 'whatsapp':
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
      case 'calendar':
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>';
      case 'callback':
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';
      case 'video':
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
    }
  };
  
  // Handle CTA button clicks
  window.salesosHandleCTA = function(type, action, ctaType, label) {
    console.log('[SalesOS WebChat] CTA clicked:', { type, action, ctaType, label });
    
    // Check if this is a flow button that needs to continue the flow
    if (type === 'flow_button' || ctaType === 'flow' || ctaType === 'next_block') {
      // Send the button label/id as a message to continue the flow
      if (state.conversation?.id) {
        sendMessage(label.replace(/^[^\w\s]+\s*/, '').trim()); // Remove emoji prefix
      }
      return;
    }
    
    switch (type) {
      case 'url':
      case 'calendar':
        if (action) window.open(action, '_blank');
        break;
      case 'whatsapp':
        if (action) {
          const cleanNumber = action.replace(/\D/g, '');
          window.open('https://wa.me/' + cleanNumber, '_blank');
        }
        break;
      case 'callback':
        // Send callback request
        if (state.conversation?.id) {
          apiCall('request-callback', {
            conversation_id: state.conversation.id,
            visitor_id: state.visitorId,
            visitor_name: state.visitorData.name,
            visitor_phone: state.visitorData.whatsapp
          }).then(() => {
            state.messages.push({
              id: 'callback_' + Date.now(),
              content: '✅ Solicitação de ligação enviada! Nossa equipe entrará em contato em breve.',
              direction: 'outbound',
              sender_type: 'bot',
              created_at: new Date().toISOString()
            });
            render();
            scrollToBottom();
          }).catch(err => {
            console.error('[SalesOS WebChat] Callback request failed:', err);
          });
        }
        break;
      case 'video':
        // Video is already rendered inline
        break;
    }
    
    // Track CTA click for analytics
    if (state.conversation?.id) {
      apiCall('track-cta', {
        conversation_id: state.conversation.id,
        cta_type: ctaType,
        cta_label: label,
        action: action
      }).catch(() => {});
    }
  };

  // Global functions
  window.salesosToggleChat = toggleChat;
  window.salesosSendMessage = function() {
    const input = document.getElementById('salesos-chat-input');
    if (input && input.value.trim()) {
      sendMessage(input.value.trim());
      input.value = '';
    }
  };
  window.salesosRequestHandoff = requestHandoff;
  window.salesosToggleSound = function() {
    soundManager.toggle();
  };

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
