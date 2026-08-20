// FASE 18A — modal de exibição única do callback URL e verify token
// gerados pelo provisionamento HookCloud.
//
// Segurança do ciclo de vida do segredo, ponto a ponto:
//   - os valores só existem no estado local do componente PAI
//     (`HookCloudOnboardingConfig`), recebidos como prop — nunca em
//     React Query cache, nunca em estado global, nunca em
//     localStorage/sessionStorage/IndexedDB, nunca em URL;
//   - fechar o modal (X, Escape, clique fora, ou confirmação) sempre
//     chama `onClose`, que no componente pai faz `setSuccessResult(null)`
//     — o valor deixa de existir em QUALQUER lugar da árvore React,
//     tornando reabertura com os mesmos valores estruturalmente
//     impossível (não há de onde reler);
//   - nenhum `console.*`, nenhum evento de analytics, nenhum toast
//     inclui o valor do segredo — só confirmações genéricas ("Copiado!");
//   - nenhum `beforeunload` é registrado.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Copy, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { HookCloudProvisionSuccess } from '@/lib/hookcloud/hookcloudProvisioning';

interface HookCloudSecretRevealModalProps {
  result: HookCloudProvisionSuccess | null;
  onClose: () => void;
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    // Nunca inclui o valor copiado na mensagem — só a confirmação.
    toast.success(`${label} copiado!`);
  } catch {
    toast.error(`Não foi possível copiar. Copie manualmente.`);
  }
}

export function HookCloudSecretRevealModal({ result, onClose }: HookCloudSecretRevealModalProps) {
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const requestClose = () => setConfirmCloseOpen(true);
  const confirmClose = () => {
    setConfirmCloseOpen(false);
    onClose();
  };
  const cancelClose = () => setConfirmCloseOpen(false);

  return (
    <>
      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Conexão criada como pendente
            </DialogTitle>
            <DialogDescription>
              Copie agora. O verify token não será exibido novamente pelo CRM.
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <p>
                  Estes valores só aparecem <strong>uma única vez</strong>. Se você fechar esta janela sem
                  copiá-los, será necessário rotacionar as credenciais numa fase futura.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hc-connection-id">ID da conexão</Label>
                <div className="flex gap-2">
                  <input
                    id="hc-connection-id"
                    readOnly
                    value={result.connectionId}
                    className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Estado: Pendente de configuração</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hc-callback-url">Callback URL</Label>
                <div className="flex gap-2">
                  <input
                    id="hc-callback-url"
                    readOnly
                    value={result.callbackUrl}
                    className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copiar Callback URL"
                    onClick={() => copyToClipboard(result.callbackUrl, 'Callback URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hc-verify-token">Verify token</Label>
                <div className="flex gap-2">
                  <input
                    id="hc-verify-token"
                    readOnly
                    value={result.verifyToken}
                    className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copiar Verify Token"
                    onClick={() => copyToClipboard(result.verifyToken, 'Verify token')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3 text-sm space-y-2">
                <p className="font-medium">Próximos passos no painel HookCloud:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Abra a conexão correspondente no painel HookCloud.</li>
                  <li>Configure a Callback URL exatamente como fornecida acima.</li>
                  <li>Informe o Verify Token exatamente como fornecido acima.</li>
                  <li>Assine os eventos necessários de mensagens.</li>
                  <li>Não altere o parâmetro <code>hcs</code> da URL.</li>
                  <li>Não compartilhe estes dados por chat ou e-mail.</li>
                  <li>Retorne ao CRM para validação posterior.</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  A conexão continuará <strong>pendente</strong> até a validação posterior — o CRM não configura a
                  HookCloud automaticamente.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={requestClose}>
              Já copiei, fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={(open) => !open && cancelClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você já salvou o callback e o verify token?</AlertDialogTitle>
            <AlertDialogDescription>
              Eles não poderão ser recuperados pelo CRM depois que esta janela for fechada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClose}>Ainda não</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>Sim, já salvei</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
