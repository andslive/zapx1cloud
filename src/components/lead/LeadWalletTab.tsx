import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  User, 
  Users, 
  ArrowRight, 
  Clock,
  UserX,
  RefreshCw
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadTransferHistory } from '@/hooks/useLeadTransfer';
import { LeadTransferModal } from './LeadTransferModal';
import { RoleAssignmentCard } from './RoleAssignmentCard';
import { Loader2 } from 'lucide-react';

interface ProfileInfo {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  email?: string;
}

interface LeadWalletTabProps {
  lead: {
    id: string;
    name: string;
    assigned_to?: string | null;
    squad_id?: string | null;
    transferred_at?: string | null;
    product_id?: string | null;
    organization_id: string;
    sdr_id?: string | null;
    closer_id?: string | null;
  };
  assignee?: ProfileInfo | null;
  squad?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  sdr?: ProfileInfo | null;
  closer?: ProfileInfo | null;
  isAdmin?: boolean;
  onTransferSuccess?: () => void;
  onUpdateLead?: (updates: Record<string, any>) => Promise<void>;
  teamMembers?: ProfileInfo[];
}

export function LeadWalletTab({ lead, assignee, squad, sdr, closer, isAdmin = false, onTransferSuccess, onUpdateLead, teamMembers = [] }: LeadWalletTabProps) {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const { data: transferHistory, isLoading } = useLeadTransferHistory(lead.id);

  return (
    <div className="space-y-4">
      {/* Current assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Responsável Atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {assignee ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={assignee.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {assignee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{assignee.full_name}</p>
                  {assignee.email && (
                    <p className="text-sm text-muted-foreground">{assignee.email}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-amber-500">
                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Sem Atendimento</p>
                  <p className="text-sm text-muted-foreground">Lead aguardando distribuição</p>
                </div>
              </div>
            )}
            
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsTransferModalOpen(true)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Transferir
              </Button>
            )}
          </div>

          {lead.transferred_at && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Desde {format(parseISO(lead.transferred_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Squad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Squad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {squad ? (
              <div className="flex items-center gap-3">
                <div 
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: squad.color ? `${squad.color}20` : 'hsl(var(--muted))' }}
                >
                  <Users 
                    className="h-5 w-5" 
                    style={{ color: squad.color || 'hsl(var(--muted-foreground))' }}
                  />
                </div>
                <div>
                  <p className="font-semibold">{squad.name}</p>
                  <p className="text-sm text-muted-foreground">Squad de vendas</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Sem Squad</p>
                  <p className="text-sm text-muted-foreground">Lead não atribuído a nenhum squad</p>
                </div>
              </div>
            )}
            
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsTransferModalOpen(true)}
              >
                Alterar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>


      {/* SDR */}
      <RoleAssignmentCard
        label="SDR"
        icon={<User className="h-4 w-4" />}
        currentUser={sdr}
        teamMembers={teamMembers}
        onAssign={async (userId) => {
          if (onUpdateLead) await onUpdateLead({ sdr_id: userId || null });
        }}
      />

      {/* Closer */}
      <RoleAssignmentCard
        label="Closer"
        icon={<User className="h-4 w-4" />}
        currentUser={closer}
        teamMembers={teamMembers}
        onAssign={async (userId) => {
          if (onUpdateLead) await onUpdateLead({ closer_id: userId || null });
        }}
      />

      {/* Transfer history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Histórico de Transferências</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : transferHistory && transferHistory.length > 0 ? (
            <div className="space-y-4">
              {transferHistory.map((transfer) => (
                <div 
                  key={transfer.id} 
                  className="relative pl-6 pb-4 border-l-2 border-border last:pb-0"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-0 -translate-x-1/2 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {transfer.from_user?.full_name || 'Sem atendimento'}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {transfer.to_user?.full_name || 'Sem atendimento'}
                      </span>
                    </div>
                    
                    {transfer.reason && (
                      <p className="text-sm text-muted-foreground italic">
                        "{transfer.reason}"
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        {format(parseISO(transfer.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {transfer.transferred_by_user && (
                        <>
                          <span>•</span>
                          <span>por {transfer.transferred_by_user.full_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma transferência registrada
            </p>
          )}
        </CardContent>
      </Card>

      {/* Transfer modal */}
      <LeadTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        lead={lead}
        currentAssignee={assignee}
        currentSquad={squad}
        onSuccess={() => {
          setIsTransferModalOpen(false);
          onTransferSuccess?.();
        }}
      />
    </div>
  );
}
