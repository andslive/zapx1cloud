import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// FASE 18C — `provider` é a única fonte de verdade sobre o transporte
// desta conexão (ver `_shared/whatsapp-provider/resolve.ts` e
// `src/lib/whatsapp/connectionProviderView.ts`). `meta_cloud_config` é o
// registro 1:1 satélite (`evolution_instances_meta_cloud`), embutido só
// para exibição segura (nunca usado para decidir se uma ação de
// transporte UazAPI é permitida — essa decisão depende SOMENTE de
// `provider`). Nunca contém token — `access_token_secret_ref` é uma
// referência opaca a um secret no Vault, não o segredo em si.
export interface WhatsAppInstanceMetaCloudConfig {
  onboarding_state: string | null;
  onboarding_source: string | null;
  // FASE 18E — necessário para `isMetaCloudOperationalConnection`
  // (`connectionEligibility.ts`), que exige o Phone Number ID exato da
  // PRÓPRIA conexão (nunca `display_phone_number`, que é só um texto
  // formatado) antes de considerar uma conexão Meta elegível para
  // seleção operacional. Sem este campo no embed, aquela checagem
  // ficaria permanentemente inalcançável mesmo quando `onboarding_state`
  // um dia chegar a `'active'`.
  phone_number_id: string | null;
}

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
  provider?: string | null;
  meta_cloud_config?: WhatsAppInstanceMetaCloudConfig | null;
  name: string;
  custom_name: string | null;
  offer_name: string | null;
  push_name: string | null;
  profile_picture_url: string | null;
  instance_id: string | null;
  instance_token: string | null;
  phone_number: string | null;
  status: 'disconnected' | 'qr_pending' | 'connected' | 'paired' | string;
  qr_code: string | null;
  qr_code_updated_at: string | null;
  webhook_subscribed: boolean;
  is_default: boolean;
  default_funnel_id: string | null;
  last_connected_at: string | null;
  last_health_at: string | null;
  last_real_whatsapp_state?: string | null;
  last_real_whatsapp_ping?: string | null;
  last_ack_at?: string | null;
  is_ghost?: boolean;
  is_stable?: boolean;
  one_tick_count?: number;
  created_at: string;
  updated_at: string;
  created_by_super_admin?: boolean;
  webhook_status?: 'ok' | 'absent' | 'broken' | 'unknown';
  last_webhook_check_at?: string | null;
  last_webhook_event_at?: string | null;
  webhook_events?: string[] | null;
  webhook_url?: string | null;
  metadata?: { webhook_error?: string | null; webhook_last_attempt_at?: string | null; [k: string]: any } | null;
  /** FASE 20H — `null`/ausente = operacional; timestamp = arquivada (retirada da operação, histórico preservado). */
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
}


export interface WhatsAppInstanceWithOrg extends WhatsAppInstance {
  organization?: { id: string; name: string } | null;
}

/* ─────────────── PLATFORM CONFIG (Super Admin) ─────────────── */

export interface PlatformWhatsAppConfig {
  evolution_go_url: string | null;
  evolution_go_global_api_key: string | null;
  uazapi_url?: string | null;
  uazapi_admin_token?: string | null;
  whatsapp_provider?: 'evolution' | 'uazapi';
}

export function usePlatformWhatsAppConfig() {
  return useQuery({
    queryKey: ['platform-whatsapp-config'],
    queryFn: async (): Promise<PlatformWhatsAppConfig> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('evolution_go_url, evolution_go_global_api_key, uazapi_url, uazapi_admin_token, whatsapp_provider')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        evolution_go_url: (data as any)?.evolution_go_url ?? null,
        evolution_go_global_api_key: (data as any)?.evolution_go_global_api_key ?? null,
        uazapi_url: (data as any)?.uazapi_url ?? null,
        uazapi_admin_token: (data as any)?.uazapi_admin_token ?? null,
        whatsapp_provider: (data as any)?.whatsapp_provider ?? 'uazapi',
      };
    },
  });
}

export function useUpdatePlatformWhatsAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: Partial<PlatformWhatsAppConfig>) => {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from('platform_settings')
          .update(cfg as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('platform_settings').insert(cfg as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-whatsapp-config'] });
      toast.success('Configuração do WhatsApp salva');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useTestWhatsAppConnection() {
  return useMutation({
    mutationFn: async (vars: { url: string; globalApiKey: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
        body: { action: 'test_connection', url: vars.url, globalApiKey: vars.globalApiKey },
      });
      if (error) throw error;
      return data;
    },
  });
}

/* ─────────────── INSTANCES ─────────────── */

// Org-scoped (admin da empresa)
export function useWhatsAppInstances() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  // Listen for realtime updates to evolution_instances
  useEffect(() => {
    if (!profile?.organization_id) return;

    const channel = supabase
      .channel('evolution_instances_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'evolution_instances',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['whatsapp-instances', profile?.organization_id] });
          qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, qc]);

  return useQuery({
    queryKey: ['whatsapp-instances', profile?.organization_id],
    queryFn: async (): Promise<WhatsAppInstance[]> => {
      // FASE 20D — removido o embed direto `meta_cloud_config:
      // evolution_instances_meta_cloud(...)` que existia aqui (Fase 18C).
      // Motivo: `evolution_instances_meta_cloud` tem RLS habilitada com
      // policies corretas, mas o role `authenticated` NÃO tem GRANT SELECT
      // na tabela (confirmado por consulta direta ao banco linkado na Fase
      // 20D) — um embed PostgREST nessas condições falha com
      // `42501 permission denied` para a QUERY INTEIRA assim que existir
      // 1 linha satélite real, quebrando esta tela inteira (não só os dados
      // de API Oficial). `meta_cloud_config` agora é buscado separadamente
      // via `useOfficialApiConnections()` (Edge Function `instances-api`,
      // que autentica/autoriza no servidor com `service_role` e devolve uma
      // allowlist de colunas), e uma falha nesse fetch aparece como "Dados
      // indisponíveis" na coluna correspondente — nunca derruba esta query.
      // FASE 20H — esta é a fonte canônica de `ConnectionsManager`/
      // `WhatsAppInstancesPanel` (lista da tela, contadores do topo e o
      // limite do plano derivam TODOS deste mesmo array). Uma conexão
      // arquivada (`archived_at IS NOT NULL`) nunca deve aparecer na lista
      // operacional nem ocupar vaga do limite de conexões do plano — por
      // isso o filtro entra aqui, na fonte, em vez de em cada consumidor.
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WhatsAppInstance[];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 300000, // 60s -> 5min (Realtime de evolution_instances cobre mudanças)
    refetchIntervalInBackground: false,
  });
}

/**
 * FASE 20D — busca os metadados sanitizados de API Oficial (HookCloud/Meta
 * direta) via a fronteira administrativa `instances-api` (nunca consulta
 * `evolution_instances_meta_cloud` diretamente do cliente — ver comentário
 * acima em `useWhatsAppInstances`). Retorna um mapa por
 * `evolution_instance_id` para merge O(1) pelo chamador.
 */
// FASE 20D — CORREÇÃO (revisão Codex desta fase): esta função antes
// engolia QUALQUER falha (rede/HTTP/permissão) e devolvia `{ ok: false }`
// como um resultado de SUCESSO para o React Query. Isso significava que uma
// falha transitória de rede ficava cacheada como "resultado válido" por até
// `refetchInterval` (5 min), sem nenhum retry/backoff — o usuário via
// "Dados indisponíveis" congelado por até 5 minutos mesmo que a causa real
// já tivesse se resolvido em segundos. Agora LANÇA em qualquer falha, para
// o React Query tratar como erro de verdade (retry automático com backoff,
// `isError` real) — `useOfficialApiConnections`/`useOfficialApiConnectionsAll`
// abaixo expõem `unavailable` derivado de `isError` (só após os retries se
// esgotarem), nunca de um `{ok:false}} `"bem-sucedido".
async function fetchOfficialApiConnections(action: 'officialApi' | 'officialApiAll'): Promise<Map<string, WhatsAppInstanceMetaCloudConfig>> {
  // `fetch` direto (em vez de `supabase.functions.invoke`) para garantir
  // método GET + querystring de forma previsível — `invoke` é otimizado
  // para POST com corpo JSON em várias versões do supabase-js.
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão ausente ao buscar API Oficial');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const resp = await fetch(`${supabaseUrl}/functions/v1/instances-api?action=${action}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!resp.ok) throw new Error(`instances-api ${action} falhou: HTTP ${resp.status}`);
  const json = await resp.json();
  if (json?.ok !== true || !Array.isArray(json.rows)) {
    throw new Error(`instances-api ${action} devolveu resposta malformada`);
  }
  const byInstanceId = new Map<string, WhatsAppInstanceMetaCloudConfig>();
  for (const row of json.rows) {
    if (row && typeof row.evolution_instance_id === 'string') {
      byInstanceId.set(row.evolution_instance_id, {
        onboarding_state: row.onboarding_state ?? null,
        onboarding_source: row.onboarding_source ?? null,
        phone_number_id: row.phone_number_id ?? null,
      });
    }
  }
  return byInstanceId;
}

export interface OfficialApiHookResult {
  /** Mapa por `evolution_instance_id` — vazio tanto em "sem linhas reais" quanto durante `unavailable`/loading; o chamador SEMPRE deve checar `unavailable`/`isLoading` antes de tratar um mapa vazio como "Não configurada". */
  byInstanceId: Map<string, WhatsAppInstanceMetaCloudConfig>;
  /** `true` SÓ depois que os retries automáticos do React Query se esgotarem — nunca durante uma falha transitória isolada. */
  unavailable: boolean;
  isLoading: boolean;
}

// Org-scoped (admin/manager da própria organização, ou super_admin).
export function useOfficialApiConnections(): OfficialApiHookResult {
  const { profile } = useAuth();
  const q = useQuery({
    queryKey: ['whatsapp-instances-official-api', profile?.organization_id],
    queryFn: () => fetchOfficialApiConnections('officialApi'),
    enabled: !!profile?.organization_id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    retry: 2, // backoff padrão do React Query — nunca 0 (falha transitória isolada não deve virar "Dados indisponíveis" imediatamente)
  });
  return { byInstanceId: q.data ?? new Map(), unavailable: q.isError, isLoading: q.isLoading };
}

// Platform-wide (super_admin) — usado por `useAllWhatsAppInstancesAdmin`.
export function useOfficialApiConnectionsAll(): OfficialApiHookResult {
  const { profile } = useAuth();
  const q = useQuery({
    queryKey: ['whatsapp-instances-official-api-all'],
    queryFn: () => fetchOfficialApiConnections('officialApiAll'),
    enabled: !!profile?.organization_id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
  return { byInstanceId: q.data ?? new Map(), unavailable: q.isError, isLoading: q.isLoading };
}

// Platform-wide (super admin)
export function useAllWhatsAppInstancesAdmin() {
  return useQuery({
    queryKey: ['whatsapp-instances-all'],
    queryFn: async (): Promise<WhatsAppInstanceWithOrg[]> => {
      // FASE 20D — mesmo motivo de `useWhatsAppInstances`: removido o embed
      // direto de `evolution_instances_meta_cloud` (falta GRANT SELECT para
      // `authenticated`; RLS sozinha não basta). Painel de super admin usa
      // `useOfficialApiConnectionsAll()` separadamente.
      // FASE 20H — mesmo princípio de `useWhatsAppInstances`: painel
      // platform-wide de super admin também não deve listar conexões
      // arquivadas na visão operacional padrão.
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*, organization:organizations(id, name)')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WhatsAppInstanceWithOrg[];
    },
  });
}

function useProxyAction() {
  return async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', { body });
    if (error) throw error;
    if (data?.ok === false || data?.error) throw new Error(data.error || 'Operação falhou');
    return data;
  };
}

export function useCreateWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { name: string; organization_id: string }) =>
      proxy({ action: 'create_instance', ...vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast.success('Instância criada com sucesso');
    },
    onError: (e: any) => toast.error('Erro ao criar instância: ' + e.message),
  });
}

export function useImportWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { name: string; instance_token: string; organization_id: string }) =>
      proxy({ action: 'import_instance', ...vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast.success('Instância importada com sucesso');
    },
    onError: (e: any) => toast.error('Erro ao importar: ' + e.message),
  });
}

