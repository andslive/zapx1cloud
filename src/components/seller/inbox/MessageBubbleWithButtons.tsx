import { format } from 'date-fns';
import { Bot, User, Check, CheckCheck, Clock, AlertCircle, ExternalLink, MessageCircle, Phone, Calendar, ShoppingCart } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatButton {
  id: string;
  label: string;
  type: 'url' | 'whatsapp' | 'callback' | 'calendar';
  action: string;
  style?: 'primary' | 'secondary' | 'outline';
  cta_type?: string;
}

export interface CatalogCardData {
  id: string;
  title: string;
  price?: number | null;
  currency?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  attributes?: Record<string, any>;
}

export interface MessageBubbleWithButtonsProps {
  id: string;
  content: string;
  senderType: 'visitor' | 'agent' | 'bot';
  senderName: string | null;
  createdAt: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  messageType?: 'text' | 'buttons' | 'cta' | 'catalog_card';
  buttons?: ChatButton[];
  catalogItem?: CatalogCardData | null;
  onButtonClick?: (button: ChatButton) => void;
  onCorrectClick?: () => void;
  showCorrectButton?: boolean;
}

function formatCurrency(price?: number | null, currency?: string | null): string {
  if (price == null) return '';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: (currency || 'BRL').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency || 'BRL'} ${price.toFixed(2)}`;
  }
}

const getButtonIcon = (button: ChatButton) => {
  if (button.cta_type === 'checkout') return <ShoppingCart className="h-4 w-4" />;
  if (button.cta_type === 'calendar' || button.type === 'calendar') return <Calendar className="h-4 w-4" />;
  if (button.type === 'whatsapp') return <MessageCircle className="h-4 w-4" />;
  if (button.type === 'callback') return <Phone className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4" />;
};

export function MessageBubbleWithButtons({
  content,
  senderType,
  senderName,
  createdAt,
  status = 'sent',
  showAvatar = true,
  isFirstInGroup = true,
  isLastInGroup = true,
  messageType = 'text',
  buttons,
  catalogItem,
  onButtonClick,
  onCorrectClick,
  showCorrectButton,
}: MessageBubbleWithButtonsProps) {
  const isVisitor = senderType === 'visitor';
  const isBot = senderType === 'bot';
  
  const StatusIcon = () => {
    if (isVisitor) return null;
    
    switch (status) {
      case 'sending':
        return <Clock className="h-3 w-3 opacity-50" />;
      case 'sent':
        return <Check className="h-3 w-3 opacity-70" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 opacity-70" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  const handleButtonClick = (button: ChatButton) => {
    if (onButtonClick) {
      onButtonClick(button);
      return;
    }

    // Default handlers
    if (button.type === 'url') {
      window.open(button.action, '_blank');
    } else if (button.type === 'whatsapp') {
      const message = encodeURIComponent('Olá! Vim do chat do site.');
      window.open(`https://wa.me/${button.action}?text=${message}`, '_blank');
    } else if (button.type === 'calendar') {
      window.open(button.action, '_blank');
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2",
        isVisitor ? "justify-start" : "justify-end",
        !isLastInGroup && "mb-0.5",
        isLastInGroup && "mb-3"
      )}
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

      {/* Message Content */}
      <div className="max-w-[70%] space-y-2">
        <div
          className={cn(
            "px-4 py-2.5 transition-all",
            isVisitor
              ? cn(
                  "bg-muted text-foreground",
                  isFirstInGroup && isLastInGroup && "rounded-2xl rounded-bl-md",
                  isFirstInGroup && !isLastInGroup && "rounded-2xl rounded-bl-md rounded-br-md",
                  !isFirstInGroup && isLastInGroup && "rounded-2xl rounded-tl-md rounded-bl-md",
                  !isFirstInGroup && !isLastInGroup && "rounded-xl"
                )
              : isBot
              ? cn(
                  "bg-secondary text-secondary-foreground",
                  "rounded-2xl rounded-br-md"
                )
              : cn(
                  "bg-primary text-primary-foreground shadow-sm",
                  "rounded-2xl rounded-br-md"
                )
          )}
        >
          {/* Sender name for non-visitor messages */}
          {!isVisitor && isFirstInGroup && (
            <p className="text-[10px] opacity-70 mb-1 font-medium">
              {isBot ? '🤖 Agente IA' : senderName || 'Você'}
            </p>
          )}

          {/* Message text */}
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{content}</p>

          {/* Time and status */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isVisitor ? "justify-start" : "justify-end"
            )}
          >
            <span
              className={cn(
                "text-[10px]",
                isVisitor ? "text-muted-foreground" : "opacity-70"
              )}
            >
              {format(new Date(createdAt), 'HH:mm')}
            </span>
            <StatusIcon />
          </div>
        </div>

        {/* Catalog Card */}
        {messageType === 'catalog_card' && catalogItem && (
          <div className="rounded-2xl overflow-hidden border bg-card shadow-sm max-w-sm">
            {catalogItem.thumbnail_url && (
              <img
                src={catalogItem.thumbnail_url}
                alt={catalogItem.title}
                className="w-full h-40 object-cover"
                loading="lazy"
              />
            )}
            <div className="p-3 space-y-2">
              <h4 className="font-semibold text-sm leading-tight text-foreground">
                {catalogItem.title}
              </h4>
              {catalogItem.price != null && (
                <p className="text-base font-bold text-primary">
                  {formatCurrency(catalogItem.price, catalogItem.currency)}
                </p>
              )}
              {catalogItem.url && (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => window.open(catalogItem.url!, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver detalhes
                </Button>
              )}
            </div>
          </div>
        )}

        {/* CTA Buttons */}
        {(messageType === 'buttons' || messageType === 'cta') && buttons && buttons.length > 0 && (
          <div className="space-y-2 pl-4">
            {buttons.map((button) => (
              <Button
                key={button.id}
                variant={button.style === 'primary' ? 'default' : 'outline'}
                className={cn(
                  "w-full justify-start gap-2",
                  button.style === 'primary' && "bg-primary hover:bg-primary/90"
                )}
                size="sm"
                onClick={() => handleButtonClick(button)}
              >
                {getButtonIcon(button)}
                {button.label}
              </Button>
            ))}
          </div>
        )}

        {/* Correct button for bot messages */}
        {showCorrectButton && isBot && (
          <div className="pl-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-primary"
              onClick={onCorrectClick}
            >
              ✏️ Sugerir correção
            </Button>
          </div>
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
    </div>
  );
}
