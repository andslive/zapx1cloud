import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Smartphone, Star, Loader2, Info, QrCode, CheckCircle2, Pause, LogOut, Plus, Sparkles, Pencil, Trash2, RefreshCw, Activity, AlertTriangle, Ghost, ShieldCheck, ShieldAlert, Zap, History } from 'lucide-react';
import {
  useWhatsAppInstances,
  useSetDefaultWhatsAppInstance,
  useConnectWhatsAppInstance,
  useDisconnectWhatsAppInstance,
  useLogoutWhatsAppInstance,
  useCreateWhatsAppInstanceSelf,
  useDeleteWhatsAppInstanceSelf,
  useRenameWhatsAppInstanceSelf,
  useSyncWhatsAppInstances,
  useRepairWhatsAppWebhook,
  useCheckWhatsAppWebhook,
  type WhatsAppInstance as BaseWhatsAppInstance,
} from '@/hooks/useWhatsAppInstances';


export interface WhatsAppInstance extends BaseWhatsAppInstance {
  is_ghost?: boolean;
  one_tick_count?: number;
  last_ack_at?: string;
}

import { useAuth } from '@/hooks/useAuth';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PresenceTestButton } from './PresenceTestButton';
import { AdminStatusNotificationConfig } from './AdminStatusNotificationConfig';


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'WhatsApp Online', variant: 'default' },
    qr_pending: { label: 'Aguardando QR', variant: 'secondary' },
    paired: { label: 'WhatsApp Online', variant: 'default' },
    disconnected: { label: 'WhatsApp Offline', variant: 'outline' },
  };
  const cfg = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function WebhookStatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    ok: { label: 'Webhook OK', variant: 'default', icon: ShieldCheck },
    absent: { label: 'Webhook Ausente', variant: 'destructive', icon: ShieldAlert },
    broken: { label: 'Webhook Quebrado', variant: 'destructive', icon: AlertTriangle },
    unknown: { label: 'Webhook Desconhecido', variant: 'outline', icon: Info },
  };
  const cfg = map[status || 'unknown'] || map.unknown;
  const Icon = cfg.icon;
  
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}