// Self-service: cliente cria a própria instância (limite controlado pelo plano).
export function useCreateWhatsAppInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { name: string; offer_name?: string }) =>
      proxy({ action: 'create_instance_self', name: vars.name, offer_name: vars.offer_name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Conexão criada! Escaneie o QR Code para ativar.');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar conexão'),
  });
}

export function useConnectWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'connect_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
    },
    onError: (e: any) => toast.error('Erro ao conectar: ' + e.message),
  });
}

export function useSubscribeWhatsAppWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
        body: { action: 'subscribe_webhook', id },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Falha ao configurar webhook');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Webhook configurado com sucesso');
    },
    onError: (e: any) => toast.error('Erro: ' + (e?.message || 'erro desconhecido')),
  });
}

export function useDeleteWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'delete_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Instância removida');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// FASE 20H — arquivamento seguro de conexão (substitui, na UI de Admin →
// Conexões, o botão "Excluir" que antes chamava `delete_instance_self`,
// um hard delete que falhava com FK 23503/non-2xx sempre que a conexão
// tinha histórico real vinculado — ver `whatsapp-proxy/index.ts`, action
// `archive_instance`). Nunca apaga a linha; só marca `archived_at`.

export interface ArchivedInstanceDto {
  id: string;
  organization_id: string;
  name: string;
  provider: string;
  status: string;
  archived_at: string;
  archived_by: string | null;
  archive_reason: string | null;
}

