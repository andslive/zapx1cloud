import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface IntegrationSetting {
  id: string;
  organization_id: string;
  integration_type: string;
  api_key_masked: string | null;
  is_configured: boolean;
  settings: Record<string, unknown>;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

const AVAILABLE_INTEGRATIONS = [
  {
    type: 'resend',
    name: 'Resend',
    description: 'Envio de emails transacionais',
    icon: 'Mail',
    docsUrl: 'https://resend.com/docs'
  },
  {
    type: 'firecrawl',
    name: 'Firecrawl',
    description: 'Web scraping e crawling',
    icon: 'Globe',
    docsUrl: 'https://firecrawl.dev/docs'
  },
  {
    type: 'zapier',
    name: 'Zapier',
    description: 'Automações e webhooks',
    icon: 'Zap',
    docsUrl: 'https://zapier.com/developer'
  }
];

export function useIntegrations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['integration-settings', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('organization_id', profile!.organization_id!);

      if (error) throw error;

      // Merge with available integrations
      return AVAILABLE_INTEGRATIONS.map(integration => {
        const setting = data?.find(s => s.integration_type === integration.type);
        return {
          ...integration,
          setting: setting as IntegrationSetting | undefined
        };
      });
    },
    enabled: !!profile?.organization_id
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      integrationType, 
      apiKeyMasked,
      isConfigured,
      settings 
    }: { 
      integrationType: string;
      apiKeyMasked?: string;
      isConfigured?: boolean;
      settings?: Record<string, unknown>;
    }) => {
      const { data: existing } = await supabase
        .from('integration_settings')
        .select('id')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', integrationType)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('integration_settings')
          .update({
            api_key_masked: apiKeyMasked,
            is_configured: isConfigured,
            settings: settings ? JSON.parse(JSON.stringify(settings)) : undefined,
            last_verified_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_settings')
          .insert([{
            organization_id: profile!.organization_id!,
            integration_type: integrationType,
            api_key_masked: apiKeyMasked,
            is_configured: isConfigured ?? false,
            settings: JSON.parse(JSON.stringify(settings ?? {})),
            last_verified_at: new Date().toISOString()
          }]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast.success('Integração atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar integração: ' + error.message);
    }
  });
}

export function useEmailConfig() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['email-config', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('settings')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'email_config')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return (data?.settings as {
        senderName?: string;
        senderEmail?: string;
        signature?: string;
        logoUrl?: string;
      }) ?? {
        senderName: '',
        senderEmail: '',
        signature: '',
        logoUrl: ''
      };
    },
    enabled: !!profile?.organization_id
  });
}

export function useUpdateEmailConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: {
      senderName?: string;
      senderEmail?: string;
      signature?: string;
      logoUrl?: string;
    }) => {
      const { data: existing } = await supabase
        .from('integration_settings')
        .select('id')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'email_config')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('integration_settings')
          .update({
            settings: config,
            is_configured: true
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_settings')
          .insert({
            organization_id: profile!.organization_id!,
            integration_type: 'email_config',
            is_configured: true,
            settings: config
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-config'] });
      toast.success('Configurações de email salvas');
    },
    onError: (error) => {
      toast.error('Erro ao salvar configurações: ' + error.message);
    }
  });
}
