import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ChatTypingIndicatorProps {
  primaryColor: string;
  agentAvatar?: string | null;
  agentName?: string;
}

export function ChatTypingIndicator({
  primaryColor,
  agentAvatar,
  agentName = 'Assistente',
}: ChatTypingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-2"
    >
      <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white shadow-md">
        {agentAvatar ? (
          <AvatarImage src={agentAvatar} alt={agentName} />
        ) : null}
        <AvatarFallback style={{ backgroundColor: primaryColor, color: 'white' }}>
          {agentName.charAt(0)}
        </AvatarFallback>
      </Avatar>

      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center"
        style={{ backgroundColor: primaryColor }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-2 h-2 rounded-full bg-white/70"
            animate={{ y: [0, -5, 0] }}
            transition={{
              repeat: Infinity,
              duration: 0.6,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
