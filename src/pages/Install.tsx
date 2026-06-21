import { Smartphone, Share, Plus, Download, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePWA } from '@/hooks/usePWA';

export default function Install() {
  const { isInstalled, isInstallable, isIOS, promptInstall } = usePWA();

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">App Instalado!</h1>
          <p className="text-muted-foreground">O X1ZAP já está instalado no seu dispositivo.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="h-20 w-20 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Smartphone size={40} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Instale o X1ZAP</h1>
          <p className="text-muted-foreground">Acesse suas vendas direto da tela inicial</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-card rounded-lg border border-border">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <span className="text-sm text-foreground">Acesso rápido sem abrir navegador</span>
          </div>
          <div className="flex items-center gap-3 p-4 bg-card rounded-lg border border-border">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <span className="text-sm text-foreground">Funciona offline</span>
          </div>
          <div className="flex items-center gap-3 p-4 bg-card rounded-lg border border-border">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <span className="text-sm text-foreground">Notificações de leads e tarefas</span>
          </div>
        </div>

        {isInstallable && (
          <Button onClick={promptInstall} className="w-full h-12 text-base" size="lg">
            <Download size={20} className="mr-2" />
            Instalar Agora
          </Button>
        )}

        <Card className="p-4 bg-muted/50">
          <h3 className="font-semibold text-foreground mb-3">Como instalar manualmente:</h3>
          {isIOS ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><Share size={16} /> 1. Toque em "Compartilhar"</p>
              <p className="flex items-center gap-2"><Plus size={16} /> 2. Selecione "Adicionar à Tela Inicial"</p>
              <p>3. Confirme tocando em "Adicionar"</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Abra o menu do navegador (⋮)</p>
              <p>2. Toque em "Instalar aplicativo"</p>
              <p>3. Confirme a instalação</p>
            </div>
          )}
        </Card>

        <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
