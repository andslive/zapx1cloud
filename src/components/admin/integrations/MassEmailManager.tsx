import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMassEmailCampaigns, MassEmailCampaign } from '@/hooks/useMassEmailCampaigns';
import { Plus, Send, Clock, CheckCircle, XCircle, Loader2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CampaignComposer } from './CampaignComposer';
import { CampaignDetailsDialog } from './CampaignDetailsDialog';

export function MassEmailManager() {
  const { data: campaigns, isLoading } = useMassEmailCampaigns();
  const [isComposing, setIsComposing] = useState(false);
  const [viewingCampaign, setViewingCampaign] = useState<MassEmailCampaign | null>(null);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
      draft: { label: 'Rascunho', variant: 'secondary', icon: null },
      scheduled: { label: 'Agendado', variant: 'outline', icon: <Clock className="h-3 w-3 mr-1" /> },
      sending: { label: 'Enviando', variant: 'default', icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" /> },
      sent: { label: 'Enviado', variant: 'default', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
      failed: { label: 'Falha', variant: 'destructive', icon: <XCircle className="h-3 w-3 mr-1" /> }
    };

    const config = statusConfig[status] || statusConfig.draft;

    return (
      <Badge variant={config.variant} className="flex items-center">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isComposing) {
    return <CampaignComposer onClose={() => setIsComposing(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Mensagem em Massa</h3>
          <p className="text-sm text-muted-foreground">
            Envie emails para toda a equipe ou grupos específicos
          </p>
        </div>
        <Button onClick={() => setIsComposing(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {campaigns && campaigns.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Histórico de Envios</h4>
          
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Assunto</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Destinatários</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">
                      {format(new Date(campaign.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {campaign.subject}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span>{campaign.stats.total}</span>
                        {campaign.status === 'sent' && (
                          <span className="text-muted-foreground">
                            ({campaign.stats.sent} ✓ / {campaign.stats.failed} ✗)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(campaign.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewingCampaign(campaign)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">Nenhuma campanha enviada</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Crie sua primeira campanha para enviar mensagens em massa
            </p>
            <Button onClick={() => setIsComposing(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Campaign Details Dialog */}
      <CampaignDetailsDialog
        campaign={viewingCampaign}
        open={!!viewingCampaign}
        onClose={() => setViewingCampaign(null)}
      />
    </div>
  );
}
