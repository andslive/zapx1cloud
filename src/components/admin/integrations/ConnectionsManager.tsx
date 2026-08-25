import React, { useState, useMemo, useEffect } from 'react';
import {
  useConnections,
  useSyncConnections,
  useCreateConnection,
  useDeleteConnection,
  useRestartConnection,
  useGetConnectionQr,
  fetchInstanceStatus,
  fetchInstanceQr,
} from '@/hooks/useConnections';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useWhatsAppInstances,
  useSyncWhatsAppInstances,
  useCreateWhatsAppInstanceSelf,
  useConnectWhatsAppInstance,
  useArchiveWhatsAppInstanceSelf,
  useUpdateWhatsAppInstanceOffer,
  useSetConnectionDefaultFunnel,
  useOfficialApiConnections,
  WhatsAppInstance
} from '@/hooks/useWhatsAppInstances';
import { useFunnels } from '@/hooks/useFunnels';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw, MoreVertical, QrCode, Trash2, Info, Loader2, Square, Play, AlertTriangle, User, Search, ArrowUp, ArrowDown, Filter, Pencil, Ghost } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AdminStatusNotificationConfig } from './AdminStatusNotificationConfig';
import { supabase } from '@/integrations/supabase/client';
import type { Funnel } from '@/types/funnel';
import { classifyConnectionForDisplay } from '@/lib/whatsapp/connectionProviderView';
import { classifyAdminConnection } from '@/lib/whatsapp/connectionAdminView';
import {
  classifyThreeChannelConnection,
  countThreeChannelConnections,
  type ThreeChannelConnectionViewModel,
} from '@/lib/whatsapp/connectionAdminView';



const NONE_FUNNEL_VALUE = '__none__';

