// Renderiza o template de um bloco "message" e decide se há texto para
// enviar. Extraído para arquivo próprio (sem Deno.serve) para ser testável
// por import direto, sem iniciar um listener HTTP.
//
// Contexto: `case "message"` validava `if (b.data?.content)` — isto é, se o
// TEMPLATE (ex.: "{{ai.response}}") era não-vazio — e não se o resultado
// após a substituição de variáveis era não-vazio. Quando a variável
// resolvia para "" (ex.: ai.response = "" no catch de exceção do
// ai_receipt), um texto final vazio era enfileirado e enviado ao provedor,
// que rejeitava com 400 "Missing required fields".
//
// Retorna `{ text }` com o texto renderizado (sem trim aplicado ao valor —
// preserva espaçamento/formatação original) quando há conteúdo para enviar,
// ou `null` quando o texto renderizado é vazio/só espaços — sinal para o
// chamador pular o envio sem marcar falha, sem retry, e seguir o fluxo
// normalmente para o próximo bloco.
export function renderMessageTextOrSkip(
  content: string,
  replaceVars: (txt: any) => any,
): { text: any } | null {
  const renderedText = replaceVars(content);
  // replaceVars retorna `any` (repassa o valor original se não for string);
  // checagem de vazio feita sobre uma coerção segura, sem alterar o valor
  // efetivamente retornado para envio.
  const renderedTextForEmptyCheck = typeof renderedText === "string"
    ? renderedText
    : String(renderedText ?? "");

  if (!renderedTextForEmptyCheck.trim()) return null;
  return { text: renderedText };
}
