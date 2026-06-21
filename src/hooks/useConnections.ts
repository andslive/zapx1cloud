import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MANAGER_API_BASE } from '@/config/connectionsApi';

/**
 * Integração real com x1zap-manager (VPS Chromium).
 * Endpoints suportados pelo manager:
 *  - GET    /instances
 *  - POST   /instances/create
 *  - POST   /instances/:id/restart
 *  - DELETE /instances/:id
 *
 * Convenções de status normalizadas (coluna "Sessão Web"):
 *  - ONLINE         → sessão ativa, WhatsApp Web autenticado
 *  - AUTENTICADO    → autenticado mas ainda inicializando
 *  - QR_PENDENTE    → aguardando leitura do QR
 *  - OFFLINE        → desconectado / parado
 */

export interface Connection {
  id: string;
  name: string;
  channel?: string;
  provider?: string;
  status?: string;
  chromium?: boolean;
  chromium_instance_id?: string;
  chromium_status?: string; // online | offline | qr_pending | authenticated
  chromium_number?: string;
  chromium_pushname?: string;
  chromium_qr?: string;
  platform?: string;
  phone_number?: string;
  number?: string;
  pushname?: string;
  instance_id?: string;
  qr_code?: string;
  created_at?: string;
}

export type WebSessionStatus = 'ONLINE' | 'AUTENTICADO' | 'QR_PENDENTE' | 'OFFLINE';

export function normalizeWebSessionStatus(c: Partial<Connection> | null | undefined): WebSessionStatus {
  if (!c) return 'OFFLINE';
  const raw = String(c.chromium_status || c.status || '').toLowerCase();
  if (raw === 'online' || raw === 'connected' || raw === 'ready') return 'ONLINE';
  if (raw === 'authenticated' || raw === 'authenticating') return 'AUTENTICADO';
  if (raw === 'qr_pending' || raw === 'qr' || raw === 'pairing' || raw === 'qrcode') return 'QR_PENDENTE';
  return 'OFFLINE';
}

