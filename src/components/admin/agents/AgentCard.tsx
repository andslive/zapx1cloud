import { memo, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Star, 
  Copy,
  MessageSquare,
  MessageCircle,
  Zap,
  Globe,
  Inbox,
  Headphones,
  Instagram,
  Facebook,
  Smartphone,
  Download,
} from 'lucide-react';
import { ProductAgent, AGENT_TYPE_LABELS, AGENT_TEMPLATES } from '@/types/agents';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface AgentCardProps {
  agent: ProductAgent;
  onEdit: (agent: ProductAgent) => void;
  onDelete: (agent: ProductAgent) => void;
  onSetDefault: (agent: ProductAgent) => void;
  onDuplicate: (agent: ProductAgent) => void;
  onToggleStatus: (agent: ProductAgent, isActive: boolean) => void;
}

const CHANNEL_ICONS = {
  active_in_chat: MessageSquare,
  active_in_funnels: Zap,
  active_in_widget: Globe,
  active_in_inbox: Inbox,
  active_in_copilot: Headphones,
  active_in_whatsapp: MessageCircle,
  active_in_instagram: Instagram,
  active_in_facebook: Facebook,
};

const CHANNEL_LABELS = {
  active_in_chat: 'Chat',
  active_in_funnels: 'Funis',
  active_in_widget: 'Widget',
  active_in_inbox: 'Inbox',
  active_in_copilot: 'Copilot',
  active_in_whatsapp: 'WhatsApp',
  active_in_instagram: 'Instagram',
  active_in_facebook: 'Facebook',
};

export const AgentCard = memo(function AgentCard({
  agent,
  onEdit,
  onDelete,
  onSetDefault,
  onDuplicate,
  onToggleStatus,
}: AgentCardProps) {
  const template = AGENT_TEMPLATES[agent.agent_type];
  const activeChannels = Object.entries(CHANNEL_ICONS).filter(
    ([key]) => agent[key as keyof ProductAgent]
  );

  // Resolve evolution instance name (lazy, only if bound)
  const [instanceLabel, setInstanceLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!agent.evolution_instance_id) {
      setInstanceLabel(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('name, phone_number')
        .eq('id', agent.evolution_instance_id!)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const phone = data.phone_number ? ` · ${data.phone_number}` : '';
        setInstanceLabel(`${data.name}${phone}`);
      }
    })();
    return () => { cancelled = true; };
  }, [agent.evolution_instance_id]);

  return (
    <Card className={cn(
      'group relative transition-all hover:shadow-md',
      !agent.is_active && 'opacity-60'
    )}>
      {agent.is_default && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge className="bg-primary text-primary-foreground shadow-sm">
            <Star className="h-3 w-3 mr-1" />
            Padrão
          </Badge>
        </div>
      )}
      
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar/Icon */}
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
            {template?.icon || '🤖'}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">
                {agent.name}
              </h3>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {AGENT_TYPE_LABELS[agent.agent_type]}
              </Badge>
              <span className={cn(
                'flex items-center gap-1 text-xs',
                agent.is_active ? 'text-success' : 'text-muted-foreground'
              )}>
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  agent.is_active ? 'bg-success' : 'bg-muted-foreground'
                )} />
                {agent.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {/* Description */}
            {agent.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                {agent.description}
              </p>
            )}

            {/* Active Channels */}
            <div className="flex flex-wrap gap-1">
              {/* Aviso silencioso quando o handoff não foi configurado: a transferência sai muda */}
              {!agent.handoff_outgoing_message?.trim() &&
                !agent.handoff_incoming_message?.trim() && (
                  <Badge
                    variant="outline"
                    className="text-xs py-0.5 px-1.5 border-destructive/50 bg-destructive/10 text-destructive"
                    title="Configure mensagens de despedida e apresentação na aba Comportamento"
                  >
                    🔇 Handoff não configurado
                  </Badge>
                )}
              {instanceLabel && (
                <Badge
                  variant="outline"
                  className="text-xs py-0.5 px-1.5 border-primary/40 bg-primary/5 text-primary"
                  title="Conexão WhatsApp dedicada"
                >
                  <Smartphone className="h-3 w-3 mr-1" />
                  {instanceLabel}
                </Badge>
              )}
              {activeChannels.map(([key, Icon]) => (
                <Badge 
                  key={key} 
                  variant="outline" 
                  className="text-xs py-0.5 px-1.5"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {CHANNEL_LABELS[key as keyof typeof CHANNEL_LABELS]}
                </Badge>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Switch
              checked={agent.is_active}
              onCheckedChange={(checked) => onToggleStatus(agent, checked)}
              className="data-[state=checked]:bg-success"
            />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(agent)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(agent)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  // Exporta o agente como JSON limpo (sem ids, datas e org).
                  const STRIP = new Set([
                    'id', 'created_at', 'updated_at', 'organization_id', 'created_by',
                    'is_default',
                  ]);
                  const clean: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(agent as unknown as Record<string, unknown>)) {
                    if (!STRIP.has(k)) clean[k] = v;
                  }
                  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `agente-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar JSON
                </DropdownMenuItem>
                {!agent.is_default && (
                  <DropdownMenuItem onClick={() => onSetDefault(agent)}>
                    <Star className="h-4 w-4 mr-2" />
                    Definir como Padrão
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(agent)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
