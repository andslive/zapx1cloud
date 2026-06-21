import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MessageSquare,
  FileText,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Users,
  Code,
  HelpCircle,
} from 'lucide-react';
import { Funnel, FunnelChannelConfig } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FunnelChannelsTabProps {
  funnel: Funnel;
}

export function FunnelChannelsTab({ funnel }: FunnelChannelsTabProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [evolutionInstances, setEvolutionInstances] = useState<Array<{ id: string; name: string; phone_number: string | null; status: string }>>([]);
  const updateFunnel = useUpdateFunnel();

  const baseUrl = window.location.origin;

  // Load evolution instances of the organization for the WhatsApp channel selector
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('id, name, phone_number, status, organization_id, is_active')
        .eq('organization_id', funnel.organization_id)
        .eq('is_active', true);
      if (!cancelled) setEvolutionInstances((data || []) as any);
    })();
    return () => { cancelled = true; };
  }, [funnel.organization_id]);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copiado!');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleToggleChannel = async (channel: keyof FunnelChannelConfig, enabled: boolean) => {
    const updatedChannels = {
      ...funnel.channels,
      [channel]: {
        ...(funnel.channels as any)[channel],
        enabled,
      },
    } as FunnelChannelConfig;

    await updateFunnel.mutateAsync({
      id: funnel.id,
      channels: updatedChannels,
    });

    toast.success(enabled ? 'Canal ativado!' : 'Canal desativado');
  };

  const updateWhatsAppChannel = async (patch: Partial<NonNullable<FunnelChannelConfig['whatsapp']>>) => {
    const current = funnel.channels.whatsapp || { enabled: false };
    const updatedChannels = {
      ...funnel.channels,
      whatsapp: { ...current, ...patch },
    } as FunnelChannelConfig;
    await updateFunnel.mutateAsync({ id: funnel.id, channels: updatedChannels });
  };

  const getChatUrl = () => {
    const slug = funnel.channels.chat?.slug_override || funnel.slug;
    return `${baseUrl}/c/${slug}`;
  };

  const getFormUrl = () => {
    const slug = funnel.channels.form?.slug_override || funnel.slug;
    return `${baseUrl}/f/${slug}`;
  };

  const getLandingUrl = () => {
    const slug = funnel.channels.landing?.slug_override || funnel.slug;
    return `${baseUrl}/s/${slug}`;
  };

  const getWidgetScript = () => {
    return `<!-- Capture Widget -->
<script
  src="${baseUrl}/funnel-widget.js"
  data-funnel-id="${funnel.id}"
  async>
</script>`;
  };

  const getEmbedCode = () => {
    return `<iframe src="${getFormUrl()}" width="100%" height="600" frameborder="0"></iframe>`;
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-2">Canais de Publicação</h2>
        <p className="text-muted-foreground text-sm">
          Ative os canais onde seu funil será publicado. Cada canal oferece uma experiência diferente para seus visitantes.
        </p>
      </div>

      {/* Chat Channel */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Chat Bot</CardTitle>
                <CardDescription>Experiência conversacional estilo Typebot</CardDescription>
              </div>
            </div>
            <Switch
              checked={funnel.channels.chat?.enabled}
              onCheckedChange={(checked) => handleToggleChannel('chat', checked)}
            />
          </div>
        </CardHeader>
        {funnel.channels.chat?.enabled && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-sm">Link Público</Label>
              <div className="flex gap-2">
                <Input value={getChatUrl()} readOnly className="font-mono text-sm" />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(getChatUrl(), 'chat-url')}
                >
                  {copiedField === 'chat-url' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={getChatUrl()} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>0 leads via este canal</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* WhatsApp Channel */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-green-600" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.34 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <CardDescription>Atende leads no WhatsApp executando o fluxo automaticamente</CardDescription>
              </div>
            </div>
            <Switch
              checked={funnel.channels.whatsapp?.enabled || false}
              onCheckedChange={(checked) => handleToggleChannel('whatsapp', checked)}
            />
          </div>
        </CardHeader>
        {funnel.channels.whatsapp?.enabled && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-sm">Instância do WhatsApp</Label>
              <Select
                value={funnel.channels.whatsapp?.evolution_instance_id || '__any__'}
                onValueChange={(v) =>
                  updateWhatsAppChannel({ evolution_instance_id: v === '__any__' ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Qualquer instância da organização</SelectItem>
                  {evolutionInstances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name} {inst.phone_number ? `· ${inst.phone_number}` : ''}
                      {inst.status !== 'connected' ? ' (desconectada)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {evolutionInstances.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma instância encontrada. Cadastre em Integrações → WhatsApp & Mensageria.
                </p>
              )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-medium mb-1">Como funciona o controle do fluxo</p>
              <p>
                Os agentes de IA respeitam o fluxo passo a passo. O controle só passa para o agente quando
                o fluxo chega em um bloco <strong>"IA assume"</strong>, <strong>"Trocar agente"</strong>,
                <strong> "Transferir para humano"</strong> ou <strong>"Fim"</strong>.
              </p>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>0 leads via este canal</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Form Channel */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">Formulário</CardTitle>
                <CardDescription>Experiência estilo Typeform - uma pergunta por tela</CardDescription>
              </div>
            </div>
            <Switch
              checked={funnel.channels.form?.enabled}
              onCheckedChange={(checked) => handleToggleChannel('form', checked)}
            />
          </div>
        </CardHeader>
        {funnel.channels.form?.enabled && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-sm">Link Público</Label>
              <div className="flex gap-2">
                <Input value={getFormUrl()} readOnly className="font-mono text-sm" />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(getFormUrl(), 'form-url')}
                >
                  {copiedField === 'form-url' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={getFormUrl()} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Código Embed (iframe)</Label>
              <div className="flex gap-2">
                <Input value={getEmbedCode()} readOnly className="font-mono text-xs" />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(getEmbedCode(), 'embed')}
                >
                  {copiedField === 'embed' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>0 leads via este canal</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Widget Channel */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-base">Widget de Site</CardTitle>
                <CardDescription>Bolha de chat que aparece no canto do seu site</CardDescription>
              </div>
            </div>
            <Switch
              checked={funnel.channels.widget?.enabled}
              onCheckedChange={(checked) => handleToggleChannel('widget', checked)}
            />
          </div>
        </CardHeader>
        {funnel.channels.widget?.enabled && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Código de Instalação
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Pronto para usar
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(getWidgetScript(), 'widget')}
                    className="gap-2"
                  >
                    {copiedField === 'widget' ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Copie e cole este código antes do fechamento da tag {'</body>'} no seu site
              </p>
              <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre text-foreground">{getWidgetScript()}</pre>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">i</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">ID do Funil</p>
                <p className="text-sm text-muted-foreground">
                  Funnel ID: <span className="text-primary font-mono">{funnel.id}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Posição</Label>
                <Badge variant="outline">{funnel.widget_config.position === 'bottom-right' ? 'Inferior Direita' : 'Inferior Esquerda'}</Badge>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Cor Principal</Label>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-full border"
                    style={{ backgroundColor: funnel.widget_config.primary_color }}
                  />
                  <span className="text-sm font-mono">{funnel.widget_config.primary_color}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>0 leads via este canal</span>
              </div>
            </div>
          </CardContent>
        )}

      </Card>

      {/* Quiz Channel (legacy: landing) */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-base">Quiz</CardTitle>
                <CardDescription>Experiência interativa estilo quiz — perguntas em sequência com resultado final</CardDescription>
              </div>
            </div>
            <Switch
              checked={funnel.channels.landing?.enabled}
              onCheckedChange={(checked) => handleToggleChannel('landing', checked)}
            />
          </div>
        </CardHeader>
        {funnel.channels.landing?.enabled && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-sm">Link Público</Label>
              <div className="flex gap-2">
                <Input value={getLandingUrl()} readOnly className="font-mono text-sm" />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(getLandingUrl(), 'landing-url')}
                >
                  {copiedField === 'landing-url' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={getLandingUrl()} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>0 leads via este canal</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
