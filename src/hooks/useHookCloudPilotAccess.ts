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
// FASE 21G — o papel exigido para VER o card usa a decisão canônica
// `canManageHookCloud` (`admin` OU `super_admin`), a MESMA allowlist do
// backend (`_shared/hookcloud-authorization.ts`, importada por
// `hookcloud-provision-connection`/`hookcloud-rotate-credentials`).
//
// Histórico: a Fase 21B havia restringido isto para exclusivamente
// `super_admin` (achado da Fase 21A). A Fase 21G reverteu essa
// restrição por decisão explícita do usuário — `admin` volta a ser
// permitido, mas continua sujeito às MESMAS regras de isolamento
// (organização derivada do perfil, nunca do cliente) já aplicadas no
// backend, que é sempre a autoridade real e independente desta consulta.
//
// Isto é mais estrito que a RLS real da tabela (que também deixaria
// `manager` ler a linha `scope='organization'` da própria organização)
// — deliberado: esconder o card no frontend NUNCA foi (e continua não
// sendo) a proteção real; é só espelho para nunca mostrar um botão que
// o backend recusaria.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { canManageHookCloud } from '@/lib/hookcloud/hookCloudAuthorization';

interface UseHookCloudPilotAccessResult {
  /** `true` somente quando a flag da organização está ligada E o usuário tem papel `admin` ou `super_admin`. Nunca `true` durante o carregamento. */
  visible: boolean;
  isLoading: boolean;
}

export function useHookCloudPilotAccess(): UseHookCloudPilotAccessResult {
  const { profile, roles } = useAuth();
  const organizationId = profile?.organization_id ?? null;
  const authorizedRole = canManageHookCloud(roles); // admin || super_admin — Fase 21G, mesma allowlist do backend

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
