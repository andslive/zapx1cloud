import { useState, useEffect } from 'react';
import { useLead, useUpdateLead } from '@/hooks/useLeads';
import { useCreateInteraction } from '@/hooks/useInteractions';
import { useAuth } from '@/hooks/useAuth';
import { useDetailedLeadTracking } from '@/hooks/useLeadTracking';
import { LeadTimeline } from './LeadTimeline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  User, 
  Building, 
  Mail, 
  Phone, 
  Flame,
  ThermometerSun,
  Snowflake,
  Calendar,
  Loader2,
  MessageSquare,
   Plus,
   Save,
   Target,
   Flag,
   Globe,
   Link,
   ExternalLink,
    Share2,
    FileText
  } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
}

const channelOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Ligação' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'other', label: 'Outro' },
];

export function LeadDetailModal({ isOpen, onClose, leadId }: LeadDetailModalProps) {
  const { user, isAdmin } = useAuth();
  const { data: lead, isLoading } = useLead(leadId);
  const { data: tracking } = useDetailedLeadTracking(leadId);
  const updateLead = useUpdateLead();
  const createInteraction = useCreateInteraction();
  
  const [activeTab, setActiveTab] = useState('timeline');
  const [interactionChannel, setInteractionChannel] = useState<string>('whatsapp');
  const [interactionContent, setInteractionContent] = useState('');
  const [interactionDirection, setInteractionDirection] = useState<string>('outbound');
  const [notes, setNotes] = useState('');
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);

  const getTemperatureIcon = (temp: string | null) => {
    switch (temp) {
      case 'hot': return <Flame size={16} className="text-destructive" />;
      case 'warm': return <ThermometerSun size={16} className="text-warning" />;
      case 'cold': return <Snowflake size={16} className="text-blue-400" />;
      default: return null;
    }
  };

  const handleAddInteraction = async () => {
    if (!interactionContent.trim()) {
      toast.error('Conteúdo é obrigatório');
      return;
    }

    try {
      await createInteraction.mutateAsync({
        lead_id: leadId,
        user_id: user?.id,
        channel: interactionChannel as any,
        direction: interactionDirection,
        content: interactionContent,
        cadence_day: lead?.cadence_day
      });
      toast.success('Interação registrada!');
      setInteractionContent('');
      setIsAddingInteraction(false);
    } catch (error) {
      toast.error('Erro ao registrar interação');
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateLead.mutateAsync({
        id: leadId,
        notes: notes
      });
      toast.success('Notas salvas!');
    } catch (error) {
      toast.error('Erro ao salvar notas');
    }
  };

  // Update notes when lead loads
  useEffect(() => {
    if (lead?.notes) {
      setNotes(lead.notes);
    }
  }, [lead?.notes]);

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!lead) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={20} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span>{lead.name}</span>
                {getTemperatureIcon(lead.temperature)}
              </div>
              {lead.company && (
                <p className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                  <Building size={12} />
                  {lead.company}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Lead Info Cards */}
        <div className="grid grid-cols-3 gap-3 py-4 border-y border-border">
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground truncate">
              {lead.email || '-'}
            </p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="text-sm font-medium text-foreground">
              {lead.phone || '-'}
            </p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Último contato</p>
            <p className="text-sm font-medium text-foreground">
              {lead.last_contact_at 
                ? format(new Date(lead.last_contact_at), "dd/MM/yyyy", { locale: ptBR })
                : 'Nunca'
              }
            </p>
          </div>
        </div>

        {/* Current Stage & Cadence */}
        <div className="flex items-center gap-4 py-2">
          {lead.pipeline_stages && (
            <Badge 
              style={{ 
                backgroundColor: `${lead.pipeline_stages.color}20`,
                color: lead.pipeline_stages.color,
                borderColor: lead.pipeline_stages.color
              }}
              className="border"
            >
              {lead.pipeline_stages.name}
            </Badge>
          )}
          {lead.cadence_day && (
            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">
              <Calendar size={12} className="mr-1" />
              Dia {lead.cadence_day} da cadência
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <MessageSquare size={14} />
              Timeline
            </TabsTrigger>
             <TabsTrigger value="notes" className="flex items-center gap-2">
               <Save size={14} />
               Notas
             </TabsTrigger>
             <TabsTrigger value="attribution" className="flex items-center gap-2">
               <Target size={14} />
               Origem
             </TabsTrigger>
           </TabsList>
           
           <div className="flex-1 overflow-hidden flex flex-col min-h-0">
             <TabsContent value="timeline" className="flex-1 overflow-hidden mt-4">
            {/* Add Interaction Button */}
            {!isAddingInteraction ? (
              <Button 
                variant="outline" 
                className="w-full mb-4"
                onClick={() => setIsAddingInteraction(true)}
              >
                <Plus size={16} className="mr-2" />
                Registrar Interação
              </Button>
            ) : (
              <div className="bg-secondary/30 rounded-lg p-4 mb-4 space-y-3 border border-border">
                <div className="flex gap-2">
                  <Select value={interactionChannel} onValueChange={setInteractionChannel}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {channelOptions.map(ch => (
                        <SelectItem key={ch.value} value={ch.value}>
                          {ch.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={interactionDirection} onValueChange={setInteractionDirection}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Enviado</SelectItem>
                      <SelectItem value="inbound">Recebido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Descreva a interação..."
                  value={interactionContent}
                  onChange={(e) => setInteractionContent(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setIsAddingInteraction(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleAddInteraction}
                    disabled={createInteraction.isPending}
                  >
                    {createInteraction.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </div>
            )}

            <LeadTimeline leadId={leadId} maxHeight="280px" />
          </TabsContent>

          <TabsContent value="notes" className="flex-1 overflow-hidden mt-4">
            <div className="space-y-3">
              <Textarea
                placeholder="Adicione notas sobre este lead..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <Button 
                className="w-full"
                onClick={handleSaveNotes}
                disabled={updateLead.isPending}
              >
                {updateLead.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save size={16} className="mr-2" />
                )}
                 Salvar Notas
               </Button>
             </div>
           </TabsContent>

           <TabsContent value="attribution" className="flex-1 overflow-y-auto mt-4 pr-2">
             <div className="space-y-6 pb-6">
               <div className="grid grid-cols-2 gap-4">
                 <div className="p-3 bg-secondary/20 rounded-lg border border-border/50">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                     <Share2 size={10} />
                     Origem do Lead
                   </p>
                   <p className="text-sm font-medium capitalize">
                     {lead.lead_origin?.replace('_', ' ') || lead.source || 'Desconhecido'}
                   </p>
                 </div>
                 <div className="p-3 bg-secondary/20 rounded-lg border border-border/50">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                     <Calendar size={10} />
                     Primeiro Contato
                   </p>
                   <p className="text-sm font-medium">
                     {(lead as any).first_message_at 
                       ? format(new Date((lead as any).first_message_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                       : 'N/A'}
                   </p>
                 </div>
               </div>

               <div className="space-y-4">
                 <h4 className="text-sm font-semibold flex items-center gap-2">
                   <Target size={16} className="text-primary" />
                   Campanha de Anúncio
                 </h4>
                 <div className="grid grid-cols-1 gap-3">
                   <AttributionItem 
                     label="Campanha" 
                     value={(lead as any).campaign_name || (lead as any).campaign_id} 
                     icon={<Flag size={14} />} 
                   />
                   <AttributionItem 
                     label="Conjunto" 
                     value={(lead as any).adset_name || (lead as any).adset_id} 
                     icon={<Flag size={14} />} 
                   />
                   <AttributionItem 
                     label="Anúncio" 
                     value={(lead as any).ad_name || (lead as any).ad_id} 
                     icon={<Flag size={14} />} 
                   />
                 </div>
               </div>

               <div className="space-y-4">
                 <h4 className="text-sm font-semibold flex items-center gap-2">
                   <Globe size={16} className="text-primary" />
                   Parâmetros UTM
                 </h4>
                 <div className="grid grid-cols-1 gap-3">
                   <AttributionItem label="Source" value={lead.utm_source} icon={<ExternalLink size={14} />} />
                   <AttributionItem label="Medium" value={lead.utm_medium} icon={<ExternalLink size={14} />} />
                   <AttributionItem label="Campaign" value={lead.utm_campaign} icon={<ExternalLink size={14} />} />
                 </div>
               </div>
               
               {((lead as any).fbclid || (lead as any).ctwa_clid) && (
                 <div className="space-y-4">
                   <h4 className="text-sm font-semibold flex items-center gap-2">
                     <Link size={16} className="text-primary" />
                     IDs de Rastreamento
                   </h4>
                   <div className="grid grid-cols-1 gap-3">
                     <AttributionItem label="FBCLID" value={(lead as any).fbclid} icon={<Link size={14} />} />
                     <AttributionItem label="CTWA CLID" value={(lead as any).ctwa_clid} icon={<Link size={14} />} />
                   </div>
                 </div>
               )}
               {isAdmin() && tracking && (
                  <div className="space-y-4 pt-4 border-t border-border mt-6">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <Target size={16} />
                      Dados de Anúncio (CTWA)
                    </h4>
                    
                    {tracking.ad_headline && (
                      <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                        <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">
                          CTWA Detectado
                        </Badge>
                        <div className="space-y-3">
                          <AttributionItem label="Criativo/Headline" value={tracking.ad_headline} icon={<Flag size={14} />} />
                          <AttributionItem label="Texto do anúncio" value={tracking.ad_body} icon={<FileText size={14} />} />
                          <AttributionItem label="Origem" value={tracking.ad_source_app} icon={<Share2 size={14} />} />
                          <AttributionItem label="URL" value={tracking.ad_source_url} icon={<ExternalLink size={14} />} />
                          <AttributionItem label="Entry Point" value={tracking.entry_point_conversion_source} icon={<Target size={14} />} />
                        </div>
                      </div>
                    )}

                    <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive mt-6">
                      <Target size={16} />
                      Debug Tracking (Apenas Admin)
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      <AttributionItem label="CTWA CLID" value={tracking.ctwa_clid} icon={<Link size={14} />} />
                      <AttributionItem label="Ad ID" value={tracking.ad_id} icon={<Flag size={14} />} />
                      <AttributionItem label="Campaign ID" value={tracking.campaign_id} icon={<Flag size={14} />} />
                      <AttributionItem label="Source Type" value={tracking.source_type || tracking.source} icon={<Share2 size={14} />} />
                      <AttributionItem label="Source URL" value={tracking.source_url || tracking.landing_url} icon={<ExternalLink size={14} />} />
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Referral JSON</p>
                      <pre className="text-[10px] bg-secondary/50 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(tracking.referral, null, 2)}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">CTWA Payload JSON</p>
                      <pre className="text-[10px] bg-secondary/50 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(tracking.raw_ctwa_payload, null, 2)}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Raw Payload JSON</p>
                      <pre className="text-[10px] bg-secondary/50 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(tracking.raw_payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
             </div>
           </TabsContent>
         </div>
       </Tabs>
     </DialogContent>
   </Dialog>
  );
}

function AttributionItem({ label, value, icon }: { label: string; value: string | null | undefined; icon: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/10 transition-colors">
      <div className="text-muted-foreground bg-secondary/40 p-1.5 rounded">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
