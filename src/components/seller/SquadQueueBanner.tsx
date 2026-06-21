import { useState } from 'react';
import { useMySquadQueue, useAssumeNextLead, useAssumeSpecificLead } from '@/hooks/useLeadQueue';
import { useUserStatus } from '@/hooks/useUserStatus';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Bell, 
  Users, 
  UserCheck, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  Flame,
  ThermometerSun,
  Snowflake,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SquadQueueBannerProps {
  productId: string;
}

export function SquadQueueBanner({ productId }: SquadQueueBannerProps) {
  const { data: queue, isLoading } = useMySquadQueue();
  const { status } = useUserStatus();
  const assumeNext = useAssumeNextLead();
  const assumeSpecific = useAssumeSpecificLead();
  const [expanded, setExpanded] = useState(false);

  const pendingLeads = queue?.filter(item => item.status === 'pending') || [];

  const getTemperatureIcon = (temp: string | null) => {
    switch (temp) {
      case 'hot': return <Flame size={12} className="text-destructive" />;
      case 'warm': return <ThermometerSun size={12} className="text-warning" />;
      case 'cold': return <Snowflake size={12} className="text-primary" />;
      default: return null;
    }
  };

  // Don't show if no pending leads
  if (isLoading || pendingLeads.length === 0) return null;

  return (
    <div className="mb-4 animate-fade-in">
      {/* Main banner */}
      <div className={cn(
        "rounded-xl border border-primary/30 overflow-hidden",
        "bg-primary/5",
      )}>
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                <Users size={18} className="text-primary" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {pendingLeads.length}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {pendingLeads.length === 1
                  ? '1 lead aguardando atendimento'
                  : `${pendingLeads.length} leads aguardando no squad`}
              </p>
              <p className="text-xs text-muted-foreground">
                {status !== 'online' ? '⚠️ Fique Online para receber automaticamente' : 'Assuma um lead agora'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => assumeNext.mutate()}
              disabled={assumeNext.isPending}
              className="gap-1.5"
            >
              {assumeNext.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserCheck size={14} />
              )}
              Assumir próximo
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
        </div>

        {/* Expanded list */}
        {expanded && (
          <div className="border-t border-border/50 divide-y divide-border/30">
            {pendingLeads.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
                    {item.lead?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
                        {item.lead?.name || 'Lead sem nome'}
                      </span>
                      {getTemperatureIcon(item.lead?.temperature || null)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={10} />
                      <span>
                        {formatDistanceToNow(new Date(item.queued_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      {item.lead?.email && (
                        <span className="truncate max-w-[120px]">· {item.lead.email}</span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 flex-shrink-0"
                  onClick={() =>
                    assumeSpecific.mutate({ leadId: item.lead_id, queueId: item.id })
                  }
                  disabled={assumeSpecific.isPending}
                >
                  <UserCheck size={12} />
                  Assumir
                </Button>
              </div>
            ))}

            {pendingLeads.length > 10 && (
              <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                +{pendingLeads.length - 10} leads na fila
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
