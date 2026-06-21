import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Trash2, Loader2, Bot, Compass } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
}

interface AgentTestChatProps {
  agentId: string;
  agentName: string;
  productId: string;
  /** When the agent being tested is the Orchestrator (or a global admin agent),
   *  the test runs the welcome+menu+routing flow instead of a direct LLM reply. */
  agentType?: string;
}

export function AgentTestChat({ agentId, agentName, productId, agentType }: AgentTestChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Treat both explicit "orchestrator" type and global "admin" agents as orchestrator-style for testing.
  const isOrchestratorTest = agentType === 'orchestrator' || agentType === 'admin';

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('webchat-bot', {
        body: {
          conversation_id: `agent-test-${agentId}-${sessionId}`,
          message: text,
          product_id: productId,
          agent_id: agentId,
          is_test: true,
          // Signal to the backend that this is an orchestrator-style test:
          // run welcome+menu+routing using in-memory state instead of an LLM reply.
          ...(isOrchestratorTest ? { test_mode: 'orchestrator' as const } : {}),
          agent_config: {
            agent_name: agentName,
            system_prompt: '',
            knowledge_base: null,
            faq: [],
            fallback_message: 'Desculpe, não entendi.',
            use_product_brain: true,
          },
        },
      });

      if (error) throw error;

      const botContent = data?.message?.content || data?.response || data?.reply || 'Sem resposta do agente.';
      const botMsg: Message = { id: crypto.randomUUID(), role: 'bot', content: botContent };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error('Erro ao testar agente:', err);
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'bot',
        content: '⚠️ Erro ao obter resposta. Verifique se o agente está configurado corretamente.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setMessages([]);
    // Reset session id so the orchestrator test state is rebuilt from scratch
    // (greeting + menu fire again on the next message).
    setSessionId(crypto.randomUUID());
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center",
            isOrchestratorTest ? "bg-amber-500/15" : "bg-primary/10"
          )}>
            {isOrchestratorTest
              ? <Compass className="h-3.5 w-3.5 text-amber-600" />
              : <Bot className="h-3.5 w-3.5 text-primary" />}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">{agentName}</p>
              {isOrchestratorTest && (
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-500/40 text-amber-700 bg-amber-50">
                  Orquestrador
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {isOrchestratorTest ? 'Simulando boas-vindas, menu e roteamento' : 'Modo de teste'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs gap-1 text-muted-foreground">
            <Trash2 className="h-3 w-3" />
            Limpar
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Teste seu agente</p>
            <p className="text-xs text-muted-foreground mt-1">
              Simule uma conversa de venda ou faça perguntas para testar as respostas do agente
            </p>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] px-3 py-2 rounded-2xl text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                )}
              >
                {msg.role === 'bot' ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc list-inside mt-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mt-1">{children}</ol>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-muted px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t mt-3">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Digite uma mensagem..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
