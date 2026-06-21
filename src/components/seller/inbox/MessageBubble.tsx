import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import {
  Bot, User, Check, CheckCheck, Clock, AlertCircle,
  MoreHorizontal, Pencil, Trash2, Reply, Forward, Star, X,
  Ban, CreditCard, Copy, CheckCircle2
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';


import { formatWhatsAppText, formatMessageTime, formatSenderLabel, parseMessageContent } from '@/lib/messageFormat';
import { extractMedia } from '@/lib/messageMedia';
import { MediaAttachment } from '@/components/seller/inbox/MediaAttachment';
import { ReactionPicker, ReactionList } from '@/components/seller/inbox/MessageReactions';
import type { ReactionSummary } from '@/hooks/useMessageReactions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  id: string;
  content: string;
  senderType: 'visitor' | 'agent' | 'bot';
  senderName: string | null;
  createdAt: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isDeleted?: boolean;
  editedAt?: string | null;
  isStarred?: boolean;
  forwardedFrom?: boolean;
  replyTo?: { id: string; content: string; sender_type: string } | null;
  onReply?: (messageId: string, content: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onStar?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  currentUserId?: string;
  senderId?: string | null;
  metadata?: any;
  reactions?: ReactionSummary[];
  onReact?: (messageId: string, emoji: string) => void;
}

export function MessageBubble({
  id,
  content,
  senderType,
  senderName,
  createdAt,
  status = 'sent',
  showAvatar = true,
  isFirstInGroup = true,
  isLastInGroup = true,
  isDeleted = false,
  editedAt,
  isStarred = false,
  forwardedFrom = false,
  replyTo,
  onReply,
  onEdit,
  onDelete,
  onStar,
  onForward,
  currentUserId,
  senderId,
  metadata,
  reactions = [],
  onReact,
}: MessageBubbleProps) {
  const isVisitor = senderType === 'visitor';
  const isBot = senderType === 'bot';
  const isOwnMessage = senderType === 'agent' && senderId === currentUserId;
  const parsedContent = useMemo(() => parseMessageContent(content), [content]);
  const media = useMemo(() => extractMedia(metadata, content), [metadata, content]);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(parsedContent);
  const [showActions, setShowActions] = useState(false);


  // Deriva status real considerando metadata.delivery_status (mensagens WhatsApp falhas)
  const deliveryStatus = (metadata as any)?.delivery_status as string | undefined;
  const deliveryError = (metadata as any)?.error as string | undefined;
  const effectiveStatus = (deliveryStatus === 'failed' || status === 'failed') ? 'failed' : status;


  const StatusIcon = () => {
    // Para mensagens do visitante, não mostramos ícones de status (✓ ou ✓✓)
    if (isVisitor) {
      return null;
    }

    if (effectiveStatus === 'failed') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex"><AlertCircle className="h-3.5 w-3.5 text-destructive" /></span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs font-medium">Falha ao enviar</p>
              {deliveryError && <p className="text-xs opacity-80 mt-1">{deliveryError}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    switch (effectiveStatus) {
      case 'sending':
        return <Clock className="h-3 w-3 opacity-50 animate-pulse" />;
      case 'sent':
        return <Check className="h-3 w-3 opacity-60" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 opacity-60" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-sky-400" />;
      default:
        return <Check className="h-3 w-3 opacity-60" />;
    }
  };

  const handleEditSave = () => {
    if (editContent.trim() && editContent !== content) {
      onEdit?.(id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const hasActions = onReply || onEdit || onDelete || onStar || onForward || onReact;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        "flex min-w-0 gap-2 group relative",
        isVisitor ? "justify-start" : "justify-end",
        !isLastInGroup && "mb-0.5",
        isLastInGroup && "mb-3"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Visitor Avatar */}
      {isVisitor && showAvatar && (
        <div className="w-8 flex-shrink-0">
          {isLastInGroup && (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      {/* Action buttons - positioned outside the bubble */}
      {hasActions && !isDeleted && !isEditing && (
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-150",
          showActions ? "opacity-100" : "opacity-0",
          isVisitor ? "order-last" : "order-first"
        )}>
          {onReact && (
            <ReactionPicker
              align={isVisitor ? 'start' : 'end'}
              onPick={(emoji) => onReact(id, emoji)}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-background border border-border shadow-sm">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isVisitor ? "start" : "end"} className="w-44">
              {onReply && (
                <DropdownMenuItem onClick={() => onReply(id, content)}>
                  <Reply className="h-4 w-4 mr-2" />
                  Responder
                </DropdownMenuItem>
              )}
              {onForward && (
                <DropdownMenuItem onClick={() => onForward(id)}>
                  <Forward className="h-4 w-4 mr-2" />
                  Encaminhar
                </DropdownMenuItem>
              )}
              {onStar && (
                <DropdownMenuItem onClick={() => onStar(id)}>
                  <Star className={cn("h-4 w-4 mr-2", isStarred && "fill-yellow-400 text-yellow-400")} />
                  {isStarred ? 'Desfavoritar' : 'Favoritar'}
                </DropdownMenuItem>
              )}
              {isOwnMessage && onEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setIsEditing(true); setEditContent(content); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                </>
              )}
              {!isVisitor && onDelete && (
                <DropdownMenuItem onClick={() => onDelete(id)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[min(75%,42rem)] min-w-0 px-3 py-2 transition-all relative overflow-hidden shadow-sm",
          isVisitor
            ? cn(
                "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300/50 dark:border-zinc-700/50",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-bl-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-bl-md rounded-br-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tl-md rounded-bl-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )
            : isBot
            ? cn(
                "bg-emerald-100 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-50 border border-emerald-200/50 dark:border-emerald-800/50",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-br-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-br-md rounded-bl-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tr-md rounded-br-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )
            : cn(
                // Verde WhatsApp (#DCF8C6) ou variante dark
                "bg-[#DCF8C6] dark:bg-emerald-900 text-zinc-900 dark:text-emerald-50 border border-[#c5e4ae] dark:border-emerald-800/50",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-br-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-br-md rounded-bl-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tr-md rounded-br-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )


        )}
      >
        {/* Star indicator */}
        {isStarred && (
          <Star className="absolute -top-1 -right-1 h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        )}

        {/* Forwarded label */}
        {forwardedFrom && !isDeleted && (
          <p className="text-[10px] opacity-60 mb-1 flex items-center gap-1">
            <Forward className="h-3 w-3" />
            Encaminhada
          </p>
        )}

        {/* Sender name (oculto quando for a própria mensagem do agente — reduz ruído visual) */}
        {!isVisitor && isFirstInGroup && !isDeleted && !isOwnMessage && (
          <p className="text-[10px] opacity-70 mb-1 font-medium">
            {formatSenderLabel({
              senderType,
              senderName,
              isOwnMessage,
              agentName: senderName,
              metadata,
            })}

          </p>
        )}

        {/* Reply preview */}
        {replyTo && !isDeleted && (
          <div className={cn(
            "text-[11px] mb-1.5 px-2 py-1 rounded border-l-2 truncate",
            isVisitor
              ? "bg-muted/60 border-muted-foreground/30 text-muted-foreground"
              : "bg-primary/10 border-primary/40 text-foreground/80"
          )}>
            <span className="font-medium block text-[10px]">
              {replyTo.sender_type === 'visitor' ? '👤 Visitante' : replyTo.sender_type === 'bot' ? '🤖 Bot' : '💬 Agente'}
            </span>
            <span className="line-clamp-1">{parseMessageContent(replyTo.content)}</span>
          </div>
        )}

        {/* Message text or deleted state */}
        {isDeleted ? (
          <p className="text-sm italic opacity-60 flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Mensagem apagada
          </p>
        ) : isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] text-sm bg-background text-foreground resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEditSave();
                }
                if (e.key === 'Escape') handleEditCancel();
              }}
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={handleEditCancel}>
                <X className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-xs px-2" onClick={handleEditSave}>
                <Check className="h-3 w-3 mr-1" />
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {media && (
              <div className={cn(parsedContent && parsedContent.trim() ? 'mb-2' : '')}>
                <MediaAttachment media={media} isOwn={!isVisitor && !isBot} />
              </div>
            )}
            
            {/* Visual para InteractiveMessage (Botão PIX) */}
            {metadata?.InteractiveMessage || metadata?.message?.interactiveMessage || (content && content.includes('InteractiveMessage')) ? (
              <InteractiveMessageCard content={content} metadata={metadata} isVisitor={isVisitor} />
            ) : null}

            {parsedContent && parsedContent.trim() && !(media && media.caption === parsedContent) && (
              <MessageMarkdown content={parsedContent} isVisitor={isVisitor} />
            )}
          </>
        )}


        {/* Time and status */}
        {!isEditing && (
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isVisitor ? "justify-start" : "justify-end"
            )}
          >
            <span className="text-[10px] text-muted-foreground/80">
              {formatMessageTime(createdAt, 'bubble')}
            </span>
            {editedAt && !isDeleted && (
              <span className="text-[10px] text-muted-foreground/70">
                (editada)
              </span>
            )}
            <StatusIcon />
          </div>
        )}

        {/* Reactions */}
        {!isDeleted && reactions.length > 0 && onReact && (
          <ReactionList
            reactions={reactions}
            onToggle={(emoji) => onReact(id, emoji)}
            isVisitor={isVisitor}
          />
        )}
      </div>

      {/* Agent/Bot Avatar */}
      {!isVisitor && showAvatar && (
        <div className="w-8 flex-shrink-0">
          {isLastInGroup && (
            <Avatar className="h-8 w-8">
              <AvatarFallback
                className={cn(
                  "text-xs",
                  isBot ? "bg-secondary" : "bg-primary text-primary-foreground"
                )}
              >
                {isBot ? <Bot className="h-4 w-4" /> : senderName?.charAt(0) || 'A'}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Renderiza um card visual para mensagens interativas (ex: Botão PIX).
 */
function InteractiveMessageCard({ content, metadata, isVisitor }: { content: string; metadata: any; isVisitor: boolean }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  
  const data = useMemo(() => {
    try {
      const parsed = (metadata?.InteractiveMessage || metadata?.message?.interactiveMessage) 
        ? (metadata?.InteractiveMessage || metadata?.message?.interactiveMessage)
        : JSON.parse(content || '{}').InteractiveMessage || JSON.parse(content || '{}').message?.interactiveMessage;
        
      if (!parsed) return null;
      
      const flow = parsed.NativeFlowMessage || parsed.nativeFlowMessage;
      const button = flow?.buttons?.find((b: any) => b.name === 'payment_info');
      
      if (button?.buttonParamsJSON) {
        return JSON.parse(button.buttonParamsJSON);
      }
      return null;
    } catch (e) {
      return null;
    }
  }, [content, metadata]);

  if (!data) return null;

  const pixInfo = data.payment_settings?.find((s: any) => s.type === 'pix_static_code')?.pix_static_code;
  const amount = data.total_amount?.value / Math.pow(10, data.total_amount?.offset || 0);

  const handleCopy = () => {
    if (pixInfo?.key) {
      navigator.clipboard.writeText(pixInfo.key);
      setCopied(true);
      toast({ title: "Chave PIX copiada!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn(
      "my-2 p-3 rounded-xl border flex flex-col gap-3 shadow-sm",
      isVisitor ? "bg-white border-border" : "bg-primary/5 border-primary/20"
    )}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-600">Pagamento PIX</p>
          <p className="text-[11px] opacity-70">Solicitação de pagamento recebida</p>
        </div>
      </div>
      
      <div className="bg-background/50 rounded-lg p-2 space-y-1.5 border border-border/40">
        {(amount || 0) > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="opacity-70">Valor:</span>
            <span className="font-bold">R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        {pixInfo?.merchant_name && (
          <div className="flex justify-between items-center text-xs">
            <span className="opacity-70">Beneficiário:</span>
            <span className="font-medium">{pixInfo.merchant_name}</span>
          </div>
        )}
        {pixInfo?.key && (
          <div className="pt-2">
            <p className="text-[10px] opacity-60 mb-1">Chave PIX ({pixInfo.key_type}):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-muted px-2 py-1 rounded truncate font-mono">
                {pixInfo.key}
              </code>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renderiza conteúdo da mensagem com formatação WhatsApp -> Markdown.
 * Restringe os elementos permitidos para evitar HTML arbitrário.
 */
function MessageMarkdown({ content, isVisitor }: { content: string; isVisitor: boolean }) {

  const formatted = useMemo(() => formatWhatsAppText(content), [content]);
  const linkClass = 'underline decoration-primary/50 hover:decoration-primary text-primary';

  return (
    <div className="text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        allowedElements={['p', 'strong', 'em', 'del', 'code', 'a', 'ul', 'ol', 'li', 'br', 'pre']}
        unwrapDisallowed
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('break-all', linkClass)}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded text-[12px] font-mono bg-foreground/10">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-2 rounded my-1 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap bg-foreground/10">
              {children}
            </pre>
          ),
        }}
      >
        {formatted}
      </ReactMarkdown>
    </div>
  );
}
