import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { Save, RotateCcw, Copy, Loader2, MessageSquare, FileText, Globe, ListChecks, Smartphone, Monitor } from 'lucide-react';
import { Funnel, ChannelKey, FunnelAppearance, defaultChannelAppearance, defaultFunnelAppearance } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { AppearanceForm } from './AppearanceForm';
import { AppearanceLivePreview } from './AppearanceLivePreview';
import { PresetGallery } from './PresetGallery';
import { applyPresetToChannel, applyPresetToAll, AppearancePreset } from '@/lib/funnelAppearancePresets';
import { toast } from 'sonner';

interface Props {
  funnel: Funnel;
}

const CHANNEL_META: Record<ChannelKey, { label: string; icon: any }> = {
  chat: { label: 'Chat', icon: MessageSquare },
  form: { label: 'Form', icon: FileText },
  widget: { label: 'Widget', icon: Globe },
  quiz: { label: 'Quiz', icon: ListChecks },
};

export function FunnelAppearanceTab({ funnel }: Props) {
  const initial = useMemo<FunnelAppearance>(
    () => funnel.appearance || defaultFunnelAppearance(),
    [funnel.id] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [appearance, setAppearance] = useState<FunnelAppearance>(initial);
  const [channel, setChannel] = useState<ChannelKey>('chat');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const update = useUpdateFunnel();

  const isDirty = JSON.stringify(appearance) !== JSON.stringify(initial);

  useEffect(() => { setAppearance(initial); }, [initial]);

  const handleSave = async () => {
    await update.mutateAsync({ id: funnel.id, appearance } as any);
    toast.success('Aparência salva');
  };

  const handleResetChannel = () => {
    setAppearance({ ...appearance, [channel]: defaultChannelAppearance(channel) });
    toast.info(`Canal ${CHANNEL_META[channel].label} restaurado ao padrão`);
  };

  const handleCopyFrom = (source: ChannelKey) => {
    if (source === channel) return;
    setAppearance({
      ...appearance,
      [channel]: { ...appearance[source], channel_options: appearance[channel].channel_options },
    });
    toast.success(`Visual de ${CHANNEL_META[source].label} aplicado a ${CHANNEL_META[channel].label}`);
  };

  const handleApplyPreset = (preset: AppearancePreset, scope: 'channel' | 'all') => {
    if (scope === 'all') {
      setAppearance(applyPresetToAll(appearance, preset));
      toast.success(`Tema "${preset.name}" aplicado a todos os canais`);
    } else {
      setAppearance({
        ...appearance,
        [channel]: applyPresetToChannel(appearance[channel], preset, channel),
      });
      toast.success(`Tema "${preset.name}" aplicado ao ${CHANNEL_META[channel].label}`);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as ChannelKey)}>
          <TabsList>
            {(Object.keys(CHANNEL_META) as ChannelKey[]).map(k => {
              const Icon = CHANNEL_META[k].icon;
              return (
                <TabsTrigger key={k} value={k} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{CHANNEL_META[k].label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copiar de</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(CHANNEL_META) as ChannelKey[]).filter(k => k !== channel).map(k => (
                <DropdownMenuItem key={k} onClick={() => handleCopyFrom(k)}>
                  {CHANNEL_META[k].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={handleResetChannel} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Restaurar</span>
          </Button>

          <Button size="sm" onClick={handleSave} disabled={!isDirty || update.isPending} className="gap-1.5">
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Body: esquerda rola, direita fica fixa em toda a altura */}
      <div className="flex-1 pt-4 min-h-0 flex flex-col lg:flex-row lg:gap-4">
        {/* Controles (rolam) */}
        <div className="order-2 lg:order-1 flex-1 min-w-0 min-h-0 lg:h-full lg:overflow-y-auto lg:pr-2 space-y-4">
          <PresetGallery channel={channel} onApply={handleApplyPreset} />
          <AppearanceForm
            channel={channel}
            appearance={appearance[channel]}
            onChange={(next) => setAppearance({ ...appearance, [channel]: next })}
          />
        </div>

        {/* Preview fixo */}
        <div className="order-1 lg:order-2 lg:w-[440px] lg:shrink-0 lg:h-full">
          <div className="bg-muted/30 rounded-lg p-3 sm:p-4 flex flex-col gap-3 lg:h-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                <span className="hidden sm:inline">Pré-visualização ao vivo — </span>
                {CHANNEL_META[channel].label}
              </p>
              <div className="flex gap-1 bg-background border rounded-md p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDevice('mobile')}
                  className={`p-1.5 rounded ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Mobile"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDevice('desktop')}
                  className={`p-1.5 rounded ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Desktop"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <AppearanceLivePreview channel={channel} appearance={appearance[channel]} device={device} />
            </div>

            {appearance[channel].custom_css && (
              <style dangerouslySetInnerHTML={{ __html: appearance[channel].custom_css || '' }} />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
