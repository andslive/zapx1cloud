import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
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
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as WhatsAppInstance[];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 300000, // 60s -> 5min (Realtime de evolution_instances cobre mudanças)
    refetchIntervalInBackground: false,
  });
}

// Platform-wide (super admin)
export function useAllWhatsAppInstancesAdmin() {
  return useQuery({
    queryKey: ['whatsapp-instances-all'],
    queryFn: async (): Promise<WhatsAppInstanceWithOrg[]> => {
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*, organization:organizations(id, name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WhatsAppInstanceWithOrg[];
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
