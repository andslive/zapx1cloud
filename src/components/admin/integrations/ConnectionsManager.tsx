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
  useRenameWhatsAppInstanceSelf,
  useDeleteWhatsAppInstanceSelf,
  useUpdateWhatsAppInstanceOffer,
  WhatsAppInstance
} from '@/hooks/useWhatsAppInstances';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw, MoreVertical, QrCode, Trash2, Info, Loader2, Sparkles, Square, Play, AlertTriangle, User, Search, ArrowUp, ArrowDown, Filter, Pencil, Beaker, Ghost } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AdminStatusNotificationConfig } from './AdminStatusNotificationConfig';
import { SimulateOutageModal } from './SimulateOutageModal';
import { supabase } from '@/integrations/supabase/client';



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
  const syncUazMut = useSyncWhatsAppInstances();
  const createUazMut = useCreateWhatsAppInstanceSelf();
  const renameUazMut = useRenameWhatsAppInstanceSelf();
  const deleteUazMut = useDeleteWhatsAppInstanceSelf();
  const updateOfferMut = useUpdateWhatsAppInstanceOffer();

  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [connectingUaz, setConnectingUaz] = useState<WhatsAppInstance | null>(null);
  const [editingUaz, setEditingUaz] = useState<WhatsAppInstance | null>(null);
  const [editingOfferUaz, setEditingOfferUaz] = useState<WhatsAppInstance | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [selectedChromiumId, setSelectedChromiumId] = useState<string | null>(null);


  const [newName, setNewName] = useState('');
  const [newOffer, setNewOffer] = useState('');
  const [newCreateUaz, setNewCreateUaz] = useState(true);
  const [newCreateChromium, setNewCreateChromium] = useState(true);
  const [editName, setEditName] = useState('');
  const [editOffer, setEditOffer] = useState('');

  // Filtering & Sorting states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOffer, setFilterOffer] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterApi, setFilterApi] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  
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
    console.log('Modals state:', { isCreateModalOpen, isEditModalOpen, isQrModalOpen });
  }, [isCreateModalOpen, isEditModalOpen, isQrModalOpen]);

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

  const mergedConnections = useMemo(() => {
    const uaz = uazInstances || [];
    const chrom = chromiumInstances || [];

    console.log('[AUDIT] UAZAPI CONNECTIONS', { count: uaz.length, items: uaz });
    console.log('[AUDIT] MANAGER CONNECTIONS', { count: chrom.length, items: chrom });

    let results: any[] = [];
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

    // Apply Status Filter
    if (filterStatus !== 'all') {
      results = results.filter(c => {
        const isUazOnline = c.uaz?.last_real_whatsapp_state === 'CONNECTED';
        const isChromOnline = c.chrom_status === 'online';
        const realWaState = c.uaz?.last_real_whatsapp_state;
        const isRealWebConnected = isChromOnline && realWaState === 'CONNECTED';
        
        if (filterStatus === 'online') return isUazOnline && isRealWebConnected;
        if (filterStatus === 'offline') return !isUazOnline && !isRealWebConnected;
        if (filterStatus === 'partial') return (isUazOnline && !isRealWebConnected) || (!isUazOnline && isRealWebConnected);
        return true;
      });
    }

    // Apply API Filter
    if (filterApi !== 'all') {
      results = results.filter(c => {
        const realWaState = c.uaz?.last_real_whatsapp_state;
        const isUazOnline = realWaState === 'CONNECTED';
        return filterApi === 'online' ? isUazOnline : !isUazOnline;
      });
    }

    // Apply Session Filter
    if (filterSession !== 'all') {
      results = results.filter(c => {
        const isChromOnline = c.chrom_status === 'online';
        const realWaState = c.uaz?.last_real_whatsapp_state;
        const isRealWebConnected = isChromOnline && realWaState === 'CONNECTED';
        return filterSession === 'online' ? isRealWebConnected : !isRealWebConnected;
      });
    }

    // Apply Sorting
    if (sortConfig.key && sortConfig.direction) {
      results.sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
          case 'name': valA = a.name; valB = b.name; break;
          case 'offer': valA = a.offer_name; valB = b.offer_name; break;
          case 'whatsapp': valA = a.push_name; valB = b.push_name; break;
          case 'number': valA = a.phone; valB = b.phone; break;
          case 'status': 
            const getStatusRank = (c: any) => {
              const u = c.uaz_status === 'connected' || c.uaz_status === 'paired';
              const ch = c.chrom_status === 'online';
              if (u && ch) return 3;
              if (u || ch) return 2;
              return 1;
            };
            valA = getStatusRank(a);
            valB = getStatusRank(b);
            break;
          default: valA = a[sortConfig.key] || ''; valB = b[sortConfig.key] || '';
        }
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    console.log('[AUDIT] FINAL TABLE', { count: results.length, items: results });
    return results;
  }, [uazInstances, chromiumInstances, searchTerm, filterOffer, filterStatus, filterApi, filterSession, sortConfig]);


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

  const isChromiumConnected = (chrom: any) => {
    if (!chrom) return false;
    if (chrom.connected === true) return true;
    const s = String(chrom.chromium_status || chrom.chromiumStatus || chrom.status || '').toLowerCase();
    return s === 'online' || s === 'authenticated' || s === 'ready';
  };

  const getGeneralStatus = (conn: any) => {
    const realWaState = conn.uaz?.last_real_whatsapp_state;
    const isUazOnline = realWaState === 'CONNECTED';
    const isWebOnline = isChromiumConnected(conn.chromium);

    if (isUazOnline && isWebOnline) return <Badge className="bg-green-500">Online</Badge>;
    if (isUazOnline || isWebOnline) return <Badge className="bg-yellow-500 text-black">Parcial</Badge>;
    return <Badge variant="destructive">Offline</Badge>;
  };

  // Detecta duplicidades por número (visível — não oculta nada)
  const duplicatePhoneGroups = useMemo(() => {
    const byPhone = new Map<string, any[]>();
    mergedConnections.forEach((c: any) => {
      const phone = String(c.phone || '').replace(/\D/g, '');
      if (!phone) return;
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone)!.push(c);
    });
    const groups: { phone: string; rows: any[] }[] = [];
    byPhone.forEach((rows, phone) => { if (rows.length > 1) groups.push({ phone, rows }); });
    return groups;
  }, [mergedConnections]);

  const isLoading = isLoadingUaz || isLoadingChromium;
  const used = uazInstances?.length ?? 0;
  const limit = effectivePlan?.limits?.max_connections ?? 1;
  const limitReached = used >= limit;

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
          <Badge variant={limitReached ? 'destructive' : 'secondary'} className="text-sm py-1 px-3">
            Ativas: {used} / {limit}
          </Badge>
          
          <AdminStatusNotificationConfig organizationId={profile?.organization_id} />

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsSimulateModalOpen(true)}
            className="gap-2 border-amber-500/50 hover:bg-amber-500/10 text-amber-600"
          >
            <Beaker className="h-4 w-4" />
            Simular Queda
          </Button>


          
          {mergedConnections.some(c => c.isOrphan) && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={async () => {
                const orphanIds = mergedConnections.filter(c => c.isOrphan).map(c => c.chromium?.id).filter(Boolean);
                if (confirm(`Remover ${orphanIds.length} conexões órfãs detectadas?`)) {
                  for (const id of orphanIds) {
                    await deleteChromiumMut.mutateAsync(id);
                  }
                  toast.success('Limpeza de órfãos concluída');
                  handleSyncAll();
                }
              }}
              disabled={deleteChromiumMut.isPending}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Limpar Órfãos
            </Button>
          )}

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterApi} onValueChange={setFilterApi}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="API Principal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas APIs</SelectItem>
              <SelectItem value="online">UazAPI Online</SelectItem>
              <SelectItem value="offline">UazAPI Offline</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSession} onValueChange={setFilterSession}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Sessão Web" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Sessões</SelectItem>
              <SelectItem value="online">Chromium Online</SelectItem>
              <SelectItem value="offline">Não conectada</SelectItem>
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
              <TableHead>API Principal</TableHead>
              <TableHead>Sessão Web</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
                <div className="flex items-center">Status Geral <SortIcon column="status" /></div>
              </TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : mergedConnections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhuma conexão encontrada.
                </TableCell>
              </TableRow>
            ) : (
              mergedConnections.map((conn) => {
                const realWaState = conn.uaz?.last_real_whatsapp_state;
                const isUazConnected = realWaState === 'CONNECTED';
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
                          <Badge variant="destructive" className="w-fit text-[10px] h-4 mt-1">
                            ÓRFÃ (Somente Chromium)
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
                      {isUazConnected ? (
                        <Badge className="bg-green-500 cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)}>
                          🟢 UazAPI Online
                        </Badge>
                      ) : (realWaState === 'PAIRING' || realWaState === 'OPENING') ? (
                        <Badge className="bg-yellow-500 text-black cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)}>
                          🟡 Conectando
                        </Badge>
                      ) : (conn.uaz?.status === 'qr_pending') ? (
                        <Badge variant="secondary" className="cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)}>
                          🟡 Aguardando QR
                        </Badge>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-muted-foreground cursor-pointer" onClick={() => setConnectingUaz(conn.uaz)}>
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
                    <TableCell>{getGeneralStatus(conn)}</TableCell>
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
                              <DropdownMenuItem onClick={() => {
                                setEditingUaz(conn.uaz);
                                setEditName(conn.uaz.custom_name || conn.uaz.name);
                                setIsEditModalOpen(true);
                              }}>
                                <Sparkles className="h-4 w-4 mr-2" /> Editar Nome Instância
                              </DropdownMenuItem>
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
                          <DropdownMenuItem className="text-destructive" onClick={() => {
                             console.group('[DELETE_HANDLER_START]', { ts: new Date().toISOString(), connName: conn.name });
                             console.log('[DELETE_INSTANCE_RAW]', conn);
                             console.log('[DELETE_CHROMIUM_TARGET]', conn.chromium ?? null);
                             console.log('[DELETE_UAZ_TARGET]', conn.uaz ?? null);
                             console.log('[DELETE_CHROMIUM_ID]', conn.chromium?.id ?? null);
                             console.log('[DELETE_UAZ_ID]', conn.uaz?.id ?? null);
                             console.log('[DELETE_CHROMIUM_NAME]', conn.chromium?.name ?? conn.chromium?.chromium_pushname ?? null);
                             console.log('[DELETE_UAZ_NAME]', conn.uaz?.custom_name ?? conn.uaz?.name ?? null);
                             console.log('[DELETE_REQUEST_PLAN]', {
                               willCallChromium: !!conn.chromium,
                               chromiumEndpoint: conn.chromium ? `DELETE https://api.x1zap.cloud/connections/${conn.chromium.id}` : null,
                               willCallUaz: !!conn.uaz,
                               uazAction: conn.uaz ? { fn: 'whatsapp-proxy', action: 'delete_instance_self', id: conn.uaz.id } : null,
                             });
                             if (confirm('Deseja realmente excluir esta conexão permanentemente?')) {
                               if (conn.chromium) deleteChromiumMut.mutate(conn.chromium.id, {
                                 onSuccess: (data) => console.log('[DELETE_CHROMIUM_RESULT]', { ok: true, data }),
                                 onError: (err: any) => console.log('[DELETE_CHROMIUM_RESULT]', { ok: false, status: err?.status, message: err?.message, body: err?.body }),
                               });
                               if (conn.uaz) deleteUazMut.mutate(conn.uaz.id, {
                                 onSuccess: (data) => { console.log('[DELETE_UAZ_RESULT]', { ok: true, data }); refetchUaz(); },
                                 onError: (err: any) => console.log('[DELETE_UAZ_RESULT]', { ok: false, message: err?.message, err }),
                               });
                             } else {
                               console.log('[DELETE_HANDLER_END]', { cancelled: true });
                             }
                             console.log('[DELETE_HANDLER_END]', { dispatched: true });
                             console.groupEnd();
                          }}>
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

      {/* Modal: Editar Nome Instância */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editingUaz || !editName) return;
            renameUazMut.mutate({ id: editingUaz.id, name: editName }, {
              onSuccess: () => {
                setIsEditModalOpen(false);
                refetchUaz();
              }
            });
          }}>
            <DialogHeader>
              <DialogTitle>Editar Nome Instância</DialogTitle>
              <DialogDescription>
                Altere o nome da instância exibido no CRM. Isso não altera o identificador no WhatsApp ou UazAPI.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editName">Nome Visual (Alias)</Label>
                <Input 
                  id="editName" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  placeholder="Ex: chip21"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
              <Button 
                type="submit"
                disabled={renameUazMut.isPending || !editName}
              >
                {renameUazMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
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
      {/* Modal: Simular Queda */}
      <SimulateOutageModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        connections={mergedConnections}
        organizationId={profile?.organization_id}
      />
    </div>

  );
}
