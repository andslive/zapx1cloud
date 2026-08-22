// FASE 18A — visibilidade real (não hardcoded) do card comercial
// "HookCloud — WhatsApp Oficial", por organização e por papel.
//
// Diferente de `META_CLOUD_API_ENABLED` (constante estática desligada,
// `src/config/metaCloudApiFeatureFlag.ts`), esta flag lê a MESMA tabela
// já usada pelo backend (`meta_cloud_feature_flags`, migration
// 20260810120000, já aplicada — confirmado por leitura direta do Cloud
// nesta fase) — nenhuma tabela nova, nenhuma flag improvisada.
//
// RLS real já confirmada por leitura direta do Cloud antes de implementar
// (política "Org admins can view their own meta cloud feature flag"):
// um usuário autenticado com papel admin/manager da própria organização
// pode ler SOMENTE a linha `scope='organization'` da SUA organização —
// nunca a linha global, nunca a de outra organização (RLS impõe isso no
// banco, não apenas no cliente). Por isso esta consulta nunca tenta ler
// `scope='global'` — um `admin` comum não tem permissão para isso (só
// `super_admin`, via a segunda política), e mesmo que tivesse, o piloto
// HookCloud é deliberadamente opt-in por organização, nunca ligado por
// uma flag global de "todo mundo".
//
// O papel exigido para VER o card (`admin`/`super_admin`) é mais estrito
// que a RLS (que também deixaria `manager` ler a linha) — isso é
// intencional: a autorização real de quem pode PROVISIONAR já é
// admin/super_admin no backend (`hookcloud-provision-connection`,
// auditado); a UI só espelha essa mesma regra para nunca mostrar um
// botão que o backend recusaria.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UseHookCloudPilotAccessResult {
  /** `true` somente quando a flag da organização está ligada E o usuário é admin/super_admin. Nunca `true` durante o carregamento. */
  visible: boolean;
  isLoading: boolean;
}

export function useHookCloudPilotAccess(): UseHookCloudPilotAccessResult {
  const { profile, isAdmin } = useAuth();
  const organizationId = profile?.organization_id ?? null;
  const authorizedRole = isAdmin(); // admin || super_admin — mesmo helper já usado em toda a app

  const query = useQuery({
    queryKey: ['hookcloud-pilot-flag', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_cloud_feature_flags')
        .select('enabled')
        .eq('scope', 'organization')
        .eq('organization_id', organizationId as string)
        .maybeSingle();
      // Falha fechada: erro de leitura (incluindo bloqueio por RLS) nunca
      // é interpretado como "ligado" — sempre resolve para desligado.
      if (error) return false;
      return data?.enabled === true;
    },
    enabled: !!organizationId && authorizedRole,
    staleTime: 60_000,
    retry: false,
  });

  return {
    visible: authorizedRole && query.data === true,
    isLoading: authorizedRole ? query.isLoading : false,
  };
}
