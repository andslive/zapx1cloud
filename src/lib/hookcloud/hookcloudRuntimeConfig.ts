// FASE 18B, achado 4 — origin canônico do projeto Supabase configurado
// neste frontend, usado para validar a callback URL exibida pela
// HookCloud (`isTrustedHookCloudCallbackUrl`). Lê a MESMA variável de
// ambiente já usada por `src/integrations/supabase/client.ts`
// (`VITE_SUPABASE_URL`) — nenhuma segunda fonte/hardcode. Isolado num
// módulo próprio (em vez de dentro de `hookcloudProvisioning.ts`) para
// manter aquele módulo livre de `import.meta.env`, já que ele precisa
// continuar testável via `deno test` sem o runtime do Vite.

export function getHookCloudCallbackExpectedOrigin(): string {
  return new URL(import.meta.env.VITE_SUPABASE_URL).origin;
}
