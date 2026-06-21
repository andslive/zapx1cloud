import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Trash2, Loader2, Bot, User, Brain, FileText, HelpCircle, Globe, Video, ExternalLink, MessageSquare, Phone, Calendar, ShoppingCart } from 'lucide-react';
import { WebChatAgentConfig } from '@/hooks/useWebChat';
import { useKnowledgeSources } from '@/hooks/useKnowledgeSources';
import { useProduct } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ChatSimulatorProps {
  widgetId: string;
  productId: string;
  agentConfig?: WebChatAgentConfig;
}

interface ChatButton {
  id: string;
  label: string;
  type: 'url' | 'whatsapp' | 'callback' | 'calendar' | 'video' | 'flow_button';
  action: string;
  style: 'primary' | 'secondary' | 'outline';
  cta_type: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  buttons?: ChatButton[];
  video_url?: string;
}

export function ChatSimulator({ widgetId, productId, agentConfig }: ChatSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { data: knowledgeSources } = useKnowledgeSources(productId);
  const { data: product } = useProduct(productId);

  const activeSources = knowledgeSources?.filter(s => s.is_active && s.processing_status === 'completed') || [];
  
  const sourcesByType = {
    faq: activeSources.filter(s => s.source_type === 'faq').length,
    website: activeSources.filter(s => s.source_type === 'website').length,
    youtube: activeSources.filter(s => s.source_type === 'youtube').length,
    file: activeSources.filter(s => s.source_type === 'file').length,
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call the webchat-bot edge function directly for testing
      const response = await supabase.functions.invoke('webchat-bot', {
        body: {
          conversation_id: `test-${widgetId}`,
          message: userMessage.content,
          product_id: productId,
          agent_id: agentConfig?.id || undefined,
          is_test: true,
          agent_config: {
            agent_name: agentConfig?.agent_name || 'Assistente Virtual',
            system_prompt: agentConfig?.system_prompt || '',
            knowledge_base: null,
            faq: agentConfig?.faq || [],
            fallback_message: agentConfig?.fallback_message || 'Desculpe, não entendi.',
            temperature: agentConfig?.temperature ?? 0.7,
            max_tokens: agentConfig?.max_tokens ?? 500,
            persona_style: agentConfig?.persona_style || 'friendly',
            use_product_brain: agentConfig?.use_product_brain ?? true,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const responseData = response.data;
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseData?.message?.content || responseData?.response || 'Erro ao processar resposta.',
        buttons: responseData?.buttons || responseData?.message?.buttons || undefined,
        video_url: responseData?.video_url || responseData?.message?.video_url || undefined,
      };

      console.log('[ChatSimulator] Response received:', { 
        content: assistantMessage.content?.substring(0, 50),
        buttons: assistantMessage.buttons?.length || 0,
        video_url: !!assistantMessage.video_url 
      });

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error in chat simulator:', error);
      toast.error('Erro ao enviar mensagem. Verifique a configuração.');
      
      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  // Convert YouTube/Vimeo URLs to embed format
  const getEmbedUrl = (url: string): string => {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    // Loom
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }
    return url;
  };

  // Get icon for CTA button type
  const getButtonIcon = (ctaType: string) => {
    switch (ctaType) {
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4" />;
      case 'callback':
        return <Phone className="h-4 w-4" />;
      case 'calendar':
        return <Calendar className="h-4 w-4" />;
      case 'checkout':
        return <ShoppingCart className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  };

  // Handle CTA button click
  const handleButtonClick = (button: ChatButton) => {
    if (button.type === 'whatsapp' && button.action) {
      const whatsappUrl = `https://wa.me/${button.action.replace(/\D/g, '')}`;
      window.open(whatsappUrl, '_blank');
    } else if (button.action) {
      window.open(button.action, '_blank');
    }
    toast.success(`CTA "${button.label}" clicado!`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Chat Window */}
      <div className="lg:col-span-2">
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    {agentConfig?.agent_name || 'Assistente Virtual'}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Simulador de conversa • Teste o comportamento da IA
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearChat}>
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Simulador de Chat</p>
                  <p className="text-sm">
                    Faça perguntas como se fosse um visitante do seu site.
                    <br />A IA responderá usando o conhecimento do Cérebro do Produto.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] space-y-2`}>
                    {/* Text content */}
                    {message.content && (
                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    )}
                    
                    {/* Video embed */}
                    {message.video_url && (
                      <div className="rounded-xl overflow-hidden border bg-card">
                        <div className="aspect-video">
                          <iframe
                            src={getEmbedUrl(message.video_url)}
                            className="w-full h-full"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          />
                        </div>
                        <div className="p-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Video className="h-3 w-3" /> Vídeo de apresentação
                          </span>
                          <a 
                            href={message.video_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            Abrir <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    )}
                    
                    {/* CTA Buttons */}
                    {message.buttons && message.buttons.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {message.buttons.map((button) => (
                          <button
                            key={button.id}
                            onClick={() => handleButtonClick(button)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              button.style === 'primary'
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            {getButtonIcon(button.cta_type)}
                            {button.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-muted rounded-2xl px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite uma mensagem de teste..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={isLoading}
              />
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Info Sidebar */}
      <div className="space-y-4">
        {/* Product Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Cérebro do Produto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium text-sm">{product?.name || 'Produto'}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {product?.short_description || product?.description || 'Sem descrição'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Fontes de conhecimento:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <HelpCircle className="h-4 w-4 text-blue-500" />
                  <span>{sourcesByType.faq} FAQs</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <Globe className="h-4 w-4 text-green-500" />
                  <span>{sourcesByType.website} Sites</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <Video className="h-4 w-4 text-red-500" />
                  <span>{sourcesByType.youtube} Vídeos</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <FileText className="h-4 w-4 text-yellow-500" />
                  <span>{sourcesByType.file} Arquivos</span>
                </div>
              </div>
            </div>

            {activeSources.length === 0 && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-xs text-warning-foreground">
                  ⚠️ Nenhuma fonte de conhecimento ativa. A IA terá respostas limitadas.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Configuração Atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Personalidade</span>
              <Badge variant="outline">
                {agentConfig?.persona_style === 'friendly' && '😊 Amigável'}
                {agentConfig?.persona_style === 'professional' && '👔 Profissional'}
                {agentConfig?.persona_style === 'casual' && '😎 Casual'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temperatura</span>
              <span>{(agentConfig?.temperature ?? 0.7).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Tokens</span>
              <span>{agentConfig?.max_tokens ?? 500}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cérebro Ativo</span>
              <Badge variant={agentConfig?.use_product_brain ? 'default' : 'secondary'}>
                {agentConfig?.use_product_brain ? 'Sim' : 'Não'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">💡 Dicas de Teste</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>• Pergunte sobre preços, funcionalidades e diferenciais</p>
            <p>• Teste objeções comuns que clientes podem ter</p>
            <p>• Verifique se as respostas estão coerentes</p>
            <p>• Use palavras de transferência para testar handoff</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
