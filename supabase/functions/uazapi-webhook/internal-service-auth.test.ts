// hotfix/uazapi-ack-auth-isolation-20260828 — item A (correção crítica de
// autenticação interna). Cobre exclusivamente `evaluateResumeFunnelInternalAuth`/
// `extractBearerTokenForInternalAuth` e o posicionamento/efeito do gate no
// handler (via prova estrutural sobre o texto-fonte de `index.ts`, já que o
// handler completo (`Deno.serve`) não roda em `deno test` sem rede real —
// mesmo padrão usado pelos demais arquivos `*.test.ts` deste diretório).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  evaluateResumeFunnelInternalAuth,
  extractBearerTokenForInternalAuth,
} from "./index.ts";

const REAL_SECRET = "service-role-secret-value-fake-for-test-only";

Deno.test("Bearer correto -> match", () => {
  const result = evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}`, REAL_SECRET);
  assertEquals(result, "match");
});

Deno.test("Authorization ausente -> missing", () => {
  const result = evaluateResumeFunnelInternalAuth(undefined, REAL_SECRET);
  assertEquals(result, "missing");
  const result2 = evaluateResumeFunnelInternalAuth(null, REAL_SECRET);
  assertEquals(result2, "missing");
});

Deno.test("Authorization malformado (sem prefixo 'Bearer ', ou vazio após) -> missing", () => {
  assertEquals(evaluateResumeFunnelInternalAuth(REAL_SECRET, REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth(`Basic ${REAL_SECRET}`, REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth("Bearer ", REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth("Bearer", REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth("Bearer  x", REAL_SECRET), "missing"); // espaço duplo -> regex não casa
});

Deno.test("Authorization com Bearer incorreto -> invalid", () => {
  const result = evaluateResumeFunnelInternalAuth("Bearer wrong-value", REAL_SECRET);
  assertEquals(result, "invalid");
});

Deno.test("Bearer com prefixo/sufixo do valor certo, mas não exatamente igual -> invalid (nunca match parcial)", () => {
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}x`, REAL_SECRET), "invalid");
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer x${REAL_SECRET}`, REAL_SECRET), "invalid");
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET.slice(0, -1)}`, REAL_SECRET), "invalid");
});

Deno.test("apikey sozinho (sem Authorization) nunca autentica -- a função só olha para o header Authorization recebido", () => {
  // Simula o chamador real: só o valor de Authorization é passado à função,
  // nunca apikey. Mesmo que o valor de apikey (não simulável aqui, pois a
  // função nem recebe esse parâmetro) fosse igual ao secret, isso é
  // irrelevante -- prova que a assinatura da função não tem como aceitar
  // apikey como substituto.
  const result = evaluateResumeFunnelInternalAuth(undefined, REAL_SECRET);
  assertEquals(result, "missing");
  // Prova adicional: a função tem exatamente 2 parâmetros (authorizationHeader,
  // expectedServiceRoleKey) -- nenhum parâmetro para apikey existe.
  assertEquals(evaluateResumeFunnelInternalAuth.length, 2);
});