async function managerFetch(path: string, options: RequestInit = {}) {
  const url = `${MANAGER_API_BASE}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[manager:${options.method || 'GET'} ${path}] status=${response.status}`, body);
      const err: any = new Error((body && (body.message || body.error)) || `Erro na API: ${response.statusText}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  } catch (err: any) {
    if (err?.status) throw err;
    console.error(`[manager:${options.method || 'GET'} ${path}] network error`, err);
    throw new Error('Não foi possível conectar ao servidor x1zap-manager.');
  }
}

/**
 * Normaliza o payload do x1zap-manager.
 * A API devolve camelCase (chromiumStatus, pm2Name, createdAt) e o front
 * espera snake_case. Aqui colocamos os dois para evitar quebrar consumidores.
 */
function mapManagerInstance(raw: any): Connection {
  if (!raw || typeof raw !== 'object') return raw;
  const rawStatus = raw.chromium_status ?? raw.chromiumStatus ?? raw.status;
  const chromium_status = rawStatus ? String(rawStatus).toLowerCase() : rawStatus;
  const chromium_number = raw.chromium_number ?? raw.chromiumNumber ?? raw.phone ?? raw.number;
  const chromium_pushname = raw.chromium_pushname ?? raw.chromiumPushname ?? raw.pushname;
  const chromium_qr = raw.chromium_qr ?? raw.chromiumQr ?? raw.qr ?? raw.qr_code;
  return {
    ...raw,
    chromium: raw.chromium ?? true,
    chromium_instance_id: raw.chromium_instance_id ?? raw.id,
    chromium_status,
    chromium_number,
    chromium_pushname,
    chromium_qr,
    number: raw.number ?? raw.phone ?? chromium_number,
    pm2_name: raw.pm2_name ?? raw.pm2Name,
    created_at: raw.created_at ?? raw.createdAt,
    status: chromium_status ?? raw.status,
  } as Connection;
}

export interface InstanceStatusResponse {
  id: string;
  chromium_status: string;
  connected: boolean;
  qr_available: boolean;
  number?: string;
  pushname?: string;
}

export async function fetchInstanceStatus(id: string): Promise<InstanceStatusResponse> {
  const data = await managerFetch(`/instances/${id}/status`);
  const rawStatus = data?.chromium_status ?? data?.chromiumStatus ?? data?.status;
  const norm = rawStatus ? String(rawStatus).toLowerCase() : 'disconnected';
  return {
    id: data?.id ?? id,
    chromium_status: norm,
    connected: !!(data?.connected ?? (norm === 'online' || norm === 'authenticated')),
    qr_available: !!(data?.qr_available ?? data?.qrAvailable),
    number: data?.number ?? data?.phone,
    pushname: data?.pushname,
  };
}

export async function fetchInstanceQr(id: string): Promise<string | null> {
  const data = await managerFetch(`/instances/${id}/qr`);
  return data?.qr ?? data?.qr_code ?? null;
}

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async (): Promise<Connection[]> => {
      const url = `${MANAGER_API_BASE}/instances`;
      console.log('[MANAGER REQUEST]', url);
      const data = await managerFetch('/instances');
      console.log('[MANAGER RESPONSE]', data);
      const raw: any[] = Array.isArray(data) ? data : (data?.instances || []);
      const mapped = raw.map(mapManagerInstance);
      console.log('[MANAGER MAPPED]', mapped);
      return mapped;
    },
    retry: 1,
    staleTime: 0,
  });
}

export function useSyncConnections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await managerFetch('/instances');
      console.log('[MANAGER RESPONSE]', data);
      const raw: any[] = Array.isArray(data) ? data : (data?.instances || []);
      const mapped = raw.map(mapManagerInstance);
      console.log('[MANAGER MAPPED]', mapped);
      return mapped;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['connections'], data);
      toast.success('Sessão Web sincronizada');
    },
    onError: (err: Error) => {
      console.error('[SYNC_ERROR]', err);
      toast.error(err.message);
    }
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string }) => {
      console.log('[MANAGER_CREATE_START]', vars);
      const data = await managerFetch('/instances/create', {
        method: 'POST',
        body: JSON.stringify(vars),
      });
      console.log('[MANAGER_CREATE_RESPONSE]', data);
      return data as Connection & { qr_available?: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      toast.success('Sessão Web criada');
    },
    onError: (err: Error) => {
      console.error('[CREATE_ERROR]', err);
      toast.error('Erro ao criar Sessão Web: ' + err.message);
    }
  });
}

export function useRestartConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('[MANAGER_RESTART_START]', { id });
      const data = await managerFetch(`/instances/${id}/restart`, { method: 'POST' });
      console.log('[MANAGER_RESTART_RESPONSE]', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      toast.success('Sessão Web reiniciada');
    },
    onError: (err: Error) => {
      toast.error('Erro ao reiniciar Sessão Web: ' + err.message);
    }
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('[MANAGER_DELETE_START]', { id });
      try {
        const data = await managerFetch(`/instances/${id}`, { method: 'DELETE' });
        return data;
      } catch (err: any) {
        // 404 → já removido na VPS; tratar como sucesso para limpar UI
        if (err?.status === 404) {
          console.warn('[MANAGER_DELETE_404_OK]', { id });
          return { ok: true, alreadyGone: true };
        }
        throw err;
      }
    },
    onSuccess: (_data, id) => {
      console.log('[MANAGER_DELETE_OK]', { id });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      toast.success('Sessão Web excluída');
    },
    onError: (err: any) => {
      toast.error('Erro ao excluir Sessão Web: ' + (err?.message || 'desconhecido'));
    }
  });
}

/**
 * QR da Sessão Web (Chromium VPS).
 * O manager hoje não expõe endpoint dedicado de QR — após criar/reiniciar,
 * o QR aparece em `chromium_qr` no GET /instances. Esta função tenta primeiro
 * um endpoint dedicado (se existir) e cai no GET /instances como fallback.
 */
export function useGetConnectionQr() {
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('[MANAGER_QR_REQUEST]', { id });
      try {
        const data = await managerFetch(`/instances/${id}/qr`);
        return { qr: data?.qr || data?.chromium_qr || data?.qr_code || null };
      } catch (err: any) {
        if (err?.status !== 404) console.warn('[MANAGER_QR_FALLBACK]', err?.message);
        const list = await managerFetch('/instances');
        const raw: any[] = Array.isArray(list) ? list : (list?.instances || []);
        const instances = raw.map(mapManagerInstance);
        const inst = instances.find((i) => i.id === id);
        return { qr: inst?.chromium_qr || inst?.qr_code || null };
      }
    },
    onError: (err: Error) => {
      console.error('[QR_ERROR]', err);
      toast.error('Erro ao obter QR da Sessão Web: ' + err.message);
    }
  });
}

// Aliases preservados para compatibilidade com chamadas existentes
export const useStartConnection = useRestartConnection;
export const useStopConnection = useDeleteConnection;

export function useConnectionStatus(id: string) {
  return useQuery({
    queryKey: ['connection-status', id],
    queryFn: async () => {
      const list = await managerFetch('/instances');
      const raw: any[] = Array.isArray(list) ? list : (list?.instances || []);
      const instances = raw.map(mapManagerInstance);
      return instances.find((i) => i.id === id) || null;
    },
    enabled: !!id,
    refetchInterval: 15000, // 5s -> 15s (audit Cloud Usage)
    refetchIntervalInBackground: false,
  });
}
