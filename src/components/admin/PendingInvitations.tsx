import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTeamInvitations, useCancelInvitation, useResendInvitation } from '@/hooks/useTeamInvitations';
import { Mail, Clock, RefreshCw, X, Loader2, Shield, UserCog, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const roleConfig = {
  admin: { label: 'Admin', icon: Shield, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  manager: { label: 'Gestor', icon: UserCog, color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  seller: { label: 'Vendedor', icon: User, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
};

export function PendingInvitations() {
  const { data: invitations, isLoading } = useTeamInvitations();
  const cancelInvitation = useCancelInvitation();
  const resendInvitation = useResendInvitation();

  const handleCancel = async (id: string) => {
    try {
      await cancelInvitation.mutateAsync(id);
      toast.success('Convite cancelado');
    } catch (error) {
      toast.error('Erro ao cancelar convite');
    }
  };

  const handleResend = async (invitation: typeof invitations extends (infer T)[] ? T : never) => {
    try {
      await resendInvitation.mutateAsync(invitation);
      toast.success('Convite reenviado por email');
    } catch (error) {
      toast.error('Erro ao reenviar convite');
    }
  };

  if (isLoading || !invitations?.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h3 className="font-medium text-foreground">
          Convites Pendentes ({invitations.length})
        </h3>
      </div>

      <div className="grid gap-2">
        {invitations.map((invitation) => {
          const config = roleConfig[invitation.role as keyof typeof roleConfig] || roleConfig.seller;
          const Icon = config.icon;
          const expiresIn = formatDistanceToNow(new Date(invitation.expires_at), { 
            addSuffix: true,
            locale: ptBR 
          });

          return (
            <Card key={invitation.id} className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {invitation.email}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <Badge variant="outline" className={`${config.color} text-xs`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        
                        {invitation.squad && (
                          <Badge 
                            variant="outline"
                            className="text-xs"
                            style={{ 
                              backgroundColor: `${invitation.squad.color}15`,
                              borderColor: `${invitation.squad.color}40`,
                              color: invitation.squad.color
                            }}
                          >
                            {invitation.squad.name}
                          </Badge>
                        )}
                        
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Expira {expiresIn}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleResend(invitation)}
                      disabled={resendInvitation.isPending}
                    >
                      {resendInvitation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleCancel(invitation.id)}
                      disabled={cancelInvitation.isPending}
                    >
                      {cancelInvitation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
