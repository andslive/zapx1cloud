import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface FacebookLeadIntegration {
  id: string;
  organization_id: string;
  product_id: string;
  page_id: string;
  page_name: string | null;
  page_access_token: string;
  app_secret: string | null;
  pixel_name: string | null;
  pixel_id: string | null;
  pixel_access_token: string | null;
  verify_token: string;
  field_mapping: Record<string, string>;
  distribution_rule: string;
  assigned_user_id: string | null;
  assigned_squad_id: string | null;
  default_temperature: string;
  default_tags: string[];
  is_active: boolean;
  last_lead_received_at: string | null;
  leads_count: number;
  created_at: string;
  updated_at: string;
  products?: {
    id: string;
    name: string;
  };
}

export interface FacebookLeadLog {
  id: string;
  integration_id: string;
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  campaign_id: string | null;
  raw_payload: Record<string, unknown>;
  lead_data: Record<string, unknown> | null;
  lead_id: string | null;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

// Generate a random verify token
function generateVerifyToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function useFacebookLeadIntegrations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['facebook-lead-integrations', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_lead_integrations')
        .select('*, products(id, name)')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as FacebookLeadIntegration[];
    },
    enabled: !!profile?.organization_id
  });
}

export function useFacebookLeadLogs(integrationId?: string) {
  return useQuery({
    queryKey: ['facebook-lead-logs', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_lead_logs')
        .select('*')
        .eq('integration_id', integrationId!)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as FacebookLeadLog[];
    },
    enabled: !!integrationId
  });
}

export function useCreateFacebookIntegration() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      product_id: string;
      page_id: string;
      page_name?: string;
      page_access_token: string;
      app_secret?: string;
      field_mapping?: Record<string, string>;
      distribution_rule?: string;
      assigned_user_id?: string;
      assigned_squad_id?: string;
      default_temperature?: string;
      default_tags?: string[];
      pixel_name?: string;
      pixel_id?: string;
      pixel_access_token?: string;
    }) => {
      const { error, data: result } = await supabase
        .from('facebook_lead_integrations')
        .insert({
          organization_id: profile!.organization_id!,
          product_id: data.product_id,
          page_id: data.page_id,
          page_name: data.page_name || null,
          page_access_token: data.page_access_token,
          app_secret: data.app_secret || null,
          pixel_name: data.pixel_name || null,
          pixel_id: data.pixel_id || null,
          pixel_access_token: data.pixel_access_token || null,
          verify_token: generateVerifyToken(),
          field_mapping: data.field_mapping || {
            full_name: 'name',
            email: 'email',
            phone_number: 'phone'
          },
          distribution_rule: data.distribution_rule || 'manual',
          assigned_user_id: data.assigned_user_id || null,
          assigned_squad_id: data.assigned_squad_id || null,
          default_temperature: data.default_temperature || 'hot',
          default_tags: data.default_tags || []
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-lead-integrations'] });
      toast.success('Integração criada com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating integration:', error);
      toast.error('Erro ao criar integração');
    }
  });
}

export function useUpdateFacebookIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      ...data 
    }: Partial<FacebookLeadIntegration> & { id: string }) => {
      const { error } = await supabase
        .from('facebook_lead_integrations')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-lead-integrations'] });
      toast.success('Integração atualizada');
    },
    onError: (error) => {
      console.error('Error updating integration:', error);
      toast.error('Erro ao atualizar integração');
    }
  });
}

export function useDeleteFacebookIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('facebook_lead_integrations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-lead-integrations'] });
      toast.success('Integração removida');
    },
    onError: (error) => {
      console.error('Error deleting integration:', error);
      toast.error('Erro ao remover integração');
    }
  });
}
