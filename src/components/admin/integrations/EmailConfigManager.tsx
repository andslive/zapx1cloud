import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEmailConfig, useUpdateEmailConfig } from '@/hooks/useIntegrations';
import { Loader2, AlertTriangle, Save } from 'lucide-react';

export function EmailConfigManager() {
  const { data: config, isLoading } = useEmailConfig();
  const updateConfig = useUpdateEmailConfig();

  const [formData, setFormData] = useState({
    senderName: '',
    senderEmail: '',
    signature: ''
  });

  useEffect(() => {
    if (config) {
      setFormData({
        senderName: config.senderName || '',
        senderEmail: config.senderEmail || '',
        signature: config.signature || ''
      });
    }
  }, [config]);

  const handleSave = async () => {
    await updateConfig.mutateAsync(formData);
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
      <div>
        <h3 className="text-lg font-semibold">Configuração de Emails</h3>
        <p className="text-sm text-muted-foreground">
          Configure o remetente padrão e assinatura dos emails
        </p>
      </div>

      <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Domínio de teste:</strong> Emails estão sendo enviados com o domínio de teste do Resend (resend.dev). 
          Para enviar com seu próprio domínio, verifique-o no painel do Resend.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Remetente</CardTitle>
          <CardDescription>
            Defina como seus emails aparecerão para os destinatários
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="senderName">Nome do Remetente</Label>
              <Input
                id="senderName"
                placeholder="Ex: Equipe de Vendas"
                value={formData.senderName}
                onChange={(e) => setFormData(prev => ({ ...prev, senderName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senderEmail">Email de Resposta</Label>
              <Input
                id="senderEmail"
                type="email"
                placeholder="Ex: vendas@suaempresa.com"
                value={formData.senderEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, senderEmail: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Este email será usado no Reply-To dos emails enviados
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assinatura Padrão</CardTitle>
          <CardDescription>
            Texto que será incluído no rodapé dos emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea
              placeholder="Ex: Atenciosamente,&#10;Equipe de Vendas&#10;contato@empresa.com"
              rows={4}
              value={formData.signature}
              onChange={(e) => setFormData(prev => ({ ...prev, signature: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