export interface ArchiveInstanceResult {
  ok: true;
  already_archived: boolean;
  instance: ArchivedInstanceDto;
}

/** Códigos sanitizados que `archive_instance` pode devolver — nunca SQL/stack/UUID interno/token. */
export type ArchiveInstanceErrorCode =
  | 'Unauthorized'
  | 'forbidden'
  | 'invalid_id'
  | 'not_found'
  | 'unsupported_provider'
  | 'internal_error'
  | 'network_ambiguous'
  | undefined;

function archiveErrorMessage(code: ArchiveInstanceErrorCode): string {
  switch (code) {
    case 'Unauthorized':
      return 'Sua sessão expirou. Faça login novamente para continuar.';
    case 'forbidden':
      return 'Apenas um Super Admin pode remover esta conexão da operação.';
    case 'invalid_id':
      return 'Identificador de conexão inválido.';
    case 'not_found':
      return 'Esta conexão não foi encontrada (pode já ter sido removida).';
    case 'unsupported_provider':
      return 'Este tipo de conexão ainda não pode ser removido por aqui.';
    case 'network_ambiguous':
      return 'Não foi possível confirmar a remoção — verifique sua conexão e tente novamente.';
    case 'internal_error':
    default:
      return 'Não foi possível remover a conexão agora. Tente novamente em instantes.';
  }
}

export class ArchiveInstanceError extends Error {
  code: ArchiveInstanceErrorCode;
  constructor(code: ArchiveInstanceErrorCode) {
    super(archiveErrorMessage(code));
    this.name = 'ArchiveInstanceError';
    this.code = code;
  }
}

// FASE 20H — extrai o código sanitizado (`{ error: "..." }`) do corpo real
// da resposta non-2xx. `supabase.functions.invoke` (supabase-js v2), numa
// resposta non-2xx, joga um `FunctionsHttpError` cujo `.message` é sempre
// o texto genérico "Edge Function returned a non-2xx status code" — o
// corpo JSON de verdade só está em `error.context` (a `Response` real).
// Sem isto, TODO erro do backend (403/404/409/500) aparecia para o
// usuário como essa mesma frase genérica, inútil — a causa raiz do
// problema relatado nesta fase.
async function extractSanitizedErrorCode(error: any): Promise<ArchiveInstanceErrorCode> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body && typeof body.error === 'string') return body.error as ArchiveInstanceErrorCode;
    }
  } catch {
    // Corpo não-JSON, já consumido, ou requisição nunca chegou a ter
    // resposta HTTP real (falha de rede) — cai no `undefined` genérico.
  }
  return undefined;
}

