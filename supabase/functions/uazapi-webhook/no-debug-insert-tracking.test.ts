// deno test --allow-read no-debug-insert-tracking.test.ts
//
// Guarda de regressão ESTÁTICA (Fase 19O): prova, lendo o próprio
// código-fonte do handler (index.ts), que a ação de debug
// `debug-insert-tracking` (e o helper `debugInsertTracking` que a
// implementava) foi removida FISICAMENTE — não apenas contida pelo
// interceptor de domínio interno/externo (Fase 19J/19L, em produção
// desde a v22 / Fase 19N).
//
// Contexto (ver /tmp/x1zap-hookcloud-audit-20260818.md, seções 87/88):
// na v21 (antes da Fase 19J), esta ação era alcançável sem NENHUMA
// autenticação e podia gravar em `lead_tracking` com `lead_id` de
// qualquer organização; o trigger `tr_propagate_lead_attribution`
// propagava `source` do payload do cliente para `leads.source`
// cross-tenant. Nenhum chamador legítimo, atual ou histórico, foi
// encontrado em toda a história do repositório (Fase 19M).
//
// Este teste NÃO usa banco real, credencial real, nem envia mensagem —
// é puramente uma leitura de arquivo local.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/** Remove comentários de linha e de bloco antes da busca — o comentário
 * histórico desta remoção PRECISA nomear a string `debug-insert-tracking`
 * em prosa; só código executável conta como regressão. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

async function readIndexSource(): Promise<string> {
  return await Deno.readTextFile(new URL("./index.ts", import.meta.url));
}

Deno.test("uazapi-webhook/index.ts: zero definição executável de debugInsertTracking", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(
    code.includes("function debugInsertTracking"),
    false,
    "A função debugInsertTracking ainda está definida no arquivo — remoção incompleta.",
  );
  assertEquals(
    code.includes("debugInsertTracking("),
    false,
    "Ainda existe uma chamada executável a debugInsertTracking() no arquivo.",
  );
});

Deno.test("uazapi-webhook/index.ts: zero branch executável para action === \"debug-insert-tracking\"", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(
    code.includes('"debug-insert-tracking"'),
    false,
    'A string literal "debug-insert-tracking" ainda aparece em código executável (fora de comentário).',
  );
});

Deno.test("uazapi-webhook/index.ts: exatamente 2 INSERTs em lead_tracking permanecem — ambos legítimos (atribuição de mensagem inbound)", async () => {
  const code = stripComments(await readIndexSource());
  const matches = code.match(/\.from\("lead_tracking"\)\.insert\(/g) ?? [];
  assertEquals(
    matches.length,
    2,
    `Esperado exatamente 2 sites de INSERT em lead_tracking (os dois fluxos legítimos de atribuição de mensagem inbound); encontrado ${matches.length}. Se um novo INSERT foi adicionado ou um legítimo foi removido, isso é uma regressão fora do escopo desta fase.`,
  );
});

Deno.test("uazapi-webhook/index.ts: interceptor de domínio interno/externo continua presente e incondicional (Fase 19J/19L, não tocado por esta remoção)", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(
    code.includes('action.length > 0 && action !== "resume_funnel"'),
    true,
    "O interceptor de domínio (rejeita qualquer action !== resume_funnel) não foi encontrado — regressão fora do escopo desta fase de remoção de código morto.",
  );
});

Deno.test("uazapi-webhook/index.ts: resume_funnel continua exigindo evaluateUazapiWebhookInternalServiceAuth (Fase 19J, não tocado por esta remoção)", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(
    code.includes("evaluateUazapiWebhookInternalServiceAuth("),
    true,
    "A chamada a evaluateUazapiWebhookInternalServiceAuth não foi encontrada — regressão fora do escopo desta fase.",
  );
});

Deno.test("uazapi-webhook/index.ts: ações históricas execute_recovery/execute_silent_recovery continuam ausentes (Fase 19J, não reintroduzidas por esta remoção)", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(code.includes('"execute_recovery"'), false);
  assertEquals(code.includes('"execute_silent_recovery"'), false);
});

Deno.test("uazapi-webhook/index.ts: telemetria v3 (auth_domain/internal_action/internal_auth_result) continua presente e referenciada (Fase 19J, não tocada por esta remoção)", async () => {
  const code = stripComments(await readIndexSource());
  assertEquals(code.includes("buildUazapiWebhookInternalServiceTelemetryRecord"), true);
  assertEquals(code.includes("buildUazapiWebhookTokenAuthTelemetryRecord"), true);
  assertEquals(code.includes("evaluateUazapiWebhookTokenAuth("), true);
});
