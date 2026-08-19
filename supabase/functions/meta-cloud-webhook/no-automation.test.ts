// deno test --allow-import --allow-read no-automation.test.ts
//
// Guarda de regressão ESTÁTICA: lê o próprio código-fonte do handler
// (index.ts) e garante que ele nunca referencia nenhum dos sistemas de
// automação/venda proibidos nesta fase (funil, IA, wait_response,
// ai_receipt, purchase_audit, CAPI/Pixel, envio de mensagem). Se alguém
// tentar "promover" um worker de produção sem atualizar conscientemente
// este teste, ele quebra — é a prova de que echo/history/status/sync não
// alcançam automação: a automação simplesmente NÃO EXISTE no arquivo.
//
// Isto complementa (não substitui) os testes de normalização
// (`meta-webhook-normalize.test.ts`, que provam `automationForbidden`) —
// aqui provamos que mesmo que alguém ignorasse essa flag, não haveria
// nenhuma chamada de automação para ignorá-la.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const FORBIDDEN_SUBSTRINGS = [
  "clone-funnel",
  "funnel-job-runner",
  "funnel-resume-cron",
  "wait_response",
  "ai_receipt",
  "purchase_audit",
  "resolveAIProvider",
  "sendFacebookConversion",
  "uazapi-send",
  "whatsapp-send",
  "webchat_messages",
  "webchat_conversations",
];

/** Remove comentários de linha (`//...`) e de bloco (`/* ... *\/`) antes da
 * busca — o próprio docstring deste arquivo e do index.ts PRECISA nomear
 * esses sistemas em prosa para explicar a garantia; só código real conta
 * como violação. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

Deno.test("meta-cloud-webhook/index.ts nunca CHAMA (fora de comentários) funil, IA, ai_receipt, purchase_audit, CAPI ou envio de mensagem", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const code = stripComments(source);
  const hits = FORBIDDEN_SUBSTRINGS.filter((needle) => code.includes(needle));
  assertEquals(hits, [], `Referências proibidas encontradas fora de comentários: ${hits.join(", ")}`);
});