// FASE 20H — distingue "o servidor respondeu com um erro real" (tem
// `error.context`, uma `Response` HTTP de verdade) de "a requisição nunca
// chegou a ter uma resposta" (timeout/rede — `FunctionsFetchError` ou
// exceção de `fetch`, sem `context`). Só o segundo caso é ambíguo o
// bastante para justificar reconciliar em vez de reportar erro direto.
function isNetworkAmbiguousError(error: any): boolean {
  if (!error) return false;
  if (error?.context) return false; // resposta HTTP real chegou — nunca ambíguo
  return true;
}

// Chamada crua de `archive_instance`: nunca lança `ArchiveInstanceError`
// diretamente — devolve `{ result }` em sucesso ou `{ ambiguous }`/`{ code }`
// em falha, para o chamador (`invokeArchiveInstanceWithReconciliation`)
// decidir se reconcilia ou reporta. Mantém a distinção rede-ambígua vs.
// erro HTTP real visível no ponto de decisão, sem depender de encadear
// `.cause` por cima de uma classe de erro.
type RawArchiveAttempt =
  | { ok: true; result: ArchiveInstanceResult }
  | { ok: false; ambiguous: true }
  | { ok: false; ambiguous: false; code: ArchiveInstanceErrorCode };

async function attemptArchiveInstance(id: string): Promise<RawArchiveAttempt> {
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { action: 'archive_instance', id },
  });
  if (error) {
    if (isNetworkAmbiguousError(error)) {
      return { ok: false, ambiguous: true };
    }
    const code = await extractSanitizedErrorCode(error);
    return { ok: false, ambiguous: false, code };
  }
  if (!data || data.ok !== true) {
    return { ok: false, ambiguous: false, code: data?.error };
  }
  return { ok: true, result: data as ArchiveInstanceResult };
}

/**
 * FASE 20H — `archive_instance` é idempotente no servidor (`WHERE
 * archived_at IS NULL`, e uma linha já arquivada devolve
 * `already_archived: true` sem escrever de novo) — por isso, diante de um
 * resultado AMBÍGUO (timeout/erro de rede, nunca um erro HTTP real),
 * reconciliar significa chamar a MESMA action mais uma vez (nunca uma
 * ação distinta): se a segunda chamada confirma sucesso (arquivada agora
 * OU já estava), o resultado original é tratado como bem-sucedido; se a
 * segunda chamada também for ambígua ou vier um erro HTTP real, o
 * chamador vê um erro claro — nunca um "sucesso" inventado sem confirmação
 * do servidor, e nunca uma terceira tentativa automática.
 */
async function invokeArchiveInstanceWithReconciliation(id: string): Promise<ArchiveInstanceResult> {
  const first = await attemptArchiveInstance(id);
  if (first.ok) return first.result;
  if (!first.ambiguous) throw new ArchiveInstanceError(first.code);

  const second = await attemptArchiveInstance(id);
  if (second.ok) return second.result;
  if (!second.ambiguous) throw new ArchiveInstanceError(second.code);
  throw new ArchiveInstanceError('network_ambiguous');
}

// Self-service: Super Admin remove a conexão da operação (arquiva — nunca
// apaga a linha nem o histórico vinculado).
export function useArchiveWhatsAppInstanceSelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeArchiveInstanceWithReconciliation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
    },
  });
}

// Self-service: org admin/manager pode excluir a própria conexão
export function useDeleteWhatsAppInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('[DELETE_UAZ_START]', { id, ts: new Date().toISOString() });
      const payload = { action: 'delete_instance_self', id };
      console.log('[DELETE_UAZ_PAYLOAD]', payload);
      try {
        const res = await proxy(payload);
        console.log('[DELETE_UAZ_RESPONSE]', { id, res });
        return res;
      } catch (err: any) {
        console.log('[DELETE_UAZ_ERROR]', { id, message: err?.message, err });
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Conexão excluída');
    },
    onError: (e: any) => toast.error('Erro ao excluir: ' + e.message),
  });
}

