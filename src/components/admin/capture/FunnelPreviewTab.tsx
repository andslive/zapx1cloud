import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  MessageSquare, 
  FileText, 
  Globe,
  Smartphone,
  Monitor,
  Play,
  RotateCcw,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Layout
} from 'lucide-react';
import { Funnel, FunnelBlock } from '@/types/funnel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ChatMessageBubble, 
  ChatTypingIndicator, 
  ChatBanner, 
  ChatPhoneInput,
  ChatCalendarPicker 
} from '@/components/chat';

interface FunnelPreviewTabProps {
  funnel: Funnel;
}

type PreviewChannel = 'chat' | 'form' | 'widget' | 'landing';
type PreviewDevice = 'mobile' | 'desktop';

interface PreviewMessage {
  id: string;
  type: 'bot' | 'user' | 'system';
  content: string;
  blockId?: string;
  options?: Array<{ id: string; label: string; emoji?: string; next_block_id?: string | null }>;
  inputType?: string;
  placeholder?: string;
  awaitingInput?: boolean;
  // Calendar support
  calendarConfig?: {
    eventTypeId: string;
  };
}

interface CollectedData {
  [key: string]: string;
}

export function FunnelPreviewTab({ funnel }: FunnelPreviewTabProps) {
  const [channel, setChannel] = useState<PreviewChannel>('chat');
  const [device, setDevice] = useState<PreviewDevice>('mobile');
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [collectedData, setCollectedData] = useState<CollectedData>({});
  const [isSimulating, setIsSimulating] = useState(false);
  const [formBlockIndex, setFormBlockIndex] = useState(0);
  
  // AI Chat Mode states
  const [aiChatMode, setAiChatMode] = useState(false);
  const [aiAgentId, setAiAgentId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  
  // Ref to track last message content to prevent duplicates
  const lastMessageContentRef = useRef<string>('');
  
  // Auto-scroll refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const blocks = funnel.flow_blocks || [];
  
  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Find the correct start block using the same logic as PublicChat
  const findStartBlock = useCallback((): FunnelBlock | null => {
    if (blocks.length === 0) return null;

    // Priority 1: Use start_block_id if valid
    let startBlock = blocks.find(b => b.id === funnel.start_block_id);
    
    if (!startBlock) {
      // Priority 2: Find orphan blocks (no incoming connections)
      const targetedIds = new Set(
        blocks.flatMap(b => [
          b.next_block_id,
          b.data.true_next_block_id,
          b.data.false_next_block_id,
          ...(b.data.options?.map(o => o.next_block_id) || [])
        ].filter(Boolean))
      );
      startBlock = blocks.find(b => !targetedIds.has(b.id));
    }
    
    if (!startBlock) {
      // Priority 3: Sort by position (top-left first)
      const sorted = [...blocks].sort((a, b) => 
        a.position.y - b.position.y || a.position.x - b.position.x
      );
      startBlock = sorted[0];
    }

    return startBlock || null;
  }, [blocks, funnel.start_block_id]);

  // Get ordered blocks for Form view
  const getOrderedBlocks = useCallback((): FunnelBlock[] => {
    const startBlock = findStartBlock();
    if (!startBlock) return [];
    
    const ordered: FunnelBlock[] = [];
    const visited = new Set<string>();
    let current: FunnelBlock | undefined = startBlock;
    const maxIterations = blocks.length + 10;
    let iterations = 0;

    while (current && !visited.has(current.id) && iterations < maxIterations) {
      // Only include visible blocks for form (skip delay, conditions, etc.)
      if (['message', 'input', 'buttons', 'end'].includes(current.type)) {
        ordered.push(current);
      }
      visited.add(current.id);
      iterations++;
      
      if (current.next_block_id) {
        current = blocks.find(b => b.id === current!.next_block_id);
      } else {
        break;
      }
    }

    return ordered;
  }, [blocks, findStartBlock]);

  // Robust variable replacement with aliases
  const replaceVariables = useCallback((text: string): string => {
    if (!text) return '';
    
    let result = text;
    
    // Define common aliases
    const aliases: Record<string, string[]> = {
      nome: ['name', 'nome', 'first_name', 'firstName', 'Nome'],
      email: ['email', 'e-mail', 'Email'],
      telefone: ['phone', 'telefone', 'fone', 'whatsapp', 'Phone', 'Telefone'],
      empresa: ['company', 'empresa', 'Company'],
    };
    
    // First, directly replace collected variables (case-insensitive)
    Object.entries(collectedData).forEach(([key, value]) => {
      if (!value) return;
      
      // Match {key}, {{key}}, {Key}, {KEY}
      const patterns = [
        new RegExp(`\\{${key}\\}`, 'gi'),
        new RegExp(`\\{\\{${key}\\}\\}`, 'gi'),
      ];
      
      patterns.forEach(regex => {
        result = result.replace(regex, value);
      });
    });
    
    // Then try aliases if variable not yet replaced
    Object.entries(aliases).forEach(([canonical, aliasKeys]) => {
      // Find value from any alias
      let foundValue = '';
      for (const alias of aliasKeys) {
        if (collectedData[alias]) {
          foundValue = collectedData[alias];
          break;
        }
      }
      
      if (foundValue) {
        // Replace {canonical} and all alias patterns
        [canonical, ...aliasKeys].forEach(varName => {
          const regex = new RegExp(`\\{${varName}\\}`, 'gi');
          result = result.replace(regex, foundValue);
        });
      }
    });
    
    // Replace any remaining unreplaced variables with friendly placeholder
    result = result.replace(/\{(\w+)\}/g, (match, varName) => {
      const placeholders: Record<string, string> = {
        nome: 'Visitante',
        name: 'Visitante',
        email: 'email@exemplo.com',
        telefone: '(00) 00000-0000',
        phone: '(00) 00000-0000',
        whatsapp: '(00) 00000-0000',
      };
      return placeholders[varName.toLowerCase()] || match;
    });
    
    return result;
  }, [collectedData]);

  // Add bot message with duplicate prevention
  const addBotMessage = useCallback((content: string, blockId: string, extras?: Partial<PreviewMessage>) => {
    const processedContent = replaceVariables(content);
    
    setMessages(prev => {
      // Check for duplicate consecutive messages
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.type === 'bot' && lastMessage.content === processedContent) {
        console.log('[Preview] Skipping duplicate message:', processedContent.substring(0, 50));
        return prev;
      }
      
      // Also check against ref for edge cases
      if (lastMessageContentRef.current === processedContent) {
        console.log('[Preview] Skipping duplicate (ref):', processedContent.substring(0, 50));
        return prev;
      }
      
      lastMessageContentRef.current = processedContent;
      
      return [...prev, {
        id: `msg-${Date.now()}`,
        type: 'bot',
        content: processedContent,
        blockId,
        ...extras,
      }];
    });
  }, [replaceVariables]);

  // Call AI for real response
  const callAI = useCallback(async (userMessage: string, agentId?: string | null): Promise<string> => {
    try {
      console.log('[Preview] Calling AI with message:', userMessage);
      
      const { data, error } = await supabase.functions.invoke('webchat-bot', {
        body: {
          conversation_id: `preview-${Date.now()}`,
          message: userMessage,
          product_id: funnel.product_id,
          agent_id: agentId || undefined,
          is_test: true,
          visitor_name: collectedData.nome || collectedData.name || 'Visitante',
          agent_config: {
            agent_name: 'Sofia',
            system_prompt: '',
            fallback_message: 'Desculpe, não consegui processar. Tente novamente.',
            use_product_brain: true,
            temperature: 0.7,
            faq: [],
            knowledge_base: null,
          }
        }
      });
      
      if (error) {
        console.error('[Preview] AI call error:', error);
        throw error;
      }
      
      console.log('[Preview] AI response:', data);
      
      // Handle different response formats
      if (data?.response) {
        return data.response;
      }
      if (data?.message?.content) {
        return data.message.content;
      }
      if (typeof data === 'string') {
        return data;
      }
      
      return 'Olá! Como posso ajudar você hoje?';
    } catch (err) {
      console.error('[Preview] AI call failed:', err);
      return '[Erro ao conectar com IA - verifique as configurações]';
    }
  }, [funnel.product_id, collectedData]);

  // Process a single block
  const processBlock = useCallback(async (block: FunnelBlock) => {
    console.log('[Preview] Processing block:', block.type, block.id);

    switch (block.type) {
      case 'message':
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 800));
        setIsTyping(false);
        
        addBotMessage(block.data.content || '', block.id);
        
        // Auto-advance to next block after message
        if (block.next_block_id) {
          setTimeout(() => setCurrentBlockId(block.next_block_id!), 500);
        }
        break;

      case 'input':
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTyping(false);
        
        // Only show content if it's different from last message (prevent duplication)
        const inputContent = block.data.content || block.data.placeholder || 'Digite sua resposta:';
        
        setMessages(prev => {
          const lastBotMessage = [...prev].reverse().find(m => m.type === 'bot');
          const processedContent = replaceVariables(inputContent);
          
          // Skip if content is same as last bot message
          if (lastBotMessage?.content === processedContent) {
            // Just mark as awaiting input without duplicating
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                awaitingInput: true,
                placeholder: block.data.placeholder,
                blockId: block.id,
              };
            }
            return updated;
          }
          
          return [...prev, {
            id: `msg-${Date.now()}`,
            type: 'bot',
            content: processedContent,
            blockId: block.id,
            inputType: block.data.input_type || 'text',
            placeholder: block.data.placeholder,
            awaitingInput: true,
          }];
        });
        break;

      case 'buttons':
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTyping(false);
        
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'bot',
          content: replaceVariables(block.data.content || 'Escolha uma opção:'),
          blockId: block.id,
          options: block.data.options?.map(opt => ({
            id: opt.id,
            label: opt.label,
            emoji: opt.emoji,
            next_block_id: opt.next_block_id,
          })),
        }]);
        break;

      case 'delay':
        let delaySeconds = 5;
        if (block.data.is_variable_delay && block.data.min_delay_ms !== undefined && block.data.max_delay_ms !== undefined) {
          const min = block.data.min_delay_ms / 1000;
          const max = block.data.max_delay_ms / 1000;
          delaySeconds = Math.floor(Math.random() * (max - min + 1)) + min;
        } else {
          delaySeconds = block.data.delay_ms ? block.data.delay_ms / 1000 : 5;
        }
        
        const delayMs = delaySeconds * 1000;
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: `⏱️ Aguardando ${delaySeconds}s${block.data.is_variable_delay ? ' (aleatório)' : ''}...`,
        }]);
        await new Promise(r => setTimeout(r, Math.min(delayMs, 3000))); // Max 3s in preview to not bore the user
        
        if (block.next_block_id) {
          setCurrentBlockId(block.next_block_id);
        }
        break;

      case 'ai_takeover':
        // Enable AI chat mode
        setAiChatMode(true);
        setAiAgentId(block.data.agent_id || null);
        
        setIsTyping(true);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: '🤖 IA assumindo conversa...',
        }]);
        
        try {
          // Call real AI for initial greeting
          const aiResponse = await callAI('Olá, em que posso ajudar?', block.data.agent_id);
          
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: 'bot',
            content: aiResponse,
            blockId: block.id,
            awaitingInput: true,
          }]);
        } catch (err) {
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: 'bot',
            content: 'Olá! Como posso ajudar você hoje?',
            blockId: block.id,
            awaitingInput: true,
          }]);
        }
        break;

      case 'ai_decide':
        setIsTyping(true);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: '🧠 IA analisando contexto...',
        }]);
        await new Promise(r => setTimeout(r, 1500));
        setIsTyping(false);
        
        // For preview, follow the first output path
        const firstOutput = block.data.ai_outputs?.[0];
        if (firstOutput?.next_block_id) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: 'system',
            content: `📊 Decisão: ${firstOutput.label}`,
          }]);
          setTimeout(() => setCurrentBlockId(firstOutput.next_block_id!), 500);
        } else if (block.next_block_id) {
          setTimeout(() => setCurrentBlockId(block.next_block_id!), 500);
        }
        break;

      case 'agent_switch':
        setAiAgentId(block.data.agent_id || null);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: '🔄 Transferindo para agente especializado...',
        }]);
        
        if (block.next_block_id) {
          setTimeout(() => setCurrentBlockId(block.next_block_id!), 1000);
        }
        break;

      case 'condition':
        // In preview, just follow the true path
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: `⚡ Condição: ${block.data.condition?.variable || 'avaliando'}...`,
        }]);
        
        const nextId = block.data.true_next_block_id || block.next_block_id;
        if (nextId) {
          setTimeout(() => setCurrentBlockId(nextId), 500);
        }
        break;

      case 'create_lead':
      case 'update_lead':
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: block.type === 'create_lead' ? '👤 Lead criado no CRM' : '✏️ Lead atualizado',
        }]);
        
        if (block.next_block_id) {
          setTimeout(() => setCurrentBlockId(block.next_block_id!), 300);
        }
        break;

      case 'schedule':
        // Show introduction message
        setIsTyping(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTyping(false);
        
        const scheduleMessage = replaceVariables(
          block.data.schedule_message || 'Escolha o melhor horário para nossa conversa:'
        );
        
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'bot',
          content: scheduleMessage,
          blockId: block.id,
        }, {
          id: `calendar-${Date.now()}`,
          type: 'bot',
          content: '__CALENDAR__',
          blockId: block.id,
          calendarConfig: {
            eventTypeId: block.data.schedule_event_type_id || '',
          },
        }]);
        break;

      case 'end':
        setAiChatMode(false);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'system',
          content: `✅ ${replaceVariables(block.data.success_message || 'Fluxo concluído!')}`,
        }]);
        setIsSimulating(false);
        break;

      default:
        // Unknown block type, try to advance
        if (block.next_block_id) {
          setTimeout(() => setCurrentBlockId(block.next_block_id!), 300);
        }
    }
  }, [replaceVariables, addBotMessage, callAI]);

  // Watch for currentBlockId changes
  useEffect(() => {
    if (!currentBlockId || !isSimulating) return;

    const block = blocks.find(b => b.id === currentBlockId);
    if (block) {
      processBlock(block);
    }
  }, [currentBlockId, isSimulating, blocks, processBlock]);

  // Start simulation
  const handleStart = () => {
    const startBlock = findStartBlock();
    if (!startBlock) {
      toast.error('Nenhum bloco de início encontrado');
      console.error('[Preview] No start block found');
      return;
    }

    console.log('[Preview] Starting simulation from block:', startBlock.id);
    setMessages([]);
    setCollectedData({});
    setInputValue('');
    setIsSimulating(true);
    setFormBlockIndex(0);
    setAiChatMode(false);
    setAiAgentId(null);
    setConversationHistory([]);
    lastMessageContentRef.current = '';
    setCurrentBlockId(startBlock.id);
  };

  // Reset simulation
  const handleReset = () => {
    setMessages([]);
    setCollectedData({});
    setInputValue('');
    setIsSimulating(false);
    setFormBlockIndex(0);
    setCurrentBlockId(null);
    setIsTyping(false);
    setAiChatMode(false);
    setAiAgentId(null);
    setConversationHistory([]);
    lastMessageContentRef.current = '';
  };

  // Handle user input submission
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // If in AI chat mode, send to AI
    if (aiChatMode) {
      // Add user message
      setMessages(prev => [
        ...prev.map(m => ({ ...m, awaitingInput: false })),
        {
          id: `user-${Date.now()}`,
          type: 'user',
          content: userMessage,
        }
      ]);

      setIsTyping(true);

      try {
        const aiResponse = await callAI(userMessage, aiAgentId);
        
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'bot',
          content: aiResponse,
          awaitingInput: true,
        }]);
      } catch (err) {
        setIsTyping(false);
        toast.error('Erro ao obter resposta da IA');
      }
      return;
    }

    // Normal flow mode
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.awaitingInput) return;

    const block = blocks.find(b => b.id === lastMessage.blockId);
    if (!block) return;

    // Store the variable
    const varName = block.data.variable_name || block.data.input_type || 'resposta';
    setCollectedData(prev => ({ ...prev, [varName]: userMessage }));

    // Add user message
    setMessages(prev => [
      ...prev.map(m => m.id === lastMessage.id ? { ...m, awaitingInput: false } : m),
      {
        id: `user-${Date.now()}`,
        type: 'user',
        content: userMessage,
      }
    ]);

    // Advance to next block
    if (block.next_block_id) {
      setTimeout(() => setCurrentBlockId(block.next_block_id!), 300);
    }
  };

  // Handle button option click
  const handleOptionClick = (option: { id: string; label: string; next_block_id?: string }) => {
    // Add user selection as message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: option.label,
    }]);

    // Advance to the option's target or the block's next
    if (option.next_block_id) {
      setTimeout(() => setCurrentBlockId(option.next_block_id!), 300);
    }
  };

  // Handle calendar selection
  const handleCalendarSelect = async (date: Date, slot: { start: string; end: string }, blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    // Add user message with selection
    const selectionText = `${format(date, 'dd/MM/yyyy')} às ${slot.start}`;
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: selectionText,
    }]);

    // Save to collected data
    setCollectedData(prev => ({
      ...prev,
      scheduled_date: format(date, 'yyyy-MM-dd'),
      scheduled_time: slot.start,
    }));

    // Show success message
    setIsTyping(true);
    await new Promise(r => setTimeout(r, 800));
    setIsTyping(false);

    setMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      type: 'bot',
      content: block.data.schedule_success_message || 'Perfeito! Seu horário foi reservado. Você receberá uma confirmação por e-mail.',
    }]);

    // Advance to next block
    if (block.next_block_id) {
      setTimeout(() => setCurrentBlockId(block.next_block_id!), 500);
    }
  };

  // Get the last interactive message (for showing input)
  const lastInteractiveMessage = [...messages].reverse().find(m => m.awaitingInput || m.options);
  const showInput = lastInteractiveMessage?.awaitingInput || aiChatMode;
  const showOptions = lastInteractiveMessage?.options && !messages.some(m => m.type === 'user' && messages.indexOf(m) > messages.indexOf(lastInteractiveMessage));
  
  // Check if there's a pending calendar picker
  const pendingCalendar = [...messages].reverse().find(m => m.content === '__CALENDAR__' && m.calendarConfig);

  // Form mode ordered blocks
  const orderedBlocks = getOrderedBlocks();
  const currentFormBlock = orderedBlocks[formBlockIndex];

  // Format current time as HH:mm for WhatsApp-style timestamps
  const nowHHmm = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderChatPreview = () => (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      {/* WhatsApp Header */}
      <div className="px-3 py-2.5 flex items-center gap-3" style={{ backgroundColor: '#075E54' }}>
        {funnel.theme.logo_url ? (
          <img src={funnel.theme.logo_url} alt="Logo" className="w-9 h-9 rounded-full object-cover border-2 border-white/20" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm truncate">{funnel.products?.name || funnel.name || 'Assistente'}</p>
          <p className="text-[11px] text-white/80">{aiChatMode ? 'digitando…' : 'online'}</p>
        </div>
      </div>

      {/* Messages Area — WhatsApp beige background with subtle pattern */}
      <ScrollArea
        className="flex-1"
        ref={scrollAreaRef}
        style={{
          backgroundColor: '#ECE5DD',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40' opacity='0.06'><circle cx='2' cy='2' r='1' fill='%23000'/><circle cx='22' cy='22' r='1' fill='%23000'/></svg>\")",
        }}
      >
        <div className="p-3 space-y-1.5">
          {!isSimulating && messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Clique em "Testar" para iniciar a simulação</p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <span className="bg-white/80 text-[11px] text-muted-foreground px-2.5 py-1 rounded-md shadow-sm">
                    {msg.content}
                  </span>
                </div>
              );
            }

            if (msg.content === '__CALENDAR__' && msg.calendarConfig) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none p-2 shadow-sm">
                    <ChatCalendarPicker
                      eventTypeId={msg.calendarConfig.eventTypeId}
                      primaryColor="#25D366"
                      onSelect={(date, slot) => handleCalendarSelect(date, slot, msg.blockId || '')}
                    />
                  </div>
                </div>
              );
            }

            const isUser = msg.type === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] flex flex-col">
                  <div
                    className={`relative px-2.5 py-1.5 shadow-sm text-[14px] leading-snug whitespace-pre-wrap break-words ${
                      isUser
                        ? 'rounded-lg rounded-tr-none'
                        : 'rounded-lg rounded-tl-none'
                    }`}
                    style={{
                      backgroundColor: isUser ? '#DCF8C6' : '#FFFFFF',
                      color: '#111B21',
                    }}
                  >
                    <span>{msg.content}</span>
                    <span className="inline-flex items-center gap-0.5 ml-2 float-right mt-1 text-[10px] text-black/45">
                      {nowHHmm()}
                      {isUser && (
                        <svg viewBox="0 0 16 11" className="w-3.5 h-3 ml-0.5" fill="none">
                          <path d="M11.071.653a.499.499 0 00-.706.073L4.71 7.244 2.34 4.873a.5.5 0 10-.708.708l2.745 2.745a.5.5 0 00.741-.038L11.144 1.36a.5.5 0 00-.073-.706z" fill="#34B7F1"/>
                          <path d="M15.071.653a.499.499 0 00-.706.073L8.71 7.244 8.341 6.875a.5.5 0 10-.708.708l.745.745a.5.5 0 00.741-.038L15.144 1.36a.5.5 0 00-.073-.706z" fill="#34B7F1"/>
                        </svg>
                      )}
                    </span>
                  </div>

                  {/* Options buttons */}
                  {msg.options && showOptions && msg === lastInteractiveMessage && (
                    <div className="mt-1.5 space-y-1">
                      {msg.options.map((opt) => (
                        <motion.button
                          key={opt.id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => handleOptionClick(opt)}
                          className="block w-full p-2 rounded-md bg-white border border-black/5 text-[13px] text-left text-[#075E54] font-medium hover:bg-[#F0F2F5] transition-colors shadow-sm"
                        >
                          {opt.emoji && <span className="mr-2">{opt.emoji}</span>}
                          {opt.label}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white px-3 py-2 rounded-lg rounded-tl-none shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-black/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* WhatsApp Input Bar */}
      <div className="px-2 py-2 flex items-center gap-2" style={{ backgroundColor: '#F0F2F5' }}>
        <div className="flex-1 flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm">
          <span className="text-lg select-none" aria-hidden>😊</span>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={aiChatMode ? 'Converse com a IA...' : (lastInteractiveMessage?.placeholder || 'Mensagem')}
            disabled={!showInput}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:opacity-50"
          />
          <span className="text-base select-none opacity-60" aria-hidden>📎</span>
        </div>
        <button
          onClick={handleSendMessage}
          disabled={!showInput || !inputValue.trim() || isTyping}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#25D366' }}
          aria-label="Enviar"
        >
          {isTyping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : inputValue.trim() ? (
            <Send className="h-4 w-4" />
          ) : (
            <span className="text-lg" aria-hidden>🎤</span>
          )}
        </button>
      </div>
    </div>
  );

  const renderFormPreview = () => (
    <div 
      className="h-full flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: funnel.theme.background_color }}
    >
      {orderedBlocks.length === 0 ? (
        <div className="text-center" style={{ color: funnel.theme.text_color }}>
          <p className="opacity-70">Adicione blocos ao fluxo para ver o preview</p>
        </div>
      ) : !isSimulating ? (
        <div className="text-center" style={{ color: funnel.theme.text_color }}>
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="opacity-70">Clique em "Testar" para iniciar</p>
        </div>
      ) : currentFormBlock ? (
        <div className="max-w-md w-full space-y-6 text-center">
          {/* Progress */}
          {funnel.theme.show_progress && (
            <div className="flex gap-1 justify-center">
              {orderedBlocks.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1 w-8 rounded-full transition-colors ${
                    idx <= formBlockIndex ? '' : 'opacity-30'
                  }`}
                  style={{ 
                    backgroundColor: idx <= formBlockIndex 
                      ? funnel.theme.primary_color 
                      : funnel.theme.text_color 
                  }}
                />
              ))}
            </div>
          )}

          {/* Current Block Content */}
          <div className="space-y-4">
            {(currentFormBlock.type === 'message' || currentFormBlock.type === 'input') && (
              <h2 
                className="text-2xl font-semibold"
                style={{ color: funnel.theme.text_color }}
              >
                {replaceVariables(currentFormBlock.data.content || currentFormBlock.data.placeholder || '')}
              </h2>
            )}

            {currentFormBlock.type === 'input' && (
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                type={currentFormBlock.data.input_type === 'email' ? 'email' : 'text'}
                placeholder={currentFormBlock.data.placeholder}
                className="w-full p-4 rounded-lg text-lg text-center"
                style={{ color: funnel.theme.text_color }}
              />
            )}

            {currentFormBlock.type === 'buttons' && (
              <div className="space-y-3">
                {currentFormBlock.data.options?.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (opt.next_block_id) {
                        const nextIdx = orderedBlocks.findIndex(b => b.id === opt.next_block_id);
                        if (nextIdx >= 0) {
                          setFormBlockIndex(nextIdx);
                        } else {
                          setFormBlockIndex(prev => Math.min(orderedBlocks.length - 1, prev + 1));
                        }
                      } else {
                        setFormBlockIndex(prev => Math.min(orderedBlocks.length - 1, prev + 1));
                      }
                    }}
                    className="block w-full p-4 rounded-lg text-lg hover:scale-105 transition-transform"
                    style={{ 
                      backgroundColor: funnel.theme.primary_color,
                      color: '#fff'
                    }}
                  >
                    {opt.emoji && <span className="mr-2">{opt.emoji}</span>}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {currentFormBlock.type === 'end' && (
              <div>
                <div className="text-5xl mb-4">✅</div>
                <p 
                  className="text-xl"
                  style={{ color: funnel.theme.text_color }}
                >
                  {replaceVariables(currentFormBlock.data.success_message || 'Obrigado!')}
                </p>
              </div>
            )}
          </div>

          {/* Navigation (not for end or buttons) */}
          {currentFormBlock.type !== 'end' && currentFormBlock.type !== 'buttons' && (
            <div className="flex justify-center gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => setFormBlockIndex(Math.max(0, formBlockIndex - 1))}
                disabled={formBlockIndex === 0}
                style={{ color: funnel.theme.text_color, borderColor: funnel.theme.text_color + '40' }}
              >
                ← Voltar
              </Button>
              <Button
                onClick={() => {
                  // Store input if needed
                  if (currentFormBlock.type === 'input' && inputValue.trim()) {
                    const varName = currentFormBlock.data.variable_name || currentFormBlock.data.input_type || 'resposta';
                    setCollectedData(prev => ({ ...prev, [varName]: inputValue }));
                    setInputValue('');
                  }
                  setFormBlockIndex(Math.min(orderedBlocks.length - 1, formBlockIndex + 1));
                }}
                disabled={formBlockIndex >= orderedBlocks.length - 1}
                style={{ 
                  backgroundColor: funnel.theme.primary_color,
                  color: '#fff'
                }}
              >
                Continuar →
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center" style={{ color: funnel.theme.text_color }}>
          <p className="opacity-70">Fluxo concluído</p>
        </div>
      )}
    </div>
  );

  const renderWidgetPreview = () => (
    <div className="h-full flex items-end justify-end p-4 bg-gradient-to-br from-muted/20 to-muted/40">
      <div className="w-80 h-[500px] bg-background rounded-2xl shadow-2xl overflow-hidden">
        {renderChatPreview()}
      </div>
    </div>
  );

  const renderLandingPreview = () => (
    <iframe
      src={`/s/${funnel.slug}`}
      className="w-full h-full border-0"
      title="Quiz Preview"
    />
  );

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Tabs value={channel} onValueChange={(v) => { setChannel(v as PreviewChannel); handleReset(); }}>
            <TabsList>
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="form" className="gap-2">
                <FileText className="h-4 w-4" />
                Form
              </TabsTrigger>
              <TabsTrigger value="widget" className="gap-2">
                <Globe className="h-4 w-4" />
                Widget
              </TabsTrigger>
              <TabsTrigger value="landing" className="gap-2">
                <Layout className="h-4 w-4" />
                Quiz
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={device} onValueChange={(v) => setDevice(v as PreviewDevice)}>
            <TabsList>
              <TabsTrigger value="mobile">
                <Smartphone className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="desktop">
                <Monitor className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleStart} disabled={blocks.length === 0}>
            <Play className="h-4 w-4 mr-1" />
            Testar
          </Button>
        </div>
      </div>

      {/* Debug info */}
      {isSimulating && (
        <div className="mb-2 flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            Bloco: {currentBlockId?.slice(-8) || 'N/A'}
          </Badge>
          {aiChatMode && (
            <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600">
              🤖 Modo IA Ativo
            </Badge>
          )}
          {Object.keys(collectedData).length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Dados: {JSON.stringify(collectedData)}
            </Badge>
          )}
        </div>
      )}

      {/* Preview Container */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full flex items-center justify-center bg-muted/20">
          <div 
            className={`
              bg-background rounded-2xl shadow-xl overflow-hidden transition-all
              ${device === 'mobile' ? 'w-[375px] h-[667px]' : 'w-full max-w-4xl h-[600px]'}
            `}
          >
            {channel === 'chat' && renderChatPreview()}
            {channel === 'form' && renderFormPreview()}
            {channel === 'widget' && renderWidgetPreview()}
            {channel === 'landing' && renderLandingPreview()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
