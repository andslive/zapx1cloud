import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Save, 
  Rocket,
  Loader2,
  Workflow,
  Eye,
  Share2,
  Settings,
  Zap,
  Activity,
  Palette,
} from 'lucide-react';
import { useFunnel, useUpdateFunnel, useSaveFlowBlocks, useUpdateFunnelStatus } from '@/hooks/useFunnels';
import { Funnel, FunnelStatus } from '@/types/funnel';
import { FunnelFlowTab } from './FunnelFlowTab';
import { FunnelPreviewTab } from './FunnelPreviewTab';
import { FunnelChannelsTab } from './FunnelChannelsTab';
import { FunnelSettingsTab } from './FunnelSettingsTab';
import { FunnelWebhookLogsTab } from './FunnelWebhookLogsTab';
import { FunnelAppearanceTab } from './appearance/FunnelAppearanceTab';
import { toast } from 'sonner';

interface FunnelBuilderProps {
  funnelId: string;
  onBack: () => void;
}

const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function FunnelBuilder({ funnelId, onBack }: FunnelBuilderProps) {
  const [activeTab, setActiveTab] = useState('flow');
  const { data: funnel, isLoading } = useFunnel(funnelId);
  const updateFunnel = useUpdateFunnel();
  const saveFlowBlocks = useSaveFlowBlocks();
  const updateStatus = useUpdateFunnelStatus();

  const handlePublish = async () => {
    if (!funnel) return;

    // Check if at least one channel is enabled
    const hasEnabledChannel = 
      funnel.channels.chat?.enabled || 
      funnel.channels.form?.enabled || 
      funnel.channels.widget?.enabled ||
      funnel.channels.whatsapp?.enabled ||
      funnel.channels.landing?.enabled;

    if (!hasEnabledChannel) {
      toast.error('Ative pelo menos um canal antes de publicar');
      setActiveTab('channels');
      return;
    }

    // Check if flow has blocks
    if (!funnel.flow_blocks || funnel.flow_blocks.length === 0) {
      toast.error('Adicione blocos ao fluxo antes de publicar');
      setActiveTab('flow');
      return;
    }

    await updateStatus.mutateAsync({ id: funnelId, status: 'active' });
    toast.success('Funil publicado com sucesso!');
  };

  const handlePause = async () => {
    await updateStatus.mutateAsync({ id: funnelId, status: 'paused' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Funil não encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">{funnel.name}</h1>
              <Badge variant={statusConfig[funnel.status].variant}>
                {statusConfig[funnel.status].label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {funnel.products?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {funnel.status === 'active' ? (
            <Button 
              variant="outline" 
              onClick={handlePause}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Pausar'
              )}
            </Button>
          ) : (
            <Button 
              onClick={handlePublish}
              disabled={updateStatus.isPending}
              className="gap-2"
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Publicar
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col mt-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-6">
          <TabsTrigger value="flow" className="gap-2">
            <Workflow className="h-4 w-4" />
            <span className="hidden sm:inline">Fluxo</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Aparência</span>
          </TabsTrigger>
          <TabsTrigger value="channels" className="gap-2">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Canais</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Webhooks</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 overflow-hidden">
          <TabsContent value="flow" className="h-full m-0">
            <FunnelFlowTab funnel={funnel} />
          </TabsContent>
          <TabsContent value="preview" className="h-full m-0">
            <FunnelPreviewTab funnel={funnel} />
          </TabsContent>
          <TabsContent value="appearance" className="h-full m-0 overflow-hidden">
            <FunnelAppearanceTab funnel={funnel} />
          </TabsContent>
          <TabsContent value="channels" className="h-full m-0 overflow-auto">
            <FunnelChannelsTab funnel={funnel} />
          </TabsContent>
          <TabsContent value="logs" className="h-full m-0 overflow-hidden">
            <FunnelWebhookLogsTab funnelId={funnelId} />
          </TabsContent>
          <TabsContent value="settings" className="h-full m-0 overflow-auto">
            <FunnelSettingsTab funnel={funnel} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
