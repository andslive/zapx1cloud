import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseMessageContent } from '@/lib/messageFormat';


interface ChatOption {
  id: string;
  label: string;
  emoji?: string;
  next_block_id?: string | null;
}

interface ChatMessageBubbleProps {
  type: 'bot' | 'user' | 'system';
  content: string;
  primaryColor: string;
  agentAvatar?: string | null;
  agentName?: string;
  options?: ChatOption[];
  showOptions?: boolean;
  onOptionClick?: (option: ChatOption) => void;
  className?: string;
}

export function ChatMessageBubble({
  type,
  content,
  primaryColor,
  agentAvatar,
  agentName = 'Assistente',
  options,
  showOptions = false,
  onOptionClick,
  className,
}: ChatMessageBubbleProps) {
  const displayContent = parseMessageContent(content);

  if (type === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center"
      >
        <div className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs">
          {displayContent}
        </div>
      </motion.div>
    );
  }


  const isBot = type === 'bot';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'flex gap-2',
        isBot ? 'justify-start' : 'justify-end',
        className
      )}
    >
      {/* Bot Avatar */}
      {isBot && (
        <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white shadow-md">
          {agentAvatar ? (
            <AvatarImage src={agentAvatar} alt={agentName} />
          ) : null}
          <AvatarFallback style={{ backgroundColor: primaryColor, color: 'white' }}>
            {agentName.charAt(0)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn('max-w-[80%] space-y-2', isBot ? '' : 'items-end')}>
        {/* Message Bubble */}
        <div
          className={cn(
            'p-3 rounded-2xl shadow-sm',
            isBot ? 'rounded-bl-sm' : 'rounded-br-sm'
          )}
          style={{
            backgroundColor: isBot ? primaryColor : '#f1f5f9',
            color: isBot ? 'white' : '#1e293b',
          }}
        >
          {isBot ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="text-sm leading-relaxed">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold">{children}</strong>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline opacity-90 hover:opacity-100"
                  >
                    {children}
                  </a>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside text-sm mt-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside text-sm mt-1">{children}</ol>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          ) : (
            <p className="text-sm">{displayContent}</p>
          )}

        </div>

        {/* Options Buttons (Grid Layout) */}
        {isBot && options && showOptions && (
          <div
            className={cn(
              'grid gap-2 mt-2',
              options.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'
            )}
          >
            {options.map((option) => (
              <motion.button
                key={option.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOptionClick?.(option)}
                className={cn(
                  'p-3 rounded-xl text-left transition-all',
                  'border hover:shadow-md',
                  'text-sm font-medium'
                )}
                style={{
                  borderColor: `${primaryColor}40`,
                  backgroundColor: `${primaryColor}08`,
                  color: primaryColor,
                }}
              >
                {option.emoji && <span className="mr-2">{option.emoji}</span>}
                {option.label}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {!isBot && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
            Eu
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}