// Seletor de funil padrão, um por linha/instância — controla exclusivamente
// a evolution_instance passada em `connection`. Nunca resolve por nome: só
// usa connection.id / funnel.id / organization_id.
function ConnectionFunnelSelect({
  connection,
  eligibleFunnels,
  allFunnelsById,
}: {
  connection: WhatsAppInstance;
  eligibleFunnels: Funnel[];
  allFunnelsById: Map<string, Funnel>;
}) {
  const setDefaultFunnelMut = useSetConnectionDefaultFunnel();
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSavingThisRow =
    setDefaultFunnelMut.isPending &&
    setDefaultFunnelMut.variables?.connectionId === connection.id;

  const currentFunnelId = connection.default_funnel_id;
  const currentFunnel = currentFunnelId ? allFunnelsById.get(currentFunnelId) : null;
  const isCurrentInactive = !!currentFunnelId && (!currentFunnel || currentFunnel.status !== 'active');
  const currentValue = currentFunnelId || NONE_FUNNEL_VALUE;
  const currentLabel = currentFunnelId
    ? (currentFunnel ? currentFunnel.name.trim() : 'Funil removido')
    : 'Sem funil configurado';

  // Lista de escolha: só funis elegíveis (ativos, mesma organização, já
  // filtrados pelo caller). Se o funil atual estiver inativo/excluído, ele
  // entra como item extra desabilitado só para não esconder o estado
  // persistido — não pode ser escolhido de novo (nem por esta nem por outra
  // conexão, já que não está em eligibleFunnels).
  const extraCurrentOption =
    currentFunnelId && !eligibleFunnels.some(f => f.id === currentFunnelId)
      ? { id: currentFunnelId, name: currentLabel, inactive: true }
      : null;

  const handleChange = (value: string) => {
    if (isSavingThisRow) return;
    setPendingValue(value);
    setConfirmOpen(true);
  };

  const handleCancelConfirm = () => {
    setConfirmOpen(false);
    setPendingValue(null);
  };

  const handleConfirm = () => {
    const newFunnelId = pendingValue === NONE_FUNNEL_VALUE ? null : pendingValue;
    setDefaultFunnelMut.mutate(
      { connectionId: connection.id, funnelId: newFunnelId },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setPendingValue(null);
        },
        // onError: dialog fica aberto mostrando o erro; Select continua
        // vinculado ao valor persistido (currentValue), então visualmente
        // volta sozinho ao funil anterior — nada de reversão manual/otimista.
      }
    );
  };

  const pendingLabel = pendingValue === NONE_FUNNEL_VALUE
    ? 'Sem funil configurado'
    : (eligibleFunnels.find(f => f.id === pendingValue)?.name.trim()
      || extraCurrentOption?.name
      || pendingValue);

  return (
    <>
      <Select value={currentValue} onValueChange={handleChange} disabled={isSavingThisRow}>
        <SelectTrigger className="h-8 w-full min-w-[180px] max-w-[220px] text-xs">
          {isSavingThisRow ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate block text-left">
                  {currentLabel}
                  {isCurrentInactive && <span className="text-amber-500 ml-1">(Inativo)</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent>{currentLabel}</TooltipContent>
            </Tooltip>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_FUNNEL_VALUE}>Sem funil configurado</SelectItem>
          {extraCurrentOption && (
            <SelectItem value={extraCurrentOption.id} disabled>
              {extraCurrentOption.name} (Inativo)
            </SelectItem>
          )}
          {eligibleFunnels.map(f => (
            <SelectItem key={f.id} value={f.id}>{f.name.trim()}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleCancelConfirm(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Alterar funil de {connection.custom_name || connection.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-left">
                <p><strong>Funil atual:</strong> {currentLabel}</p>
                <p><strong>Novo funil:</strong> {pendingLabel}</p>
                <p className="text-amber-600 dark:text-amber-400">
                  A alteração será aplicada somente a novas conversas. Conversas em andamento continuarão no funil atual.
                </p>
                {pendingValue === NONE_FUNNEL_VALUE && (
                  <p className="text-destructive font-medium">
                    Sem funil configurado, esta conexão passará a usar o fallback legado de Funil &gt; Canais para novas conversas.
                  </p>
                )}
                {setDefaultFunnelMut.isError && (
                  <p className="text-destructive text-xs">
                    Erro ao salvar: {setDefaultFunnelMut.error instanceof Error ? setDefaultFunnelMut.error.message : 'tente novamente'}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm} disabled={setDefaultFunnelMut.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={setDefaultFunnelMut.isPending}>
              {setDefaultFunnelMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar alteração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UazConnectDialog({ instance, onClose }: { instance: WhatsAppInstance; onClose: () => void }) {
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
  }, []);

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

  useEffect(() => {
    if (qr || status === 'connected') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [qr, status]);

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const showError = !qr && status !== 'connected' && elapsed >= 45;
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
              <div className="h-16 w-16 text-green-500 mx-auto flex items-center justify-center rounded-full bg-green-500/10">
                <Play className="h-8 w-8" />
              </div>
              <p className="font-medium">Conectado!</p>
            </div>
          ) : qr ? (
            <div className="bg-white p-3 rounded-lg">
               {isQrBase64 ? (
                <img
                  src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code"
                  className="w-60 h-60"
                />
              ) : (
                <QRCodeCanvas value={qr} size={240} />
              )}
            </div>
          ) : showLoading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {elapsed < 6 ? 'Gerando QR Code…' : 'Aguardando o servidor gerar o QR…'}
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
      </DialogContent>
    </Dialog>
  );
}

export default function ConnectionsManager() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  
  // Chromium / VPS hooks
  const { data: chromiumInstances, isLoading: isLoadingChromium, refetch: refetchChromium } = useConnections();
  const syncChromiumMut = useSyncConnections();
  const createChromiumMut = useCreateConnection();
  const getChromiumQrMut = useGetConnectionQr();
  const deleteChromiumMut = useDeleteConnection();
  const restartChromiumMut = useRestartConnection();

  // UazAPI hooks
  const { data: uazInstances, isLoading: isLoadingUaz, refetch: refetchUaz } = useWhatsAppInstances();
  // FASE 20D — API Oficial buscada separadamente via `instances-api`
  // (nunca embutida na query direta de `evolution_instances` — ver
  // comentário em `useWhatsAppInstances.ts`). `officialApiUnavailable` só é
  // `true` quando a busca falhou de verdade E os retries automáticos do
  // React Query se esgotaram (nunca numa falha transitória isolada) —
  // usado abaixo para nunca converter uma falha em "Não configurada".
  const { byInstanceId: officialApiByInstanceIdRaw, unavailable: officialApiUnavailableGlobal, isLoading: isLoadingOfficialApi } = useOfficialApiConnections();
  const syncUazMut = useSyncWhatsAppInstances();
  const createUazMut = useCreateWhatsAppInstanceSelf();
  // FASE 20H — "Excluir" não faz mais hard delete (ver
  // `whatsapp-proxy/index.ts`, action `archive_instance`): arquiva a
  // conexão, preservando 100% do histórico vinculado.
  const archiveUazMut = useArchiveWhatsAppInstanceSelf();
  const updateOfferMut = useUpdateWhatsAppInstanceOffer();
  const { data: allFunnels, isLoading: isLoadingFunnels } = useFunnels();
  const eligibleFunnels = useMemo(
    () => (allFunnels || []).filter(f => f.status === 'active'),
    [allFunnels]
  );
  const allFunnelsById = useMemo(
    () => new Map((allFunnels || []).map(f => [f.id, f])),
    [allFunnels]
  );

  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [connectingUaz, setConnectingUaz] = useState<WhatsAppInstance | null>(null);
  const [editingOfferUaz, setEditingOfferUaz] = useState<WhatsAppInstance | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [selectedChromiumId, setSelectedChromiumId] = useState<string | null>(null);
  // FASE 20H — conexão selecionada para o modal de arquivamento ("Excluir"
  // → remover da operação, preservando histórico). `null` = modal fechado.
  const [archivingConn, setArchivingConn] = useState<{ id: string; label: string } | null>(null);


  const [newName, setNewName] = useState('');
  const [newOffer, setNewOffer] = useState('');
  const [newCreateUaz, setNewCreateUaz] = useState(true);
  const [newCreateChromium, setNewCreateChromium] = useState(true);
  const [editOffer, setEditOffer] = useState('');

  // Filtering & Sorting states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOffer, setFilterOffer] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterApi, setFilterApi] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  // FASE 20C — filtro independente do terceiro canal (API Oficial). Nunca
  // combinado com os outros dois num único eixo: uma linha pode passar no
  // filtro UazAPI e falhar no filtro API Oficial e vice-versa.
  const [filterOfficial, setFilterOfficial] = useState('all');
  
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null
  });

  useEffect(() => {
    if (searchParams.get('action') === 'new' && !isCreateModalOpen) {
      setIsCreateModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, isCreateModalOpen, setSearchParams]);

  useEffect(() => {
    console.log('Modals state:', { isCreateModalOpen, isQrModalOpen });
  }, [isCreateModalOpen, isQrModalOpen]);

  // Polling da Sessão Web enquanto o modal de QR está aberto
  useEffect(() => {
    if (!isQrModalOpen || !selectedChromiumId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await fetchInstanceStatus(selectedChromiumId);
        if (cancelled) return;
        if (st.connected) {
          toast.success('Sessão Web conectada com sucesso');
          setIsQrModalOpen(false);
          setQrCode(null);
          refetchChromium();
          return;
        }
        if (st.qr_available && !qrCode) {
          try {
            const qr = await fetchInstanceQr(selectedChromiumId);
            if (!cancelled && qr) setQrCode(qr);
          } catch {}
        }
      } catch (e) {
        console.warn('[CHROMIUM_POLL_ERR]', e);
      }
    };
    const interval = setInterval(tick, 8000); // 3s -> 8s (polling do QR/status)
    return () => { cancelled = true; clearInterval(interval); };
  }, [isQrModalOpen, selectedChromiumId, qrCode, refetchChromium]);

  const normalizePhone = (phone: string | null | undefined) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  };

  // Movido para antes de `mergedConnections`/filtros (FASE 20A): o filtro
  // de "Sessão Web" agora reutiliza esta mesma função em vez de duplicar a
  // regra inline — precisa estar declarada antes do useMemo que a usa.
  const isChromiumConnected = (chrom: any) => {
    if (!chrom) return false;
    if (chrom.connected === true) return true;
    const s = String(chrom.chromium_status || chrom.chromiumStatus || chrom.status || '').toLowerCase();
    return s === 'online' || s === 'authenticated' || s === 'ready';
  };

  // FASE 20C — array CANÔNICO e NÃO FILTRADO (sem busca/filtros de UI
  // aplicados). Contadores do topo e view models de 3 canais SEMPRE derivam
  // deste array, nunca do array já filtrado para exibição — caso contrário
  // os contadores mudariam conforme o usuário digitasse na busca ou
  // trocasse um filtro (bug apontado na revisão desta fase). O array
  // filtrado para a TABELA (`mergedConnections`, abaixo) é sempre um
  // subconjunto deste.
  const allMergedConnections = useMemo(() => {
    // FASE 18C — esta tela mescla sessões Chromium (VPS) com conexões
    // UazAPI; não foi projetada para conexões Meta/HookCloud standalone (sem
    // UazAPI correspondente — não têm QR Code Chromium, não têm
    // `instance_token` UazAPI, e as ações desta tabela chamam
    // `whatsapp-proxy` por `id` sem checar provider). Uma linha Meta/HookCloud
    // SEM UazAPI continua excluída aqui na origem — decisão de escopo
    // preservada da Fase 18C (nenhuma ação UazAPI pode vazar para uma linha
    // que não tem canal UazAPI); hoje isso não esconde nenhum dado real (0
    // linhas `provider='meta_cloud'` em produção). O que MUDA nesta fase:
    // uma linha UazAPI que TEM uma API Oficial em coexistência
    // (`meta_cloud_config` embutido na própria linha via FK
    // `evolution_instances_meta_cloud.evolution_instance_id`) agora carrega
    // esse dado adiante em vez de descartá-lo — é isso que alimenta a nova
    // coluna "API Oficial".
    //
    // LIMITAÇÃO DE ESCOPO DOCUMENTADA (revisão desta fase, Codex): o
    // compositor `classifyThreeChannelConnection` (`connectionAdminView.ts`)
    // já sabe classificar uma linha `provider='meta_cloud'` standalone (sem
    // UazAPI) como "Somente API Oficial" — testado isoladamente — mas essa
    // linha nunca chega até aqui, porque o menu de Ações desta tabela
    // (`QR UazAPI`, `Conectar/Reiniciar/Excluir Sessão Web`, `Excluir`) não
    // foi auditado/reforçado nesta fase para lidar com `conn.uaz === null &&
    // conn.chromium === null` sem risco de erro em runtime (ex.:
    // `setConnectingUaz(null)` abrindo o modal de QR sem instância). Como
    // hoje existem 0 linhas `provider='meta_cloud'` reais em produção, isso
    // não esconde nenhum dado real agora — é uma decisão deliberada de não
    // arriscar uma regressão de UI por um caminho ainda não exercitado, não
    // um esquecimento. Reforçar o menu de Ações para esse caso é o trabalho
    // recomendado para destravar isso numa fase futura dedicada.
    // FASE 20D — `meta_cloud_config` não vem mais embutido em `u` (removido
    // de `useWhatsAppInstances` por falta de GRANT SELECT na tabela
    // satélite); `classifyConnectionForDisplay` só usa `provider` para essa
    // decisão (nunca `meta_cloud_config`), então passar `undefined` aqui é
    // seguro e não muda esse comportamento.
    const uaz = (uazInstances || []).filter((u) => classifyConnectionForDisplay(u, undefined) === 'uazapi');
    const chrom = chromiumInstances || [];
    const officialApiByInstanceId = officialApiByInstanceIdRaw;
    const officialApiFetchOk = !officialApiUnavailableGlobal;

    console.log('[AUDIT] UAZAPI CONNECTIONS', { count: uaz.length, items: uaz });
    console.log('[AUDIT] MANAGER CONNECTIONS', { count: chrom.length, items: chrom });

    const results: any[] = [];
    const processedChromiumIds = new Set<string>();


    uaz.forEach(u => {
      const uPhone = normalizePhone(u.phone_number);
      const uNames = [u.name, u.instance_id, u.custom_name]
        .filter(Boolean)
        .map((s: string) => String(s).toLowerCase().trim());
      const matchingChrom = chrom.find(c => {
        if ((u as any).chromium_instance_id && c.id === (u as any).chromium_instance_id) return true;
        const cPhone = normalizePhone(c.chromium_number || c.number || c.phone_number);
        if (uPhone && cPhone && uPhone === cPhone) return true;
        const cName = String(c.name || '').toLowerCase().trim();
        return cName && uNames.includes(cName);
      });

      if (matchingChrom) {
        processedChromiumIds.add(matchingChrom.id);
      }

      results.push({
        id: u.id,
        name: u.custom_name || u.name,
        uaz: u,
        chromium: matchingChrom || null,
        // FASE 20D — registro satélite da API Oficial buscado via
        // `instances-api?action=officialApi` (nunca embutido diretamente na
        // query de `evolution_instances` — ver `useWhatsAppInstances.ts`),
        // mesclado aqui por `evolution_instance_id` (chave da FK composta
        // `evolution_instances_meta_cloud.evolution_instance_id ->
        // evolution_instances.id`, que também inclui `organization_id`).
        officialApi: officialApiByInstanceId.get(u.id) || null,
        officialApiUnavailable: !officialApiFetchOk,
        type: 'uaz-first',
        isOrphan: false,
        offer_name: u.offer_name || '---',
        phone: u.phone_number || matchingChrom?.chromium_number || matchingChrom?.number || '',
        push_name: u.push_name || '---',
        uaz_status: u.status,
        chrom_status: matchingChrom?.chromium_status || matchingChrom?.status || 'offline'
      });
    });

    chrom.forEach(c => {
      if (!processedChromiumIds.has(c.id)) {
        results.push({
          id: c.id,
          name: c.name,
          uaz: null,
          chromium: c,
          officialApi: null,
          officialApiUnavailable: !officialApiFetchOk,
          type: 'chromium-only',
          isOrphan: true,
          offer_name: '---',
          phone: c.chromium_number || c.number || '',
          push_name: '---',
          uaz_status: 'offline',
          chrom_status: c.chromium_status || c.status || 'offline'
        });
      }
    });

    console.log('[AUDIT] FINAL TABLE (unfiltered)', { count: results.length, items: results });
    return results;
  }, [uazInstances, chromiumInstances, officialApiByInstanceIdRaw, officialApiUnavailableGlobal]);

  // FASE 20C — view models de 3 canais, SEMPRE derivados do array canônico
  // não filtrado (`allMergedConnections`). Contadores do topo e o filtro de
  // "Status Geral"/UazAPI/Sessão Web/API Oficial usam este MESMO array —
  // nunca uma contagem separada que possa divergir da tabela.
  const threeChannelViewModels: ThreeChannelConnectionViewModel[] = useMemo(
    () =>
      allMergedConnections.map((conn: any) =>
        classifyThreeChannelConnection({
          rowId: conn.id,
          organizationId: conn.uaz?.organization_id ?? profile?.organization_id ?? null,
          offerLabel: conn.offer_name && conn.offer_name !== '---' ? conn.offer_name : null,
          whatsappIdentity: conn.push_name && conn.push_name !== '---' ? conn.push_name : null,
          uazapi: conn.uaz,
          webSession: conn.chromium,
          webSessionId: conn.chromium?.id ?? null,
          officialApi: conn.officialApi,
          officialApiConnectionId: conn.officialApi ? conn.id : null,
          officialApiUnavailable: conn.officialApiUnavailable,
          activeFunnel: conn.uaz?.default_funnel_id ?? null,
        }),
      ),
    [allMergedConnections, profile?.organization_id],
  );
  const threeChannelByRowId = useMemo(() => {
    const map = new Map<string, ThreeChannelConnectionViewModel>();
    threeChannelViewModels.forEach((vm) => map.set(vm.rowId, vm));
    return map;
  }, [threeChannelViewModels]);

  const mergedConnections = useMemo(() => {
    let results: any[] = allMergedConnections;

    // Apply Search Filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      results = results.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.offer_name && c.offer_name.toLowerCase().includes(search)) ||
        (c.push_name && c.push_name.toLowerCase().includes(search)) ||
        c.phone.includes(search)
      );
    }

    // Apply Offer Filter
    if (filterOffer !== 'all') {
      results = results.filter(c => c.offer_name === filterOffer);
    }

    // FASE 20C — filtro de "Status Geral" agora usa o MESMO `overallStatus`
    // de 3 canais exibido na coluna/badge (antes comparava só
    // `technicalStatus` da UazAPI, divergindo do que a coluna "Status
    // Geral" realmente mostrava — ex.: uma linha "Parcial" ou "Somente
    // Sessão Web" caía sempre no filtro "Offline").
    if (filterStatus !== 'all') {
      results = results.filter(c => {
        const vm = threeChannelByRowId.get(c.id);
        if (!vm) return false;
        switch (filterStatus) {
          case 'online': return vm.overallStatus === 'Online';
          case 'partial': return vm.overallStatus === 'Parcial';
          case 'offline': return vm.overallStatus === 'Offline' || vm.overallStatus === 'Sem canais configurados';
          case 'uazapi_only': return vm.overallStatus === 'Somente UazAPI';
          case 'websession_only': return vm.overallStatus === 'Somente Sessão Web';
          case 'official_only': return vm.overallStatus === 'Somente API Oficial';
          default: return true;
        }
      });
    }

    // Apply API Filter (status técnico da UazAPI — mesma regra do classificador canônico)
    if (filterApi !== 'all') {
      results = results.filter(c => {
        const vm = classifyAdminConnection(c.uaz, c.chromium);
        return filterApi === 'online' ? vm.technicalStatus === 'online' : vm.technicalStatus !== 'online';
      });
    }

    // Apply Session Filter — Chromium é um canal auxiliar independente;
    // este filtro olha SÓ o estado do Chromium (mesma regra da coluna
    // "Sessão Web"), sem exigir que a UazAPI também esteja conectada.
    if (filterSession !== 'all') {
      results = results.filter(c => {
        const isChromOnline = isChromiumConnected(c.chromium);
        return filterSession === 'online' ? isChromOnline : !isChromOnline;
      });
    }

    // FASE 20C — filtro independente do terceiro canal (API Oficial), usando
    // o MESMO view model de 3 canais da coluna/contadores.
    if (filterOfficial !== 'all') {
      results = results.filter(c => {
        const vm = threeChannelByRowId.get(c.id);
        if (!vm) return false;
        if (filterOfficial === 'hookcloud') return vm.officialApiSource === 'hookcloud';
        if (filterOfficial === 'meta_direct') return vm.officialApiSource === 'direct_meta';
        if (filterOfficial === 'online') return vm.officialApiStatus === 'Online';
        if (filterOfficial === 'pending') return vm.officialApiStatus === 'Pendente';
        if (filterOfficial === 'offline') return vm.officialApiStatus === 'Offline' || vm.officialApiStatus === 'Erro';
        if (filterOfficial === 'not_configured') return vm.officialApiStatus === 'Não configurada';
        return true;
      });
    }

    // Apply Sorting
    if (sortConfig.key && sortConfig.direction) {
      results = [...results].sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
          case 'name': valA = a.name; valB = b.name; break;
          case 'offer': valA = a.offer_name; valB = b.offer_name; break;
          case 'whatsapp': valA = a.push_name; valB = b.push_name; break;
          case 'number': valA = a.phone; valB = b.phone; break;
          case 'status': {
            // FASE 20C — ordena pelo Status Geral de 3 canais (mesmo
            // overallStatus exibido na coluna), não mais pela heurística XOR
            // UazAPI/Chromium antiga.
            const OVERALL_RANK: Record<string, number> = {
              'Online': 5,
              'Somente UazAPI': 4,
              'Somente Sessão Web': 4,
              'Somente API Oficial': 4,
              'Parcial': 3,
              'Offline': 2,
              'Sem canais configurados': 1,
            };
            const rankOf = (c: any) => OVERALL_RANK[threeChannelByRowId.get(c.id)?.overallStatus ?? ''] ?? 0;
            valA = rankOf(a);
            valB = rankOf(b);
            break;
          }
          default: valA = a[sortConfig.key] || ''; valB = b[sortConfig.key] || '';
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    console.log('[AUDIT] FINAL TABLE (filtrada para exibição)', { count: results.length, items: results });
    return results;
  }, [allMergedConnections, searchTerm, filterOffer, filterStatus, filterApi, filterSession, filterOfficial, sortConfig, threeChannelByRowId]);


  const handleSyncAll = async () => {
    // 1. Buscar status das instâncias UazAPI pela integração oficial do Lovable
    syncUazMut.mutate(profile?.organization_id, {
      onSuccess: () => {
        refetchUaz();
      }
    });

    // 2. Buscar status Chromium na VPS (GET https://api.x1zap.cloud/connections/instances)
    // Isso atualiza a coluna Sessão Web/Chromium
    await refetchChromium();
    
    toast.success('Sincronização concluída');
  };

  const handleCreate = async () => {
    if (!newName) return;
    if (!newCreateUaz && !newCreateChromium) {
      toast.error('Selecione pelo menos um tipo de conexão (API Principal ou Sessão Web).');
      return;
    }

    const closeAndReset = () => {
      setIsCreateModalOpen(false);
      setNewName('');
      setNewOffer('');
      setNewCreateUaz(true);
      setNewCreateChromium(true);
    };

    const tasks: Promise<any>[] = [];
    if (newCreateUaz) {
      tasks.push(
        createUazMut.mutateAsync({ name: newName, offer_name: newOffer })
          .then(() => refetchUaz())
          .catch((err) => console.error('[CREATE_UAZ_ERROR]', err))
      );
    }
    if (newCreateChromium) {
      tasks.push(
        createChromiumMut.mutateAsync({ name: newName })
          .then((data: any) => {
            refetchChromium();
            if (data?.id) handleShowChromiumQr(data.id);
          })
          .catch((err) => console.error('[CREATE_CHROMIUM_ERROR]', err))
      );
    }
    await Promise.allSettled(tasks);
    closeAndReset();
  };

  const handleShowChromiumQr = async (connId: string) => {
    setQrCode(null);
    setSelectedChromiumId(connId);
    try {
      const status = await fetchInstanceStatus(connId);
      console.log('[CHROMIUM_STATUS]', status);
      if (status.connected) {
        toast.success('Sessão Web já conectada');
        refetchChromium();
        return;
      }
      setIsQrModalOpen(true);
      if (status.qr_available) {
        try {
          const qr = await fetchInstanceQr(connId);
          if (qr) setQrCode(qr);
        } catch (e) {
          console.warn('[QR_FETCH_ERR]', e);
        }
      }
      // fallback adicional via hook (cobre managers sem endpoint /qr dedicado)
      if (!qrCode) {
        getChromiumQrMut.mutate(connId, {
          onSuccess: (data) => { if (data?.qr) setQrCode(data.qr); },
        });
      }
    } catch (err: any) {
      console.error('[CHROMIUM_STATUS_ERR]', err);
      toast.error('Não foi possível consultar a Sessão Web.');
    }
  };

  const handleStartChromium = (name: string, existingChromiumId?: string | null) => {
    // Guard: se já existe instância Chromium vinculada, apenas abre o QR (não duplica).
    if (existingChromiumId) {
      handleShowChromiumQr(existingChromiumId);
      return;
    }
    const existing = (chromiumInstances || []).find(
      (c: any) => String(c.name || '').toLowerCase().trim() === String(name || '').toLowerCase().trim()
    );
    if (existing?.id) {
      console.log('[CHROMIUM_REUSE]', { name, id: existing.id });
      handleShowChromiumQr(existing.id);
      return;
    }
    createChromiumMut.mutate({ name }, {
      onSuccess: (data: any) => {
        toast.success('Iniciando sessão Chromium...');
        refetchChromium();
        if (data?.id) {
          handleShowChromiumQr(data.id);
        }
      }
    });
  };

  const formatBrazilianPhone = (value: string | undefined | null) => {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, "");
    if (digits.length >= 12 && digits.startsWith("55")) {
      const ddd = digits.slice(2, 4);
      const part1 = digits.length === 13 ? digits.slice(4, 9) : digits.slice(4, 8);
      const part2 = digits.length === 13 ? digits.slice(9) : digits.slice(8);
      return `+55 ${ddd} ${part1}-${part2}`;
    }
    return value;
  };

  // FASE 20A — corrige o bug em que "Status Geral" era um XOR entre UazAPI
  // e Chromium: uma UazAPI saudável sem Sessão Web virava "Parcial", e uma
  // UazAPI offline com Sessão Web viva também virava "Parcial", escondendo
  // que a conexão real (UazAPI) estava fora do ar. Chromium é um canal
  // auxiliar (VPS `api.x1zap.cloud`) e nunca determina o status geral de
  // uma conexão UazAPI — ver `src/lib/whatsapp/connectionAdminView.ts`.
  // FASE 20C — Status Geral agora vem do compositor de 3 canais
  // (`overallStatus`), que nunca deixa a ausência de um canal opcional
  // (Sessão Web/API Oficial) reduzir o status de outro canal configurado e
  // operacional — ver matriz completa em `computeOverallStatus`.
  const getGeneralStatus = (conn: any) => {
    const vm = threeChannelByRowId.get(conn.id);
    if (!vm) {
      return (
        <Badge variant="outline" className="text-muted-foreground" title="Sem view model resolvido para esta linha">
          Desconhecido
        </Badge>
      );
    }
    switch (vm.overallStatus) {
      case 'Online':
        return <Badge className="bg-green-500" title={vm.overallStatusReason}>Online</Badge>;
      case 'Parcial':
        return <Badge className="bg-yellow-500 text-black" title={vm.overallStatusReason}>Parcial</Badge>;
      case 'Somente UazAPI':
        return <Badge className="bg-green-500" title={vm.overallStatusReason}>Somente UazAPI</Badge>;
      case 'Somente Sessão Web':
        return <Badge className="bg-green-500" title={vm.overallStatusReason}>Somente Sessão Web</Badge>;
      case 'Somente API Oficial':
        return <Badge className="bg-green-500" title={vm.overallStatusReason}>Somente API Oficial</Badge>;
      case 'Sem canais configurados':
        return (
          <Badge variant="outline" className="text-muted-foreground" title={vm.overallStatusReason}>
            Sem canais configurados
          </Badge>
        );
      case 'Offline':
      default:
        return <Badge variant="destructive" title={vm.overallStatusReason}>Offline</Badge>;
    }
  };

  // Detecta duplicidades por número (visível — não oculta nada). Usa o
  // array CANÔNICO não filtrado — duplicidade é uma propriedade dos dados,
  // não deveria sumir/aparecer conforme o usuário filtra a tabela.
  const duplicatePhoneGroups = useMemo(() => {
    const byPhone = new Map<string, any[]>();
    allMergedConnections.forEach((c: any) => {
      const phone = String(c.phone || '').replace(/\D/g, '');
      if (!phone) return;
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone)!.push(c);
    });
    const groups: { phone: string; rows: any[] }[] = [];
    byPhone.forEach((rows, phone) => { if (rows.length > 1) groups.push({ phone, rows }); });
    return groups;
  }, [allMergedConnections]);

  // FASE 20D — inclui o carregamento inicial de API Oficial no gate geral
  // de loading da tela: sem isso, `officialApiResult` fica `undefined`
  // durante o primeiro fetch e cada linha marcaria `officialApiUnavailable:
  // true` (correto para nunca mentir "Não configurada"), mas a tabela
  // renderizaria momentaneamente um "flash" de "Dados indisponíveis" antes
  // da resposta real chegar. Esperar o loading inicial evita esse flash
  // sem reintroduzir o problema original (a distinção erro-real vs.
  // "Não configurada" continua intacta para qualquer falha PÓS-loading).
  const isLoading = isLoadingUaz || isLoadingChromium || isLoadingOfficialApi;

  // FASE 20C — "Total"/"Limite"/contadores do topo contam só conexões
  // REGISTRADAS (linhas com `conn.uaz` real — mesmo escopo que "Ativas"
  // usava antes da Fase 20C: `evolution_instances` cadastradas), nunca
  // órfãs de Chromium sem UazAPI correspondente (que não ocupam vaga no
  // plano). Derivado do array completo NÃO FILTRADO
  // (`allMergedConnections`/`threeChannelViewModels`), nunca do array já
  // filtrado para exibição — para que os contadores do cabeçalho nunca
  // divirjam da tabela nem mudem silenciosamente conforme o usuário digita
  // na busca/filtra colunas. "Operacionais" = linha com PELO MENOS UM canal
  // esperado online (mesma regra usada para decidir "Somente X"/"Online"/
  // "Parcial" no `overallStatus`) — nunca conta ausência de API Oficial
  // como "offline".
  const registeredRowIds = useMemo(
    () => new Set(allMergedConnections.filter((c: any) => !!c.uaz).map((c: any) => c.id)),
    [allMergedConnections],
  );
  const registeredThreeChannelViewModels = useMemo(
    () => threeChannelViewModels.filter((vm) => registeredRowIds.has(vm.rowId)),
    [threeChannelViewModels, registeredRowIds],
  );
  const threeChannelCounts = useMemo(
    () => countThreeChannelConnections(registeredThreeChannelViewModels),
    [registeredThreeChannelViewModels],
  );
  const used = threeChannelCounts.operational;
  const limit = effectivePlan?.limits?.max_connections ?? 1;
  const limitReached = threeChannelCounts.total >= limit;

  const uniqueOffers = useMemo(() => {
    const offers = new Set<string>();
    uazInstances?.forEach(u => {
      if (u.offer_name) offers.add(u.offer_name);
    });
    return Array.from(offers).sort();
  }, [uazInstances]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' };
        if (current.direction === 'desc') return { key: '', direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUp className="h-3 w-3 ml-1 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conexões</h1>
          <p className="text-muted-foreground">Gerencie suas instâncias de WhatsApp (UazAPI) e sessões Web (Chromium).</p>
        </div>
        <div className="flex items-center gap-3">
          {/* FASE 20C — "Operacionais" conta linhas com PELO MENOS UM canal
              esperado online (mesma regra de `overallStatus` !== "Offline"/
              "Sem canais configurados"). Ausência de API Oficial NUNCA conta
              como "offline" no agregado — hoje "API Oficial online" é
              sempre 0 (nenhuma conexão real), o que é o estado esperado, não
              um erro. Offline/Total/Limite ficam separados e explícitos
              (produção real: ~10 operacionais, ~6 offline intencionalmente,
              16 cadastradas, limite do plano à parte). */}
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge className="bg-green-500 py-1 px-2.5">Operacionais: {used}</Badge>
            <Badge variant="destructive" className="py-1 px-2.5">Offline: {threeChannelCounts.offline}</Badge>
            <Badge variant="outline" className="py-1 px-2.5" title="Conexões UazAPI com heartbeat CONNECTED">
              UazAPI online: {threeChannelCounts.uazapiOnline}
            </Badge>
            <Badge variant="outline" className="py-1 px-2.5" title="Sessões Web (Chromium) conectadas">
              Sessões Web online: {threeChannelCounts.webSessionOnline}
            </Badge>
            <Badge variant="outline" className="py-1 px-2.5" title="Conexões API Oficial (HookCloud/Meta Cloud) ativas — hoje sempre 0, nenhuma conexão real configurada">
              API Oficial online: {threeChannelCounts.officialApiOnline}
            </Badge>
            <Badge variant="secondary" className="py-1 px-2.5">Total: {threeChannelCounts.total}</Badge>
            <Badge variant={limitReached ? 'destructive' : 'outline'} className="py-1 px-2.5" title="Limite de conexões do plano/organização">
              Limite: {limit}
            </Badge>
          </div>

          <AdminStatusNotificationConfig organizationId={profile?.organization_id} />

          {/* FASE 20B — botão "Simular Queda" (SimulateOutageModal) removido
              da UI de produção: toda a ação chamava
              `simulate_connection_status_change` via `whatsapp-proxy`, ação
              sem handler correspondente (404 "Action not found").
              Reimplementar exigiria deploy de Edge Function, fora do escopo
              desta fase. */}

          {/* FASE 20C — botão "Limpar Órfãos" removido da UI de produção:
              ação destrutiva (DELETE permanente na VPS Chromium por linha),
              sem dry-run, sem preview individual, só um `confirm()` agregado
              — e o modelo de associação UazAPI↔Chromium usado para detectar
              "órfã" está sendo corrigido/documentado nesta mesma fase (ver
              risco residual em `connectionAdminView.ts`). Backend não foi
              alterado. */}

          <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncUazMut.isPending || syncChromiumMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${(syncUazMut.isPending || syncChromiumMut.isPending) ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
          <Button size="sm" onClick={() => setIsCreateModalOpen(true)} disabled={limitReached}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Conexão
          </Button>
        </div>
      </div>

      {duplicatePhoneGroups.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            {duplicatePhoneGroups.length} número(s) com conexões duplicadas — corrigir no servidor api.x1zap.cloud
          </div>
          <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
            {duplicatePhoneGroups.map(g => (
              <li key={g.phone}>
                <span className="font-mono">{formatBrazilianPhone(g.phone) || g.phone}</span>
                {' → '}
                {g.rows.map((r: any) => r.name).join(', ')}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
            Ver <code>docs/CONNECTIONS_X1ZAP_FIX_DOSSIER.md</code> seção 6 para o SQL de reconciliação.
          </p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-lg border">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, oferta, número..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={filterOffer} onValueChange={setFilterOffer}>
            <SelectTrigger className="w-full md:w-[150px]">
              <Filter className="h-3 w-3 mr-2" />
              <SelectValue placeholder="Oferta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Ofertas</SelectItem>
              {uniqueOffers.map(offer => (
                <SelectItem key={offer} value={offer}>{offer}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full md:w-[170px]">
              <SelectValue placeholder="Status Geral" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status Geral</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="uazapi_only">Somente UazAPI</SelectItem>
              <SelectItem value="websession_only">Somente Sessão Web</SelectItem>
              <SelectItem value="official_only">Somente API Oficial</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterApi} onValueChange={setFilterApi}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Status UazAPI" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status UazAPI</SelectItem>
              <SelectItem value="online">UazAPI Online</SelectItem>
              <SelectItem value="offline">UazAPI Offline/Conectando</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSession} onValueChange={setFilterSession}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Sessão Web (auxiliar)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Sessões Web</SelectItem>
              <SelectItem value="online">Sessão Web Online</SelectItem>
              <SelectItem value="offline">Sessão Web Offline</SelectItem>
            </SelectContent>
          </Select>

          {/* FASE 20C — filtro independente do terceiro canal. Nunca
              combinado com UazAPI/Sessão Web num único eixo. */}
          <Select value={filterOfficial} onValueChange={setFilterOfficial}>
            <SelectTrigger className="w-full md:w-[170px]">
              <SelectValue placeholder="API Oficial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas API Oficial</SelectItem>
              <SelectItem value="online">API Oficial Online</SelectItem>
              <SelectItem value="pending">API Oficial Pendente</SelectItem>
              <SelectItem value="offline">API Oficial Offline/Erro</SelectItem>
              <SelectItem value="not_configured">API Oficial Não configurada</SelectItem>
              <SelectItem value="hookcloud">Origem: HookCloud</SelectItem>
              <SelectItem value="meta_direct">Origem: Meta direta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Avatar</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                <div className="flex items-center">Nome Instância <SortIcon column="name" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('offer')}>
                <div className="flex items-center">Oferta <SortIcon column="offer" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('whatsapp')}>
                <div className="flex items-center">Nome WhatsApp <SortIcon column="whatsapp" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('number')}>
                <div className="flex items-center">Número <SortIcon column="number" /></div>
              </TableHead>
              <TableHead>UazAPI</TableHead>
              <TableHead>Sessão Web</TableHead>
              <TableHead>API Oficial</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
                <div className="flex items-center">Status Geral <SortIcon column="status" /></div>
              </TableHead>
              <TableHead>Funil ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : mergedConnections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                  Nenhuma conexão encontrada.
                </TableCell>
              </TableRow>
            ) : (
              mergedConnections.map((conn) => {
                // FASE 20B — a coluna "Status UazAPI" usa o MESMO
                // classificador canônico da coluna "Status Geral"
                // (`classifyAdminConnection`), em vez de reimplementar a
                // regra inline: antes as duas colunas podiam divergir (ex.:
                // heartbeat "UNKNOWN" virava "⚪ Não conectada" aqui, sem
                // nenhuma distinção do "DISCONNECTED" confirmado).
                const uazVm = conn.uaz ? classifyAdminConnection(conn.uaz, conn.chromium) : null;
                const chromStatus = String(
                  conn.chromium?.chromium_status || conn.chromium?.chromiumStatus || conn.chromium?.status || ''
                ).toLowerCase();
                const isWebConnected = isChromiumConnected(conn.chromium);
                const isChromAlive = chromStatus === 'online' || chromStatus === 'authenticated' || chromStatus === 'ready' || chromStatus === 'qr_pending' || chromStatus === 'qr' || chromStatus === 'pairing';
                // Ghost: processo vivo, mas sem sessão conectada e sem estar em QR/pairing
                const isGhostConnection = isChromAlive && !isWebConnected && !(chromStatus === 'qr_pending' || chromStatus === 'qr' || chromStatus === 'pairing');
                const isRealWebConnected = isWebConnected;
                
                // Avatar logic: prioritizing UazAPI real photo
                const avatarUrl = conn.uaz?.profile_picture_url || conn.uaz?.metadata?.profile_picture || conn.uaz?.metadata?.avatar;
                const initials = (conn.uaz?.custom_name || conn.name || '??').substring(0, 2).toUpperCase();

                return (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <Avatar className="h-10 w-10 border rounded-full overflow-hidden">
                        <AvatarImage src={avatarUrl} alt={conn.name} className="object-cover h-full w-full" />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <User className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{conn.uaz?.custom_name || conn.name}</span>
                        {conn.isOrphan && (
                          <Badge
                            variant="destructive"
                            className="w-fit text-[10px] h-4 mt-1"
                            title="Sessão Web (Chromium/VPS) sem instância UazAPI correspondente em evolution_instances — não é um provider, é uma pendência de vínculo."
                          >
                            Sessão Web sem UazAPI
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {conn.offer_name || '---'}
                    </TableCell>
                    <TableCell>{conn.uaz?.push_name || '---'}</TableCell>
                    <TableCell>
                      {formatBrazilianPhone(conn.uaz?.phone_number || conn.chromium?.chromium_number || conn.chromium?.number) || '---'}
                    </TableCell>
                    <TableCell>
                      {!uazVm ? (
                        <Badge variant="outline" className="text-muted-foreground">— Sem UazAPI —</Badge>
                      ) : uazVm.displayStatus === 'Online' ? (
                        <Badge className="bg-green-500 cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)} title={uazVm.statusReason}>
                          🟢 UazAPI Online
                        </Badge>
                      ) : uazVm.displayStatus === 'Conectando' ? (
                        <Badge className="bg-yellow-500 text-black cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)} title={uazVm.statusReason}>
                          🟡 Conectando
                        </Badge>
                      ) : uazVm.isUnconfirmedOffline ? (
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-600 dark:text-amber-400 cursor-pointer"
                            onClick={() => setConnectingUaz(conn.uaz)}
                            title={uazVm.statusReason}
                          >
                            ⚪ Offline — sem resposta atual
                          </Badge>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-muted-foreground cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)} title={uazVm.statusReason}>
                            ⚪ Não conectada
                          </Badge>
                          {conn.uaz?.last_health_at && (new Date().getTime() - new Date(conn.uaz.last_health_at).getTime() > 120000) && (
                            <span className="text-[10px] text-amber-500 font-medium animate-pulse">⚠️ Status desatualizado</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRealWebConnected ? (
                        <Badge className="bg-green-500 cursor-pointer" onClick={() => handleShowChromiumQr(conn.chromium?.id)}>
                          🟢 Online
                        </Badge>
                      ) : (chromStatus === 'qr_pending' || chromStatus === 'qr' || chromStatus === 'pairing') ? (
                        <Badge className="bg-yellow-500 text-black cursor-pointer" onClick={() => handleShowChromiumQr(conn.chromium?.id)}>
                          🟡 Aguardando QR
                        </Badge>
                      ) : isGhostConnection ? (
                        <Badge variant="destructive" className="gap-1 animate-pulse cursor-pointer" onClick={() => handleShowChromiumQr(conn.chromium?.id)}>
                          <Ghost className="h-3 w-3" /> Ghost
                        </Badge>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className="text-muted-foreground cursor-pointer" 
                          onClick={() => {
                            if (conn.chromium?.id) handleShowChromiumQr(conn.chromium.id);
                            else handleStartChromium(conn.uaz?.name || conn.name, conn.chromium?.id);
                          }}
                        >
                          ⚪ Offline
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* FASE 20C — coluna independente. "Não configurada"
                          nunca é tratada como falha; hoje é o estado
                          esperado nas 16 conexões (0 conexões reais de API
                          Oficial em produção). */}
                      {(() => {
                        const vm = threeChannelByRowId.get(conn.id);
                        if (!vm) return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
                        switch (vm.officialApiStatus) {
                          case 'Online':
                            return <Badge className="bg-green-500" title={vm.officialApiStatusReason}>🟢 Online</Badge>;
                          case 'Pendente':
                            return <Badge className="bg-yellow-500 text-black" title={vm.officialApiStatusReason}>🟡 Pendente</Badge>;
                          case 'Erro':
                            return <Badge variant="destructive" title={vm.officialApiStatusReason}>Erro</Badge>;
                          case 'Offline':
                            return <Badge variant="destructive" title={vm.officialApiStatusReason}>Offline</Badge>;
                          case 'Dados indisponíveis':
                            // FASE 20D — núcleo da correção de segurança:
                            // uma falha ao CONSULTAR a API Oficial (permissão/
                            // rede/backend) precisa aparecer visualmente
                            // distinta de "Não configurada" — nunca cair no
                            // `default` abaixo, que afirmaria (incorretamente)
                            // que não existe nenhuma conexão configurada.
                            return (
                              <Badge variant="destructive" className="gap-1" title={vm.officialApiStatusReason}>
                                <AlertTriangle className="h-3 w-3" /> Dados indisponíveis
                              </Badge>
                            );
                          case 'Não configurada':
                          default:
                            return (
                              <Badge variant="outline" className="text-muted-foreground" title={vm.officialApiStatusReason}>
                                Não configurada
                              </Badge>
                            );
                        }
                      })()}
                    </TableCell>
                    <TableCell>{getGeneralStatus(conn)}</TableCell>
                    <TableCell>
                      {conn.uaz ? (
                        isLoadingFunnels ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" /> Carregando funis...
                          </span>
                        ) : (
                          <ConnectionFunnelSelect
                            connection={conn.uaz}
                            eligibleFunnels={eligibleFunnels}
                            allFunnelsById={allFunnelsById}
                          />
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {conn.uaz && (
                            <>
                              {/* FASE 20B — "Editar Nome Instância" removida da UI de
                                  produção: chamava `rename_instance_self` via
                                  `useRenameWhatsAppInstanceSelf()`, ação sem handler
                                  em `supabase/functions/whatsapp-proxy/index.ts`
                                  (retornaria 404 "Action not found"). Reimplementar
                                  exigiria deploy de Edge Function, fora do escopo
                                  desta fase. */}
                              <DropdownMenuItem onClick={() => {
                                setEditingOfferUaz(conn.uaz);
                                setEditOffer(conn.uaz.offer_name || '');
                                setIsOfferModalOpen(true);
                              }}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar Oferta
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => setConnectingUaz(conn.uaz)}>
                            <QrCode className="h-4 w-4 mr-2" /> QR UazAPI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            if (conn.chromium?.id) handleShowChromiumQr(conn.chromium.id);
                            else handleStartChromium(conn.uaz?.name || conn.name, conn.chromium?.id);
                          }}>
                            <QrCode className="h-4 w-4 mr-2" /> Conectar Sessão Web
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!conn.chromium?.id || restartChromiumMut.isPending}
                            onClick={() => {
                              if (!conn.chromium?.id) return;
                              restartChromiumMut.mutate(conn.chromium.id, {
                                onSuccess: () => refetchChromium(),
                              });
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" /> Reiniciar Sessão Web
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            disabled={!conn.chromium?.id || deleteChromiumMut.isPending}
                            onClick={() => {
                              if (!conn.chromium?.id) return;
                              if (!confirm('Excluir apenas a Sessão Web (Chromium VPS) desta conexão?')) return;
                              deleteChromiumMut.mutate(conn.chromium.id, {
                                onSuccess: () => refetchChromium(),
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir Sessão Web
                          </DropdownMenuItem>
                          {/* FASE 20H — "Excluir" não faz mais hard delete: abre um
                              modal de confirmação que explica honestamente que a
                              conexão será removida da operação com o histórico
                              preservado, e só então chama `archive_instance`
                              (nunca `delete_instance_self`). */}
                          <DropdownMenuItem
                            className="text-destructive"
                            disabled={!conn.uaz}
                            onClick={() => {
                              if (!conn.uaz) return;
                              setArchivingConn({
                                id: conn.uaz.id,
                                label: conn.uaz.custom_name || conn.uaz.name || conn.name,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* FASE 20H — modal "Remover conexão da operação" (arquivamento, nunca
          hard delete). Fechar/cancelar não chama nada; loading bloqueia
          clique duplo; sucesso invalida a query canônica (a linha some da
          tabela sem reload completo) e mostra confirmação; erro mostra
          mensagem sanitizada (nunca o "Edge Function returned a non-2xx
          status code" genérico). */}
      <AlertDialog
        open={!!archivingConn}
        onOpenChange={(open) => {
          if (!open && !archiveUazMut.isPending) setArchivingConn(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão da operação?</AlertDialogTitle>
            <AlertDialogDescription>
              {archivingConn && (
                <>
                  Isso vai remover <strong>{archivingConn.label}</strong> da
                  operação: ela deixará de aparecer na lista operacional e não
                  poderá receber mensagens, funis ou automações. Leads,
                  conversas, mensagens, vendas e demais dados anteriores serão
                  preservados no histórico. Esta ação não apaga o histórico.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveUazMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiveUazMut.isPending}
              onClick={(e) => {
                // FASE 20H — nunca fecha o `AlertDialog` nativamente aqui:
                // controlamos o fechamento manualmente só depois da
                // resposta confirmada do servidor (sucesso OU erro claro),
                // nunca otimisticamente.
                e.preventDefault();
                if (!archivingConn || archiveUazMut.isPending) return;
                const target = archivingConn;
                archiveUazMut.mutate(target.id, {
                  onSuccess: (res) => {
                    setArchivingConn(null);
                    toast.success(
                      res.already_archived
                        ? `${target.label} já estava fora da operação.`
                        : `${target.label} foi removida da operação. O histórico foi preservado.`
                    );
                  },
                  onError: (err: any) => {
                    // Mensagem sempre sanitizada e útil — nunca o texto
                    // genérico non-2xx, nunca stack/SQL/UUID interno/token
                    // (ver `archiveErrorMessage` em `useWhatsAppInstances.ts`).
                    toast.error(err?.message || 'Não foi possível remover a conexão agora.');
                    // Mantém o modal aberto para o admin tentar de novo ou
                    // cancelar — nunca fecha silenciosamente num erro.
                  },
                });
              }}
            >
              {archiveUazMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover da operação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Nova Conexão */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <DialogHeader>
              <DialogTitle>Nova Conexão</DialogTitle>
              <DialogDescription>
                Informe um nome para identificar esta conexão de WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conexão</Label>
                <Input 
                  id="name" 
                  placeholder="Ex: Vendas" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer">Nome da Oferta (Opcional)</Label>
                <Input 
                  id="offer" 
                  placeholder="Ex: Receita Diabetes" 
                  value={newOffer} 
                  onChange={(e) => setNewOffer(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Input value="WhatsApp" disabled className="bg-muted" />
              </div>
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">O que criar?</Label>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="create-uaz"
                    checked={newCreateUaz}
                    onCheckedChange={(v) => setNewCreateUaz(!!v)}
                  />
                  <div className="grid gap-0.5 leading-tight">
                    <Label htmlFor="create-uaz" className="cursor-pointer">Criar API Principal (UAZAPI)</Label>
                    <span className="text-xs text-muted-foreground">Envio, recebimento, webhooks, funis e IA.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="create-chromium"
                    checked={newCreateChromium}
                    onCheckedChange={(v) => setNewCreateChromium(!!v)}
                  />
                  <div className="grid gap-0.5 leading-tight">
                    <Label htmlFor="create-chromium" className="cursor-pointer">Criar Sessão Web (Chromium VPS)</Label>
                    <span className="text-xs text-muted-foreground">WhatsApp Web persistente, ACK Delivered e status complementar.</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cidade/Proxy UazAPI</Label>
                <Select defaultValue="sp">
                  <SelectTrigger>
                    <SelectValue placeholder="São Paulo - SP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sp">São Paulo - SP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!newName || createUazMut.isPending}>
                {createUazMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: QR Chromium */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Sessão Web</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho e escaneie o QR Code abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 min-h-[320px]">
            {qrCode ? (
              <div className="bg-white p-3 rounded-lg">
                <QRCodeCanvas value={qrCode} size={280} />
              </div>
            ) : (
              <div className="text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Aguardando QR Code da Sessão Web…</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Uaz Connect Dialog */}
      {connectingUaz && (
        <UazConnectDialog 
          instance={connectingUaz} 
          onClose={() => {
            setConnectingUaz(null);
            refetchUaz();
          }} 
        />
      )}

      {/* Modal: Editar Oferta */}
      <Dialog open={isOfferModalOpen} onOpenChange={setIsOfferModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editingOfferUaz) return;
            updateOfferMut.mutate({ id: editingOfferUaz.id, offer_name: editOffer || null }, {
              onSuccess: () => {
                setIsOfferModalOpen(false);
                refetchUaz();
              }
            });
          }}>
            <DialogHeader>
              <DialogTitle>Editar Oferta</DialogTitle>
              <DialogDescription>
                Atualize o nome da oferta associada a esta conexão.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editOffer">Nome da Oferta</Label>
                <Input 
                  id="editOffer" 
                  value={editOffer} 
                  onChange={(e) => setEditOffer(e.target.value)} 
                  placeholder="Ex: Marinadas"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Deixe em branco para remover a oferta.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOfferModalOpen(false)}>Cancelar</Button>
              <Button 
                type="submit"
                disabled={updateOfferMut.isPending}
              >
                {updateOfferMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>

  );
}
