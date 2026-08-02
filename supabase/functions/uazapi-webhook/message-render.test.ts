import { assert, assertEquals } from "https://deno.land/std@0.207.0/assert/mod.ts";
import { renderMessageTextOrSkip } from "./message-render.ts";

Deno.test("texto renderizado vazio ('{{ai.response}}' → ''): retorna null", () => {
  const flowVariables: Record<string, any> = { "ai.response": "" };
  const replaceVars = (txt: any) => {
    if (typeof txt !== "string") return txt;
    let result = txt;
    for (const [k, v] of Object.entries(flowVariables)) {
      result = result.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
    result = result.replace(/{{\s*[\w.]+\s*}}/g, "");
    return result;
  };

  const result = renderMessageTextOrSkip("{{ai.response}}", replaceVars);
  assertEquals(result, null, "texto final vazio → sinal explícito para pular o envio");
});

Deno.test("variável resolve só para espaços: retorna null (trim considera vazio)", () => {
  const replaceVars = (txt: any) =>
    typeof txt === "string" ? txt.replace("{{nome}}", "   ") : txt;

  const result = renderMessageTextOrSkip("{{nome}}", replaceVars);
  assertEquals(result, null, "texto só com espaços é tratado como vazio");
});

Deno.test("texto normal não vazio: retorna o texto renderizado sem aplicar trim", () => {
  const replaceVars = (txt: any) =>
    typeof txt === "string" ? txt.replace("{{x}}", "valor") : txt;

  const result = renderMessageTextOrSkip("  Olá {{x}}!  ", replaceVars);
  assert(result !== null, "texto não vazio não deve ser pulado");
  assertEquals(result!.text, "  Olá valor!  ", "espaços externos originais são preservados, sem trim");
});

Deno.test("texto misto com conteúdo real e placeholder residual vazio: preserva o texto real", () => {
  const flowVariables: Record<string, any> = { "valorcomprovante": "" };
  const replaceVars = (txt: any) => {
    if (typeof txt !== "string") return txt;
    let result = txt.replace("{{valorcomprovante}}", flowVariables["valorcomprovante"]);
    result = result.replace(/{{\s*[\w.]+\s*}}/g, "");
    return result;
  };
  const result = renderMessageTextOrSkip("Valor recebido: {{valorcomprovante}}", replaceVars);
  assert(result !== null);
  assertEquals(result!.text, "Valor recebido: ", "mantém texto literal ao redor mesmo com variável vazia (não é o caso a pular)");
});

Deno.test("replaceVars retornando não-string (edge case defensivo): não lança exceção", () => {
  const replaceVars = (_txt: any) => undefined as any;
  let threw = false;
  let result: { text: any } | null = null;
  try {
    result = renderMessageTextOrSkip("{{x}}", replaceVars);
  } catch {
    threw = true;
  }
  assert(!threw, "não deve lançar exceção mesmo se replaceVars devolver algo atípico");
  assertEquals(result, null, "valor não-string vazio é tratado como vazio (via coerção segura)");
});
