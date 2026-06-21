import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  CalendarDays, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  ExternalLink,
  ChevronDown,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

export function GoogleCalendarOAuthConfig() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get current configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ['google-calendar-oauth', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'google_calendar_oauth')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const settings = config?.settings as { clientId?: string; clientSecretMasked?: string } | null;
  const isConfigured = config?.is_configured && !!settings?.clientId;

  const handleSave = async () => {
    if (!clientId && !isConfigured) {
      toast.error('Client ID é obrigatório');
      return;
    }

    if (!clientSecret && !isConfigured) {
      toast.error('Client Secret é obrigatório para primeira configuração');
      return;
    }

    // Validações de formato — evita o erro recorrente de colar o Client ID no campo Secret
    if (clientSecret) {
      const trimmed = clientSecret.trim();
      if (clientId && trimmed === clientId.trim()) {
        toast.error('Client Secret não pode ser igual ao Client ID. Cole o secret correto (começa com "GOCSPX-").');
        return;
      }
      if (trimmed.endsWith('.apps.googleusercontent.com')) {
        toast.error('Você colou um Client ID no campo Client Secret. O secret correto começa com "GOCSPX-".');
        return;
      }
      if (!trimmed.startsWith('GOCSPX-')) {
        toast.error('Client Secret inválido. Ele deve começar com "GOCSPX-" (copie do Google Cloud Console).');
        return;
      }
    }

    setIsSaving(true);
    try {
      const newSettings: Record<string, string> = {};
      
      // Use new values if provided, otherwise keep existing
      if (clientId) {
        newSettings.clientId = clientId;
      } else if (settings?.clientId) {
        newSettings.clientId = settings.clientId;
      }

      if (clientSecret) {
        newSettings.clientSecret = clientSecret;
        newSettings.clientSecretMasked = '****' + clientSecret.slice(-4);
      } else if (config?.settings) {
        const existingSettings = config.settings as { clientSecret?: string; clientSecretMasked?: string };
        if (existingSettings.clientSecret) {
          newSettings.clientSecret = existingSettings.clientSecret;
          newSettings.clientSecretMasked = existingSettings.clientSecretMasked || '';
        }
      }

      if (config) {
        // Update existing
        const { error } = await supabase
          .from('integration_settings')
          .update({
            settings: newSettings,
            is_configured: true,
            last_verified_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('integration_settings')
          .insert({
            organization_id: profile!.organization_id!,
            integration_type: 'google_calendar_oauth',
            is_configured: true,
            settings: newSettings,
            last_verified_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['google-calendar-oauth'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-oauth-config'] });
      toast.success('Configuração salva com sucesso');
      
      // Clear form
      setClientId('');
      setClientSecret('');
    } catch (error) {
      toast.error('Erro ao salvar: ' + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isConfigured ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                <CalendarDays className={`h-5 w-5 ${isConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Google Calendar OAuth
                  {isConfigured ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Permite que usuários conectem seus calendários do Google
                </CardDescription>
              </div>
            </div>
            <a 
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardHeader>
        
        {isConfigured && settings?.clientId && (
          <CardContent className="pt-0">
            <div className="text-sm">
              <span className="text-muted-foreground">Client ID: </span>
              <span className="font-mono">{settings.clientId.slice(0, 20)}...{settings.clientId.slice(-10)}</span>
            </div>
            {settings?.clientSecretMasked && (
              <div className="text-sm">
                <span className="text-muted-foreground">Client Secret: </span>
                <span className="font-mono">{settings.clientSecretMasked}</span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Instructions */}
      <Collapsible open={isInstructionsOpen} onOpenChange={setIsInstructionsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Como obter as credenciais OAuth
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isInstructionsOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Alert className="mt-4">
            <AlertDescription className="space-y-3">
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>
                  Acesse o{' '}
                  <a 
                    href="https://console.cloud.google.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Google Cloud Console
                  </a>
                </li>
                <li>Crie um novo projeto ou selecione um existente</li>
                <li>Vá em "APIs e Serviços" → "Credenciais"</li>
                <li>Clique em "Criar credenciais" → "ID do cliente OAuth"</li>
                <li>Selecione "Aplicativo da Web"</li>
                <li>
                  Em "URIs de redirecionamento autorizados", adicione:
                  <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                    {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-callback`}
                  </code>
                </li>
                <li>Copie o Client ID e Client Secret gerados</li>
                <li>
                  Em "APIs e Serviços" → "Biblioteca", habilite:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Google Calendar API</li>
                  </ul>
                </li>
              </ol>
            </AlertDescription>
          </Alert>
        </CollapsibleContent>
      </Collapsible>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isConfigured ? 'Atualizar Credenciais' : 'Configurar Credenciais'}
          </CardTitle>
          <CardDescription>
            Insira as credenciais OAuth do Google Cloud Console
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              type="text"
              placeholder={settings?.clientId ? `Atual: ${settings.clientId.slice(0, 30)}...` : 'Cole o Client ID aqui'}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Client Secret</Label>
            <div className="relative">
              <Input
                id="clientSecret"
                type={showSecret ? 'text' : 'password'}
                placeholder={settings?.clientSecretMasked ? `Atual: ${settings.clientSecretMasked}` : 'Cole o Client Secret aqui'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isConfigured 
                ? 'Deixe em branco para manter o secret atual'
                : 'O secret será armazenado de forma segura'
              }
            </p>
          </div>

          <Button 
            onClick={handleSave}
            disabled={isSaving || (!clientId && !clientSecret && !isConfigured)}
            className="w-full"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isConfigured ? 'Atualizar Configuração' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
