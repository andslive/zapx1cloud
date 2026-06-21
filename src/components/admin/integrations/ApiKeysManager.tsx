import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useIntegrations, useUpdateIntegration } from '@/hooks/useIntegrations';
import { Mail, Globe, Zap, CheckCircle, AlertCircle, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Globe,
  Zap
};

export function ApiKeysManager() {
  const { data: integrations, isLoading } = useIntegrations();
  const updateIntegration = useUpdateIntegration();
  
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const handleSaveKey = async () => {
    if (!editingIntegration || !apiKey) return;

    // Mask the key for storage
    const masked = '****' + apiKey.slice(-4);
    
    await updateIntegration.mutateAsync({
      integrationType: editingIntegration,
      apiKeyMasked: masked,
      isConfigured: true
    });

    setEditingIntegration(null);
    setApiKey('');
    setShowKey(false);
  };

  const handleTestConnection = async (integrationType: string) => {
    setTesting(integrationType);
    
    try {
      const { error } = await supabase.functions.invoke('test-integration', {
        body: { integrationType }
      });

      if (error) throw error;
      toast.success('Conexão testada com sucesso!');
    } catch (error) {
      toast.error('Falha na conexão: ' + (error as Error).message);
    } finally {
      setTesting(null);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Chaves de API</h3>
          <p className="text-sm text-muted-foreground">
            Configure as integrações com serviços externos
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {integrations?.map((integration) => {
          const Icon = iconMap[integration.icon] || Mail;
          const isConfigured = integration.setting?.is_configured ?? false;

          return (
            <Card key={integration.type}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isConfigured ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                      <Icon className={`h-5 w-5 ${isConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {integration.name}
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
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                  </div>
                  <a 
                    href={integration.docsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                  {isConfigured && (
                    <div className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded">
                      {integration.setting?.api_key_masked || '****'}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    {isConfigured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(integration.type)}
                        disabled={testing === integration.type}
                      >
                        {testing === integration.type ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Testar'
                        )}
                      </Button>
                    )}
                    <Button
                      variant={isConfigured ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => setEditingIntegration(integration.type)}
                    >
                      {isConfigured ? 'Atualizar' : 'Configurar'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingIntegration} onOpenChange={() => setEditingIntegration(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Configurar {integrations?.find(i => i.type === editingIntegration)?.name}
            </DialogTitle>
            <DialogDescription>
              Insira a chave de API para habilitar esta integração
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder="Cole sua chave de API aqui"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground">
              A chave será armazenada de forma segura e apenas os últimos 4 caracteres serão visíveis.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIntegration(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveKey}
              disabled={!apiKey || updateIntegration.isPending}
            >
              {updateIntegration.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
