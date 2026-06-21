import { useLeadTimeline } from '@/hooks/useInteractions';
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  ArrowRight,
  Send,
  Instagram,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LeadTimelineProps {
  leadId: string;
  maxHeight?: string;
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  telegram: <Send className="h-4 w-4" />,
  other: <MessageSquare className="h-4 w-4" />,
};

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  phone: 'Ligação',
  instagram: 'Instagram',
  telegram: 'Telegram',
  other: 'Outro',
};

export function LeadTimeline({ leadId, maxHeight = "400px" }: LeadTimelineProps) {
  const { data: timeline, isLoading } = useLeadTimeline(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!timeline?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma interação registrada</p>
        <p className="text-xs mt-1">Adicione notas ou registre contatos</p>
      </div>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="pr-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
        
        <div className="space-y-4">
          {timeline.map((item, index) => (
            <div key={item.id} className="relative flex gap-4 pl-10">
              {/* Timeline dot */}
              <div 
                className={cn(
                  "absolute left-2 top-2 h-4 w-4 rounded-full border-2 border-background",
                  item.type === 'stage_change' 
                    ? 'bg-primary' 
                    : 'bg-muted'
                )}
                style={item.type === 'stage_change' ? { backgroundColor: item.stageColor } : undefined}
              />
              
              <div className="flex-1 min-w-0">
                {item.type === 'stage_change' ? (
                  <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-2 text-sm">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      <span className="text-foreground font-medium">
                        Movido para
                      </span>
                      <Badge 
                        variant="secondary" 
                        style={{ 
                          backgroundColor: `${item.stageColor}20`,
                          color: item.stageColor,
                          borderColor: item.stageColor
                        }}
                        className="border"
                      >
                        {item.stageName}
                      </Badge>
                    </div>
                    {item.daysInStage && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Ficou {item.daysInStage} dia(s) no stage anterior
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center",
                          item.direction === 'inbound' 
                            ? "bg-green-500/10 text-green-500" 
                            : "bg-blue-500/10 text-blue-500"
                        )}>
                          {channelIcons[item.channel]}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {channelLabels[item.channel]}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {item.direction === 'inbound' ? 'Recebido' : 'Enviado'}
                        </Badge>
                      </div>
                      {item.cadenceDay && (
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                          Dia {item.cadenceDay}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {item.content}
                    </p>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(item.timestamp), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
