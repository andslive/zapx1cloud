import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles,
  Lightbulb,
  Copy,
  Check,
  Mic,
  ImagePlus,
  X,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { AudioWaveform } from './AudioWaveform';
import ReactMarkdown from 'react-markdown';

interface AIChatProps {
  productName: string;
  productId?: string;
}

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | MessageContent[];
  suggestions?: string[];
  imagePreview?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-copilot`;

const initialSuggestions = [
  "O lead disse que está caro. Me dá 3 respostas",
  "Qual a melhor pergunta pra qualificar agora?",
  "Ele pediu preço cedo, como voltar pro valor?",
  "Gera um script de follow-up",
  "Simula uma negociação comigo"
];

export function AIChat({ productName, productId }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Olá! 👋 Sou o assistente de vendas do **${productName}**.\n\nEstou aqui para te ajudar com:\n- Respostas para objeções\n- Sugestões de próxima ação\n- Geração de mensagens e scripts\n- Roleplay e simulações\n\nComo posso te ajudar agora?`,
      suggestions: initialSuggestions
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  
  const { isRecording, isTranscribing, stream, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setSelectedImageFile(file);
    };
    reader.readAsDataURL(file);
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleConfirmRecording = async () => {
    const transcribedText = await stopRecording();
    if (transcribedText) {
      setInput(prev => prev ? `${prev} ${transcribedText}` : transcribedText);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  const streamChat = async (userMessages: { role: string; content: string }[]) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ 
        messages: userMessages,
        productId,
        productName
      }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      
      if (resp.status === 429) {
        throw new Error(errorData.error || "Limite de requisições excedido. Aguarde um momento.");
      }
      if (resp.status === 402) {
        throw new Error(errorData.error || "Créditos de IA esgotados.");
      }
      throw new Error(errorData.error || "Erro ao processar requisição");
    }

    if (!resp.body) throw new Error("Sem resposta do servidor");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;
    let fullContent = "";

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            fullContent += content;
            // Update the last assistant message with new content
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.id.startsWith("stream-")) {
                return prev.map((m, i) => 
                  i === prev.length - 1 ? { ...m, content: fullContent } : m
                );
              }
              return [...prev, { 
                id: `stream-${Date.now()}`, 
                role: "assistant", 
                content: fullContent 
              }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            fullContent += content;
          }
        } catch { /* ignore */ }
      }
    }

    // Add suggestions to the final message
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) => 
          i === prev.length - 1 
            ? { 
                ...m, 
                content: fullContent,
                suggestions: [
                  "Me dá mais opções",
                  "Adapta pra WhatsApp",
                  "Qual material devo enviar?",
                  "E se ele disser que vai pensar?"
                ]
              } 
            : m
        );
      }
      return prev;
    });
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input;
    if ((!messageText.trim() && !selectedImage) || isLoading) return;

    // Build user message content
    let userContent: string | MessageContent[] = messageText;
    let imagePreview: string | undefined = undefined;
    
    if (selectedImage) {
      imagePreview = selectedImage;
      userContent = [
        { type: 'text', text: messageText || 'Analise esta imagem e me dê um feedback estratégico para a venda.' },
        { type: 'image_url', image_url: { url: selectedImage } }
      ];
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      imagePreview,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    removeSelectedImage();
    setIsLoading(true);

    try {
      // Build message history for context
      const apiMessages = messages
        .filter(m => m.id !== '1') // Skip initial greeting
        .map(m => {
          // Convert content to API format
          if (typeof m.content === 'string') {
            return { role: m.role, content: m.content };
          }
          return { role: m.role, content: m.content };
        });
      
      // Add current message
      if (selectedImage) {
        apiMessages.push({ 
          role: 'user', 
          content: userContent as MessageContent[]
        });
      } else {
        apiMessages.push({ role: 'user', content: messageText });
      }

      await streamChat(apiMessages as any);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar mensagem';
      toast.error(errorMessage);
      
      // Add error message to chat
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errorMessage}\n\nTente novamente ou reformule sua pergunta.`,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getTextContent = (content: string | MessageContent[]): string => {
    if (typeof content === 'string') return content;
    const textPart = content.find(c => c.type === 'text');
    return textPart?.text || '';
  };

  const handleCopy = async (content: string | MessageContent[], id: string) => {
    const text = getTextContent(content);
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Resposta copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={cn(
      "flex flex-col animate-fade-in",
      isMobile ? "h-[calc(100vh-13rem)]" : "h-[calc(100vh-8rem)]"
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border flex-shrink-0">
        <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
          <Bot size={20} className="text-primary-foreground" />
        </div>
        <div>
          <h2 className={cn("font-semibold text-foreground", isMobile ? "text-base" : "text-lg")}>IA do {productName}</h2>
          <p className="text-sm text-muted-foreground">Seu copiloto de vendas</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.map((message) => (
          <div 
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === 'user' ? "flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
              message.role === 'user' 
                ? "bg-primary/20" 
                : "gradient-primary"
            )}>
              {message.role === 'user' 
                ? <User size={16} className="text-primary" />
                : <Sparkles size={16} className="text-primary-foreground" />
              }
            </div>
            <div className={cn(
              "flex-1 space-y-2",
              message.role === 'user' ? "flex flex-col items-end" : ""
            )}>
              <div className={cn(
                "p-4 rounded-xl",
                isMobile ? "max-w-[90%]" : "max-w-[85%]",
                message.role === 'user'
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}>
                {/* Image preview for user messages */}
                {message.imagePreview && (
                  <div className="mb-3">
                    <img 
                      src={message.imagePreview} 
                      alt="Imagem anexada" 
                      className="rounded-lg max-h-48 object-contain"
                    />
                  </div>
                )}
                {message.role === 'assistant' ? (
                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{getTextContent(message.content)}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {getTextContent(message.content)}
                  </p>
                )}
              </div>
              
              {message.role === 'assistant' && !message.id.startsWith('error-') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(message.content, message.id)}
                  className="text-muted-foreground"
                >
                  {copiedId === message.id ? (
                    <Check size={14} className="mr-1" />
                  ) : (
                    <Copy size={14} className="mr-1" />
                  )}
                  Copiar
                </Button>
              )}

              {/* Suggestions */}
              {message.suggestions && message.role === 'assistant' && !isLoading && (
                <div className={cn(
                  "flex flex-wrap gap-2 mt-2",
                  isMobile && "overflow-x-auto -mx-2 px-2 pb-2 scrollbar-hide"
                )}>
                  {message.suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(suggestion)}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors",
                        isMobile && "flex-shrink-0 whitespace-nowrap"
                      )}
                    >
                      <Lightbulb size={12} className="inline mr-1" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles size={16} className="text-primary-foreground animate-pulse" />
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-border flex-shrink-0 space-y-3">
        {/* Image preview */}
        {selectedImage && (
          <div className="relative inline-block">
            <img 
              src={selectedImage} 
              alt="Preview" 
              className="h-20 rounded-lg object-cover"
            />
            <button
              onClick={removeSelectedImage}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
            >
              <X size={14} />
            </button>
          </div>
        )}
        
        {/* Transcribing indicator */}
        {isTranscribing && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 size={14} className="animate-spin" />
            Transcrevendo áudio...
          </div>
        )}

        {/* Recording UI - ChatGPT Style */}
        {isRecording ? (
          <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
            {/* Cancel Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancelRecording}
              className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
              title="Cancelar gravação"
            >
              <X size={20} />
            </Button>
            
            {/* Waveform */}
            <div className="flex-1">
              <AudioWaveform stream={stream} isActive={isRecording} />
            </div>
            
            {/* Confirm Button */}
            <Button
              variant="default"
              size="icon"
              onClick={handleConfirmRecording}
              className="h-10 w-10 rounded-full"
              title="Confirmar e transcrever"
            >
              <Check size={20} />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            {/* Image upload button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={cn(isMobile ? "h-11 w-11" : "h-12 w-12")}
              title="Enviar imagem"
            >
              <ImagePlus size={18} />
            </Button>
            
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={isMobile ? "Pergunte algo..." : "O lead disse algo? Cole aqui e pergunte..."}
                className={cn("pr-12 bg-card border-border", isMobile ? "h-11" : "h-12")}
                disabled={isLoading || isTranscribing}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartRecording}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-primary"
                disabled={isLoading || isTranscribing}
                title="Gravar áudio"
              >
                <Mic size={18} />
              </Button>
            </div>
            <Button 
              onClick={() => handleSend()}
              disabled={(!input.trim() && !selectedImage) || isLoading || isTranscribing}
              className={cn(isMobile ? "h-11 px-4" : "h-12 px-6")}
            >
              <Send size={18} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
