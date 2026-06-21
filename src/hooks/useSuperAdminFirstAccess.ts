import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Default seed emails são detectados dinamicamente via flag em platform_settings
// (default_password_changed). Não mantemos lista hardcoded por motivos de white label.
const DEFAULT_EMAILS: string[] = [];

/**
 * Detecta se o super admin atual está usando credenciais padrão de instalação
 * (email padrão OU senha ainda não trocada). Usado para forçar o modal de
 * primeiro acesso após o seed inicial em um remix.
 */
export function useSuperAdminFirstAccess() {
  const { user, isSuperAdmin } = useAuth();

  const query = useQuery({
    queryKey: ['platform-settings', 'first-access'],
    enabled: !!user?.id && isSuperAdmin(),
    queryFn: async () => {
      const [settingsRes, orgsRes] = await Promise.all([
        supabase
          .from('platform_settings')
          .select('default_password_changed, remix_setup_completed')
          .maybeSingle(),
        supabase
          .from('organizations')
          .select('*', { count: 'exact', head: true }),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      return {
        settings: settingsRes.data as { default_password_changed?: boolean; remix_setup_completed?: boolean } | null,
        orgCount: orgsRes.count ?? 0,
      };
    },
  });

  const usingDefaultEmail = !!user?.email && DEFAULT_EMAILS.includes(user.email.toLowerCase());
  const settings = query.data?.settings ?? null;
  // Se a query terminou e não há registro em platform_settings, força o wizard
  // (cenário de remix novo onde a tabela ainda está vazia).
  const noSettingsRow = !query.isLoading && !query.isError && settings == null;
  const passwordNotChanged =
    noSettingsRow || settings?.default_password_changed === false;
  const setupNotCompleted =
    noSettingsRow || settings?.remix_setup_completed === false;
  // Gatilho extra: sem nenhuma organização cadastrada, a plataforma ainda
  // não foi configurada — força o wizard mesmo que platform_settings esteja "completo".
  const noOrganizations =
    !query.isLoading && !query.isError && (query.data?.orgCount ?? 0) === 0;

  // Wizard abre enquanto a configuração inicial (senha + obrigatórios) não estiver concluída.
  const shouldForceSetup =
    !!user?.id &&
    isSuperAdmin() &&
    !query.isLoading &&
    (passwordNotChanged || setupNotCompleted || noOrganizations);

  return {
    shouldForceSetup,
    usingDefaultEmail,
    passwordNotChanged,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
