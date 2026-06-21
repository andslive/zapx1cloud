import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  required: boolean;
  navigateTo: string;
}

export function useSuperAdminSetupChecklist() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['super-admin-setup-checklist'],
    queryFn: async () => {
      const [settingsRes, plansRes, orgsRes] = await Promise.all([
        supabase
          .from('platform_settings')
          .select(
            'platform_name, logo_url, support_email, evolution_go_url, default_password_changed, remix_setup_completed'
          )
          .maybeSingle(),
        supabase.from('platform_plans').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
      ]);

      const s = settingsRes.data as any;
      const items: ChecklistItem[] = [
        {
          id: 'password',
          label: 'Trocar senha padrão',
          description: 'Substitua a senha de instalação por uma senha forte.',
          done: !!s?.default_password_changed,
          required: true,
          navigateTo: 'dashboard',
        },
        {
          id: 'email',
          label: 'E-mail transacional',
          description: 'Configure o domínio de envio na Lovable Cloud.',
          done: !!s?.support_email,
          required: false,
          navigateTo: 'lovable-email',
        },
        {
          id: 'plans',
          label: 'Planos comerciais',
          description: 'Tenha pelo menos 1 plano ativo cadastrado.',
          done: (plansRes.count ?? 0) > 0,
          required: true,
          navigateTo: 'plans',
        },
        {
          id: 'evolution',
          label: 'Servidor WhatsApp (UAZAPI)',
          description: 'Opcional — necessário para WhatsApp das empresas.',
          done: !!s?.evolution_go_url,
          required: false,
          navigateTo: 'whatsapp',
        },
        {
          id: 'organization',
          label: 'Criar primeira empresa',
          description: 'Cadastre a primeira organização cliente.',
          done: (orgsRes.count ?? 0) > 0,
          required: true,
          navigateTo: 'organizations',
        },
      ];

      return {
        items,
        completed: !!s?.remix_setup_completed,
      };
    },
  });

  const markCompleted = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .maybeSingle();
      if (!existing?.id) throw new Error('platform_settings ainda não inicializado');
      const { error } = await supabase
        .from('platform_settings')
        .update({ remix_setup_completed: true } as any)
        .eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração inicial concluída!');
      qc.invalidateQueries({ queryKey: ['super-admin-setup-checklist'] });
    },
    onError: (e: Error) =>
      toast.error('Erro ao concluir configuração', { description: e.message }),
  });

  return {
    items: query.data?.items ?? [],
    completed: query.data?.completed ?? false,
    isLoading: query.isLoading,
    allRequiredDone: (query.data?.items ?? []).filter((i) => i.required).every((i) => i.done),
    markCompleted: markCompleted.mutateAsync,
    isMarking: markCompleted.isPending,
  };
}