function ConnectDialog({ instance, onClose }: { instance: WhatsAppInstance; onClose: () => void }) {
  const connectMut = useConnectWhatsAppInstance();
  const [qr, setQr] = useState<string | null>(instance.qr_code);
  const [status, setStatus] = useState(instance.status);
  const [elapsed, setElapsed] = useState(0);

  const triggerConnect = () => {
    setQr(null);
    setElapsed(0);
    connectMut.mutate(instance.id, {
      onSuccess: (data: any) => {
        if (data?.already_connected) {
          setStatus('connected');
          toast.success('Já conectado!');
          setTimeout(onClose, 1200);
          return;
        }
        if (data?.qr_code) setQr(data.qr_code);
      },
    });
  };

  useEffect(() => {
    triggerConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll DB for QR/status updates pushed by webhook
  useEffect(() => {
    if (status === 'connected') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('status, qr_code')
        .eq('id', instance.id)
        .maybeSingle();
      if (data) {
        if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
        if (data.status !== status) {
          setStatus(data.status);
          if (data.status === 'connected') {
            toast.success('WhatsApp conectado com sucesso!');
            setTimeout(onClose, 1500);
          }
        }
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [status, qr, instance.id, onClose]);

  // Elapsed timer (used to decide "loading" vs "error" state)
  useEffect(() => {
    if (qr || status === 'connected') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [qr, status]);

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const showError = !qr && status !== 'connected' && elapsed >= 15;
  const showLoading = !qr && status !== 'connected' && !showError;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {instance.name}</DialogTitle>
          <DialogDescription>
            Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar aparelho → escaneie o código abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 min-h-[280px]">
          {status === 'connected' ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <p className="font-medium">Conectado!</p>
            </div>
          ) : qr ? (
            <div className="bg-white p-3 rounded-lg">
              <img
                src={isQrBase64 ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`) : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`}
                alt="QR Code"
                className="w-60 h-60"
              />
            </div>
          ) : showLoading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {elapsed < 6 ? 'Gerando QR Code…' : 'Aguardando o servidor gerar o QR…'}
              </p>
               <p className="text-xs text-muted-foreground">
                Isso pode levar até 15 segundos. Mantenha esta janela aberta.
              </p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <QrCode className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code.</p>
              <Button size="sm" variant="outline" onClick={triggerConnect} disabled={connectMut.isPending}>
                {connectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tentar novamente'}
              </Button>
            </div>
          )}
        </div>

        <div className="text-xs text-center text-muted-foreground">
          Status: <StatusBadge status={status} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const createMut = useCreateWhatsAppInstanceSelf();

  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const valid = /^[a-z0-9-]{3,40}$/.test(sanitized);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createMut.mutate({ name: sanitized }, { onSuccess: () => { setName(''); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setName(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova conexão de WhatsApp</DialogTitle>
            <DialogDescription>
              Dê um nome simples para identificar essa conexão (ex: <code>vendas</code>, <code>atendimento</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="instance-name">Nome da conexão</Label>
            <Input
              id="instance-name"
              autoFocus
              placeholder="ex: vendas-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createMut.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.
            </p>
            {name && !valid && (
              <p className="text-xs text-destructive">
                Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar conexão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ instance, onClose }: { instance: WhatsAppInstance; onClose: () => void }) {
  const initial = (instance.metadata as any)?.display_name || instance.name;
  const [name, setName] = useState<string>(initial);
  const renameMut = useRenameWhatsAppInstanceSelf();

  const valid = name.trim().length >= 2 && name.trim().length <= 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    renameMut.mutate({ id: instance.id, name: name.trim() }, { onSuccess: () => onClose() });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear conexão</DialogTitle>
            <DialogDescription>
              Atualize o nome de exibição desta conexão. O identificador interno permanece o mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="rename-instance">Nome de exibição</Label>
            <Input
              id="rename-instance"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={renameMut.isPending}
            />
            <p className="text-xs text-muted-foreground">Entre 2 e 60 caracteres.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={renameMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || renameMut.isPending}>
              {renameMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsAppInstancesPanel() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: instancesRaw, isLoading } = useWhatsAppInstances();
  const instances = (instancesRaw as WhatsAppInstance[])?.filter(i => (i as any).is_active !== false);

  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  const setDefaultMut = useSetDefaultWhatsAppInstance();
  const disconnectMut = useDisconnectWhatsAppInstance();
  const logoutMut = useLogoutWhatsAppInstance();
  const deleteMut = useDeleteWhatsAppInstanceSelf();
  const syncMut = useSyncWhatsAppInstances();
  const repairWebhookMut = useRepairWhatsAppWebhook();
  const checkWebhookMut = useCheckWhatsAppWebhook();
  const [connecting, setConnecting] = useState<WhatsAppInstance | null>(null);
  const [pausing, setPausing] = useState<WhatsAppInstance | null>(null);
  const [unlinking, setUnlinking] = useState<WhatsAppInstance | null>(null);
  const [renaming, setRenaming] = useState<WhatsAppInstance | null>(null);
  const [deleting, setDeleting] = useState<WhatsAppInstance | null>(null);
  const [creating, setCreating] = useState(false);


  const displayName = (inst: WhatsAppInstance) =>
    (inst.metadata as any)?.display_name || inst.name;

  const isLinked = (s: string) => s === 'connected' || s === 'paired';

  const used = instances?.length ?? 0;
  const limit = effectivePlan?.limits?.max_connections ?? 1;
  const limitReached = used >= limit;

  const handleUpgrade = () => navigate('/admin?tab=plan');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Suas Instâncias de WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            Conecte seus números de WhatsApp escaneando o QR Code com o aparelho.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={limitReached ? 'destructive' : 'secondary'} className="text-sm">
            {used} / {limit} usadas
          </Badge>
          
          <AdminStatusNotificationConfig organizationId={profile?.organization_id} />

          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncMut.mutate(profile?.organization_id)}
            disabled={syncMut.isPending}
            className="gap-2"
            title="Sincronizar status com o servidor"
          >
            <RefreshCw className={`h-4 w-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>

          {limitReached ? (
            <Button onClick={handleUpgrade} size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Upgrade
            </Button>
          ) : (
            <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>
      </div>

      {limitReached && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            Você atingiu o limite de <strong>{limit}</strong> conexão(ões) do seu plano. Faça upgrade para criar mais conexões de WhatsApp.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !instances?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma conexão criada ainda.</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Clique em <strong>Nova conexão</strong> para criar sua primeira instância de WhatsApp.
            </p>
          </CardContent>
        </Card>

      ) : (
        <div className="grid gap-3">
          {instances.map((inst) => (
            <Card key={inst.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                      <Smartphone className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{displayName(inst)}</p>
                        {inst.is_default && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="h-3 w-3" /> Padrão
                          </Badge>
                        )}
                        <StatusBadge status={inst.status} />
                        <WebhookStatusBadge status={inst.webhook_status} />
                      </div>

                      <p className="text-sm text-muted-foreground truncate">
                        {inst.phone_number ? `+${inst.phone_number}` : 'Não conectado ainda'}
                      </p>
                      
                      {/* Indicadores de Saúde e Watchdog */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {inst.is_ghost && (
                          <Badge variant="destructive" className="gap-1 animate-pulse">
                            <Ghost className="h-3 w-3" /> Ghost Connection detectada
                          </Badge>
                        )}
                        {inst.status === 'qr_pending' && !inst.phone_number && (
                          <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/5 gap-1">
                            <AlertTriangle className="h-3 w-3" /> QR necessário
                          </Badge>
                        )}
                        {inst.one_tick_count && inst.one_tick_count > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <Activity className="h-3 w-3" /> {inst.one_tick_count} msgs com 1 traço
                          </Badge>
                        ) : null}
                        
                        {/* Status de Sincronização e Estado Real */}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {inst.last_real_whatsapp_state && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-normal">
                              Estado Real: {inst.last_real_whatsapp_state}
                            </Badge>
                          )}
                          
                          {inst.last_health_at ? (
                            <span className={cn(
                              "text-[10px] flex items-center gap-1",
                              (Date.now() - new Date(inst.last_health_at).getTime() > 120000) 
                                ? "text-amber-600 font-medium" 
                                : "text-muted-foreground"
                            )}>
                              <RefreshCw className={cn("h-2.5 w-2.5", (Date.now() - new Date(inst.last_health_at).getTime() > 120000) && "animate-pulse")} />
                              Verificado em: {new Date(inst.last_health_at).toLocaleTimeString()}
                              {(Date.now() - new Date(inst.last_health_at).getTime() > 120000) && " (Desatualizado)"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Aguardando primeira verificação...</span>
                          )}

                          {inst.last_ack_at && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              • Último ACK: {new Date(inst.last_ack_at).toLocaleTimeString()}
                            </span>
                          )}
                        </div>

                        {/* Informações detalhadas de Webhook */}
                        <div className="flex flex-col gap-1 mt-3 border-t pt-2 border-dashed">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium flex items-center gap-1">
                              <Zap className="h-3.3 w-3.3 text-amber-500" /> Webhook:
                            </span>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[10px] py-0 px-2"
                                onClick={() => checkWebhookMut.mutate(inst.id)}
                                disabled={checkWebhookMut.isPending}
                              >
                                <RefreshCw className={cn("h-3 w-3 mr-1", checkWebhookMut.isPending && "animate-spin")} />
                                Verificar
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-6 text-[10px] py-0 px-2 border-amber-200 bg-amber-50 hover:bg-amber-100"
                                onClick={() => repairWebhookMut.mutate(inst.id)}
                                disabled={repairWebhookMut.isPending}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Reparar Webhook
                              </Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 mt-1">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <History className="h-2.5 w-2.5" /> 
                              Último Evento: {inst.last_webhook_event_at ? new Date(inst.last_webhook_event_at).toLocaleString() : 'Nenhum evento recebido'}
                            </span>
                            {inst.webhook_url && (
                              <span className="text-[10px] text-muted-foreground truncate" title={inst.webhook_url}>
                                <strong>URL:</strong> {inst.webhook_url}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>


                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {!isLinked(inst.status) && (
                      <Button size="sm" onClick={() => setConnecting(inst)}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Conectar
                      </Button>
                    )}
                    {isLinked(inst.status) && (
                      <>
                        <PresenceTestButton instanceId={inst.id} instanceName={displayName(inst)} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPausing(inst)}
                          title="Pausar sessão (mantém o número pareado)"
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Pausar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUnlinking(inst)}
                          className="text-destructive hover:text-destructive"
                          title="Desvincular número (exige novo QR)"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Desvincular
                        </Button>
                      </>
                    )}
                    {!inst.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMut.mutate(inst.id)}
                        disabled={setDefaultMut.isPending}
                        title="Definir como padrão"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming(inst)}
                      title="Editar nome"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(inst)}
                      className="text-destructive hover:text-destructive"
                      title="Excluir conexão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {connecting && (
        <ConnectDialog instance={connecting} onClose={() => setConnecting(null)} />
      )}

      {/* Pausar sessão */}
      <AlertDialog open={!!pausing} onOpenChange={(o) => !o && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar a sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento com o número{' '}
              <strong>{pausing?.phone_number ? `+${pausing.phone_number}` : 'atual'}</strong>{' '}
              é mantido. Ao clicar em <strong>Conectar</strong> novamente, a sessão volta automaticamente
              sem precisar de novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pausing) disconnectMut.mutate(pausing.id);
                setPausing(null);
              }}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pausar sessão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desvincular número */}
      <AlertDialog open={!!unlinking} onOpenChange={(o) => !o && setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular este WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              O número{' '}
              <strong>{unlinking?.phone_number ? `+${unlinking.phone_number}` : 'atual'}</strong>{' '}
              será removido desta instância e desaparecerá da lista de "Aparelhos conectados" no celular.
              Para reconectar (este ou outro número) será necessário escanear um novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinking) logoutMut.mutate(unlinking.id);
                setUnlinking(null);
              }}
              disabled={logoutMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {logoutMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desvincular número
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir conexão (apaga local + UazAPI) */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão <strong>{deleting ? displayName(deleting) : ''}</strong> será removida
              permanentemente, junto com a instância no servidor UazAPI. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteMut.mutate(deleting.id);
                setDeleting(null);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renaming && <RenameDialog instance={renaming} onClose={() => setRenaming(null)} />}

      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
