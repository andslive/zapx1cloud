import { Globe, MessageCircle, Instagram, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelBadgeProps {
  channel: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const channelConfig: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  webchat: { icon: Globe, label: 'Site', color: 'text-blue-500' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', color: 'text-green-500' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-pink-500' },
  email: { icon: Mail, label: 'Email', color: 'text-muted-foreground' },
  sms: { icon: Phone, label: 'SMS', color: 'text-purple-500' },
};

export function ChannelBadge({ channel, size = 'md', showLabel = false }: ChannelBadgeProps) {
  const config = channelConfig[channel] || channelConfig.webchat;
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className={cn("flex items-center gap-1", config.color)}>
      <Icon className={sizeClasses[size]} />
      {showLabel && (
        <span className="text-xs font-medium">{config.label}</span>
      )}
    </div>
  );
}
