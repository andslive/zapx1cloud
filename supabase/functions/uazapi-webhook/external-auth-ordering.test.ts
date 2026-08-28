// item B1 (hotfix/uazapi-ack-auth-isolation-20260828) — provas estruturais
// sobre a ordenação do handler e a remoção física do fallback legado, que
// não são observáveis chamando `resolveInstanceForEvent` isoladamente
// (essas já estão em instance-resolution.test.ts). O handler completo
// (`Deno.serve`) não roda em `deno test` sem rede real — mesmo padrão dos
// demais arquivos deste diretório: inspeciona o texto-fonte de `index.ts`.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

async function readIndexSource(): Promise<string> {
  return await Deno.readTextFile(new URL("./index.ts", import.meta.url));
}

Deno.test("fallback legado por nome/id/metadata foi removido fisicamente: extractRawInstanceIdentifier e UUID_REGEX não existem mais como código executável no source", async () => {
  const src = await readIndexSource();
  // A única menção restante de `extractRawInstanceIdentifier` é o
  // comentário explicando a remoção -- não sobra nenhuma definição
  // (`function extractRawInstanceIdentifier`) nem chamada
  // (`extractRawInstanceIdentifier(`).
  assertEquals(src.includes("function extractRawInstanceIdentifier"), false);
  assertEquals(src.includes("extractRawInstanceIdentifier("), false);
  assertEquals(src.includes("UUID_REGEX"), false);
  assertEquals(src.includes("resolved_by_legacy_identifier"), false);
  const literalOccurrences = (src.match(/extractRawInstanceIdentifier/g) || []).length;
  assertEquals(literalOccurrences, 1, "só deve sobrar a menção no comentário explicando a remoção");
});

Deno.test("a checagem de evento ilegível (!norm && !__is_resume) roda ANTES da resolução de instância -- nunca gasta uma consulta ao banco para um payload que já seria descartado", async () => {
  const src = await readIndexSource();
  const normNullCheckIdx = src.indexOf("if (!norm && !(payload as any).__is_resume) {");
  const resolutionIdx = src.indexOf("const resolution = await resolveInstanceForEvent(supabase, payload);");
  assertEquals(normNullCheckIdx > 0, true);
  assertEquals(resolutionIdx > 0, true);
  assertEquals(normNullCheckIdx < resolutionIdx, true);
  // Só deve sobrar 1 ocorrência executável dessa checagem -- a duplicata
  // antiga (depois da resolução) foi removida, não só movida/duplicada.
  const occurrences = (src.match(/if \(!norm && !\(payload as any\)\.__is_resume\) \{/g) || []).length;
  assertEquals(occurrences, 1);
});

Deno.test("resolveInstanceForEvent é chamado incondicionalmente (sem ternário sobre `norm`) -- norm é sempre não nulo neste ponto, já garantido pela checagem movida", async () => {
  const src = await readIndexSource();
  assertEquals(src.includes('const resolution = await resolveInstanceForEvent(supabase, payload);'), true);
  // O ternário antigo (`norm ? await resolveInstanceForEvent(...) : {...}`)
  // não sobrevive.
  assertEquals(src.includes('({ instance: null, reason: "missing_instance" } as const)'), false);
});

Deno.test("health tracking ([WEBHOOK_HEALTH_TRACKING]) continua escopado exclusivamente por resolution.instance.id -- nenhuma resolução própria por texto do payload", async () => {
  const src = await readIndexSource();
  const healthIdx = src.indexOf("[WEBHOOK_HEALTH_TRACKING]");
  assertEquals(healthIdx > 0, true);
  const block = src.slice(healthIdx, healthIdx + 400);
  assertEquals(block.includes('.eq("id", resolution.instance.id)'), true);
});

Deno.test("resolução de instância roda depois do gate de actions internas (item A) e antes do ACK -- a ordem geral parse -> gate A -> normalizePayload -> checagem de norm nulo -> resolução é preservada", async () => {
  const src = await readIndexSource();
  const gateIdx = src.indexOf("[INTERNAL_ACTION_AUTH]");
  const normalizeIdx = src.indexOf("norm = normalizePayload(payload);");
  const normNullCheckIdx = src.indexOf("if (!norm && !(payload as any).__is_resume) {");
  const resolutionIdx = src.indexOf("const resolution = await resolveInstanceForEvent(supabase, payload);");
  const ackIdx = src.indexOf('(norm as any).kind === "ack"');
  assertEquals(gateIdx > 0 && normalizeIdx > 0 && normNullCheckIdx > 0 && resolutionIdx > 0 && ackIdx > 0, true);
  assertEquals(gateIdx < normalizeIdx, true);
  assertEquals(normalizeIdx < normNullCheckIdx, true);
  assertEquals(normNullCheckIdx < resolutionIdx, true);
  // Item B2 (ainda não aplicado neste commit) moverá o ACK para depois da
  // resolução -- neste commit (B1) o ACK ainda roda antes, documentado
  // aqui para não confundir uma regressão futura com o estado esperado
  // deste commit específico.
  assertEquals(ackIdx < resolutionIdx, true, "neste commit (B1), ACK ainda roda antes da resolução -- será movido no item B2");
});
