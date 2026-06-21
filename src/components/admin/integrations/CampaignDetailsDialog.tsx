import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useCampaignRecipients, MassEmailCampaign } from '@/hooks/useMassEmailCampaigns';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

interface CampaignDetailsDialogProps {
  campaign: MassEmailCampaign | null;
  open: boolean;
  onClose: () => void;
}

export function CampaignDetailsDialog({ campaign, open, onClose }: CampaignDetailsDialogProps) {
  const { data: recipients, isLoading } = useCampaignRecipients(campaign?.id || null);

  if (!campaign) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalhes da Campanha</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Assunto</p>
              <p className="font-medium">{campaign.subject}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Data</p>
              <p className="font-medium">
                {format(new Date(campaign.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{campaign.stats.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">{campaign.stats.sent}</p>
              <p className="text-sm text-muted-foreground">Enviados</p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-600">{campaign.stats.failed}</p>
              <p className="text-sm text-muted-foreground">Falhas</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Destinatários</h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Enviado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recipients?.map((recipient) => (
                      <tr key={recipient.id}>
                        <td className="px-3 py-2">{recipient.email}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(recipient.status)}
                            <span className="capitalize">{recipient.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {recipient.sent_at 
                            ? format(new Date(recipient.sent_at), "dd/MM HH:mm")
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Preview do Email</h4>
            <div 
              className="border rounded-lg p-4 bg-white max-h-96 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: campaign.html_content }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
