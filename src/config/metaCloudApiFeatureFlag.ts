// FASE 2A — feature flag do frontend para o card "WhatsApp Cloud API (Meta
// Oficial)". Hardcoded como desligada nesta fase: a tabela real
// (`meta_cloud_feature_flags`) só existe como migration local, ainda não
// aplicada em nenhum projeto Supabase remoto (ver relatório Fase 2A, §7) —
// portanto o frontend deliberadamente NÃO consulta essa tabela ainda (uma
// consulta contra uma tabela inexistente em produção seria, na melhor das
// hipóteses, um erro tratado, e na pior, uma tentação de "só criar a tabela
// rapidinho" fora do processo de autorização).
//
// Fase 2B substitui esta constante por uma leitura real (global + por
// organização, mesma lógica de supabase/functions/_shared/meta-cloud-flags.ts)
// depois que a migration for aplicada com autorização explícita.
export const META_CLOUD_API_ENABLED = false;