// Self-service: renomeia (display name) a própria conexão
export function useRenameWhatsAppInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      proxy({ action: 'rename_instance_self', id: vars.id, name: vars.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Conexão renomeada');
    },
    onError: (e: any) => toast.error('Erro ao renomear: ' + e.message),
  });
}

export function useSetDefaultWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'set_default', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Instância padrão definida');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useDisconnectWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'disconnect_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Sessão pausada. Reconecte quando quiser — o número fica salvo.');
    },
    onError: (e: any) => toast.error('Erro ao pausar sessão: ' + e.message),
  });
}

export function useLogoutWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'logout_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('WhatsApp desvinculado. Escaneie um novo QR para conectar outro número.');
    },
    onError: (e: any) => toast.error('Erro ao desvincular: ' + e.message),
  });
}

export function useAssignWhatsAppInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; organization_id: string | null }) =>
      proxy({ action: 'assign_instance', id: vars.id, organization_id: vars.organization_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Instância atrelada à empresa');
    },
    onError: (e: any) => toast.error('Erro ao atrelar: ' + e.message),
  });
}

export function useSyncWhatsAppInstances() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: async (organization_id?: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); 
      
      try {
        const data = await proxy({ action: 'sync_instances', organization_id });
        clearTimeout(timeoutId);
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      
      const updated = data?.updated ?? 0;
      const failed = data?.failed ?? 0;
      
      const onlineCount = data?.results?.filter((r: any) => r.real_state === 'CONNECTED').length || 0;
      const offlineCount = (data?.results?.length || 0) - onlineCount;

      toast.success(`Sincronização concluída: ${onlineCount} online, ${updated - onlineCount} parciais, ${offlineCount} offline, ${failed} erros.`);
    },
    onError: (e: any) => {
      if (e.name === 'AbortError') {
        toast.error('Sincronização excedeu o tempo limite de 20s (Frontend)');
      } else {
        toast.error('Erro ao sincronizar: ' + e.message);
      }
    },
  });
}

export function useUpdateWhatsAppInstanceOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; offer_name: string | null }) => {
      const { error } = await supabase
        .from('evolution_instances')
        .update({ offer_name: vars.offer_name })
        .eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Oferta atualizada com sucesso');
    },
    onError: (e: any) => toast.error('Erro ao atualizar oferta: ' + e.message),
  });
}

// Funil padrão da conexão: só afeta novas conversas (conversas já em
// andamento continuam presas ao current_flow_id fixado quando começaram).
// Usa RPC (set_connection_default_funnel) em vez de update direto porque a
// troca precisa registrar auditoria em platform_audit_logs (mesma organização
// + funil anterior/novo/usuário/data), e a escrita nessa tabela é restrita a
// super_admin via RLS — a função SECURITY DEFINER valida a permissão real
// (admin/manager da mesma org, ou super_admin) no backend.
export function useSetConnectionDefaultFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { connectionId: string; funnelId: string | null }) => {
      const { data, error } = await supabase.rpc('set_connection_default_funnel', {
        _connection_id: vars.connectionId,
        _funnel_id: vars.funnelId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Refetch explícito (não otimista) para confirmar o valor realmente
      // persistido, em vez de assumir que a UI já está certa.
      await qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      await qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Funil da conexão atualizado');
    },
    onError: (e: Error) => toast.error('Erro ao atualizar funil: ' + (e?.message || 'erro desconhecido')),
  });
}

export function useRepairWhatsAppWebhook() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'repair_webhook', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Webhook reparado com sucesso');
    },
    onError: (e: any) => toast.error('Erro ao reparar webhook: ' + e.message),
  });
}

export function useCheckWhatsAppWebhook() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'check_webhook', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-instances-all'] });
      toast.success('Status do webhook atualizado');
    },
    onError: (e: any) => toast.error('Erro ao verificar webhook: ' + e.message),
  });
}
