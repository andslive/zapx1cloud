import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bot, ExternalLink, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

export function BotConversaConfig() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organization_id) return;
    loadConfig();
  }, [profile?.organization_id]);

  const loadConfig = async () => {
    try {
      const { data } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'whatsapp_provider')
        .maybeSingle();

      if (data?.settings) {
        const settings = data.settings as Record<string, unknown>;
        setApiKey((settings.botconversa_api_key as string) || '');
        setIsActive((settings.provider as string) === 'botconversa');
      }
    } catch (e) {
      console.error('Error loading BotConversa config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.organization_id) return;
    setSaving(true);

    try {
      const settings = {
        provider: isActive ? 'botconversa' : 'isichat',
        botconversa_api_key: apiKey,
      };

      const { data: existing } = await supabase
        .from('integration_settings')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('integration_type', 'whatsapp_provider')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('integration_settings')
          .update({
            settings: JSON.parse(JSON.stringify(settings)),
            is_configured: !!apiKey,
            last_verified_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('integration_settings')
          .insert([{
            organization_id: profile.organization_id,
            integration_type: 'whatsapp_provider',
            settings: JSON.parse(JSON.stringify(settings)),
            is_configured: !!apiKey,
            last_verified_at: new Date().toISOString(),
          }]);
      }

      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast.success('Configuração do BotConversa salva!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp via BotConversa</CardTitle>
                <CardDescription>
                  Use a API do BotConversa para enviar mensagens WhatsApp
                </CardDescription>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base font-medium">Usar BotConversa como provedor principal</Label>
              <p className="text-sm text-muted-foreground">
                Quando ativo, todas as mensagens WhatsApp serão enviadas via BotConversa em vez do IsiChat
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label>API-KEY do BotConversa</Label>
            <p className="text-xs text-muted-foreground">
              Encontre sua API-KEY no painel do BotConversa em Configurações → Integrações → API
            </p>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole sua API-KEY aqui"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Setup Instructions */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <h4 className="font-medium text-sm">Como configurar</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>No BotConversa, vá em <strong>Configurações → Integrações → API</strong></li>
              <li>Copie sua <strong>API-KEY</strong> e cole no campo acima</li>
              <li>Ative o toggle <strong>"Usar BotConversa como provedor principal"</strong></li>
              <li>Clique em <strong>Salvar</strong></li>
            </ol>
          </div>

          {/* Info */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <h4 className="font-medium text-sm">ℹ️ Como funciona</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Mensagens do Inbox, outreach e follow-ups são enviadas via API do BotConversa</li>
              <li>• O sistema busca o contato pelo telefone e envia a mensagem automaticamente</li>
              <li>• Você pode alternar entre BotConversa e IsiChat a qualquer momento</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Configuração
            </Button>
            <Button variant="outline" asChild>
              <a href="https://app.botconversa.com.br" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Abrir BotConversa
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
