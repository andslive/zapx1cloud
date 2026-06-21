import { MessageSquare, Settings, Zap, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyInboxState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/20 p-6">
      <div className="text-center max-w-md space-y-6">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <MessageSquare className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-1">Central de Atendimento</h3>
          <p className="text-sm text-muted-foreground">
            Selecione uma conversa ao lado ou aguarde novas interações
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 text-left">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Atalhos rápidos</p>
              <p className="text-xs text-muted-foreground">
                <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Ctrl+K</kbd> buscar • 
                <kbd className="px-1 py-0.5 bg-background rounded text-[10px] ml-1">Enter</kbd> enviar • 
                <kbd className="px-1 py-0.5 bg-background rounded text-[10px] ml-1">/</kbd> respostas rápidas
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">IA Estratégica</p>
              <p className="text-xs text-muted-foreground">
                Clique em "Sugerir Resposta IA" durante uma conversa para gerar uma resposta contextualizada
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Settings className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Widget de Chat</p>
              <p className="text-xs text-muted-foreground">
                Configure o widget no painel de produtos para receber conversas automaticamente
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