Deno.test("SUPABASE_SERVICE_ROLE_KEY ausente/vazia no ambiente -> sempre invalid, nunca autentica por omissão", () => {
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}`, undefined), "invalid");
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}`, ""), "invalid");
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}`, null as any), "invalid");
});

Deno.test("extractBearerTokenForInternalAuth: extrai só o formato exato 'Bearer <token>'", () => {
  assertEquals(extractBearerTokenForInternalAuth("Bearer abc123"), "abc123");
  assertEquals(extractBearerTokenForInternalAuth("bearer abc123"), null); // case-sensitive, exige "Bearer" exato
  assertEquals(extractBearerTokenForInternalAuth(""), null);
  assertEquals(extractBearerTokenForInternalAuth(undefined), null);
  assertEquals(extractBearerTokenForInternalAuth(null), null);
});

// ── Provas estruturais sobre index.ts (posicionamento do gate) ────────

async function readIndexSource(): Promise<string> {
  return await Deno.readTextFile(new URL("./index.ts", import.meta.url));
}

Deno.test("resume_funnel autenticado alcança o fluxo existente: o bloco de auth não retorna quando internalAuthResult === 'match' (só retorna 401 no branch !== 'match')", async () => {
  const src = await readIndexSource();
  const gateIdx = src.indexOf('if (action === "resume_funnel") {');
  const block = src.slice(gateIdx, gateIdx + 900);
  // Só existe UM early-return (401) dentro do bloco do gate, condicionado
  // a `internalAuthResult !== "match"` -- não há nenhum outro `return`
  // incondicional que impediria o fluxo de continuar após autenticar.
  const returnCount = (block.match(/return new Response/g) || []).length;
  assertEquals(returnCount, 1, "deve haver exatamente 1 return (401) dentro do bloco do gate, só no caminho não autenticado");
  assertEquals(block.includes('internalAuthResult !== "match"'), true);
});

Deno.test("autenticação ocorre antes de qualquer leitura/lease/mutação: o gate está antes do INSERT em webhook_logs e antes do handler original de resume_funnel (linha com acquire_conversation_lease)", async () => {
  const src = await readIndexSource();
  const gateIdx = src.indexOf('if (action === "resume_funnel") {\n      const internalAuthResult');
  const webhookLogsInsertIdx = src.indexOf('await supabase.from("webhook_logs").insert({');
  const leaseIdx = src.indexOf('acquire_conversation_lease');
  const convFetchIdx = src.indexOf('"visitor_phone_normalized, evolution_instance_id, organization_id, visitor_name, current_flow_id, current_block_id, status, flow_source, flow_completed, flow_variables, lead_id"');
  assertEquals(gateIdx > 0, true, "gate precisa existir");
  assertEquals(webhookLogsInsertIdx > 0, true);
  assertEquals(leaseIdx > 0, true);
  assertEquals(convFetchIdx > 0, true);
  assertEquals(gateIdx < webhookLogsInsertIdx, true, "auth deve rodar antes do INSERT em webhook_logs (primeira mutação do handler)");
  assertEquals(gateIdx < leaseIdx, true, "auth deve rodar antes de acquire_conversation_lease");
  assertEquals(gateIdx < convFetchIdx, true, "auth deve rodar antes da leitura de webchat_conversations do resume_funnel");
});

Deno.test("execute_recovery e execute_silent_recovery são rejeitados incondicionalmente (400, sem detalhe interno) antes de alcançar seus próprios handlers", async () => {
  const src = await readIndexSource();
  const rejectIdx = src.indexOf("Allowlist estrita");
  const executeRecoveryHandlerIdx = src.indexOf('if (action === "execute_recovery" && (payload as any).recoveryId) {');
  const executeSilentHandlerIdx = src.indexOf('if (action === "execute_silent_recovery" && (payload as any).recoveryId) {');
  assertEquals(rejectIdx > 0, true);
  assertEquals(executeRecoveryHandlerIdx > 0, true);
  assertEquals(executeSilentHandlerIdx > 0, true);
  // O bloco de rejeição precisa vir ANTES dos dois handlers antigos --
  // torna-os definitivamente inalcançáveis (dead code), sem precisar
  // deletá-los (fora do escopo desta correção: lógica de recibos).
  assertEquals(rejectIdx < executeRecoveryHandlerIdx, true);
  assertEquals(rejectIdx < executeSilentHandlerIdx, true);
  // A rejeição não revela nenhum detalhe interno -- só um código genérico.
  // Isola só o corpo da resposta JSON efetivamente enviada ao cliente
  // (não os comentários explicativos ao redor, que legitimamente citam
  // execute_recovery/execute_silent_recovery por nome).
  const responseBodyIdx = src.indexOf("JSON.stringify({ ok: false, error: \"unsupported_action\" })", rejectIdx);
  assertEquals(responseBodyIdx > 0 && responseBodyIdx < rejectIdx + 700, true);
  const responseBody = src.slice(responseBodyIdx, responseBodyIdx + 60);
  assertEquals(responseBody.toLowerCase().includes("recovery"), false, "o corpo da resposta não deve mencionar execute_recovery/recibo, só o código genérico");
  const rejectBlock = src.slice(rejectIdx, rejectIdx + 700);
  assertEquals(rejectBlock.includes('"unsupported_action"'), true);
  assertEquals(rejectBlock.includes("status: 400"), true);
});

Deno.test("action interna desconhecida (nem resume_funnel, nem debug-insert-tracking, nem vazia) é rejeitada com 400", async () => {
  const src = await readIndexSource();
  const rejectIdx = src.indexOf("Allowlist estrita");
  const block = src.slice(rejectIdx, rejectIdx + 500);
  assertEquals(block.includes('action !== "resume_funnel" && action !== "debug-insert-tracking"'), true);
});

Deno.test("debug-insert-tracking continua fora do gate (não exige Authorization) -- fora do escopo desta correção, comportamento preservado", async () => {
  const src = await readIndexSource();
  const allowlistIdx = src.indexOf("Allowlist estrita");
  const allowlistBlock = src.slice(allowlistIdx, allowlistIdx + 500);
  assertEquals(allowlistBlock.includes('"debug-insert-tracking"'), true);
  // O handler de debug-insert-tracking em si continua sem nenhuma
  // referência a evaluateResumeFunnelInternalAuth.
  const handlerIdx = src.indexOf('if (action === "debug-insert-tracking") {');
  const handlerBlock = src.slice(handlerIdx, handlerIdx + 300);
  assertEquals(handlerBlock.includes("evaluateResumeFunnelInternalAuth"), false);
});

Deno.test("tráfego external_uazapi sem action continua no fluxo normal -- o gate nunca executa quando action é vazia/undefined", async () => {
  const src = await readIndexSource();
  const gateIdx = src.indexOf('typeof action === "string" && action.length > 0');
  assertEquals(gateIdx > 0, true, "o gate deve checar explicitamente que action é uma string não vazia antes de rejeitar/autenticar -- nunca reage a action ausente");
});

Deno.test("nenhum segredo, header bruto, tamanho ou fragmento é logado no branch de rejeição -- só a classificação (missing/invalid)", async () => {
  const src = await readIndexSource();
  const gateIdx = src.indexOf('if (action === "resume_funnel") {\n      const internalAuthResult');
  const block = src.slice(gateIdx, gateIdx + 900);
  assertEquals(block.includes("console.warn("), true);
  // O único argumento variável passado ao console.warn dentro deste bloco
  // é `internalAuthResult` (a classificação) -- nunca o header/token.
  assertEquals(/console\.warn\(\s*"[^"]*",\s*internalAuthResult,?\s*\);/.test(block), true);
  assertEquals(block.includes("req.headers.get(\"Authorization\")"), true, "o header só é lido para ser passado à função de comparação, nunca para ser logado");
});

Deno.test("evaluateResumeFunnelInternalAuth nunca lança exceção mesmo com entradas exóticas", () => {
  assertEquals(evaluateResumeFunnelInternalAuth({} as any, REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth(12345 as any, REAL_SECRET), "missing");
  assertEquals(evaluateResumeFunnelInternalAuth(`Bearer ${REAL_SECRET}`, {} as any), "invalid");
});
