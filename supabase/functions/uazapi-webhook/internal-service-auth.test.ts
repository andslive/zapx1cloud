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
  assertEquals(responseBodyIdx > 0 && responseBodyIdx < rejectIdx + 1100, true);
  const responseBody = src.slice(responseBodyIdx, responseBodyIdx + 60);
  assertEquals(responseBody.toLowerCase().includes("recovery"), false, "o corpo da resposta não deve mencionar execute_recovery/recibo, só o código genérico");
  const rejectBlock = src.slice(rejectIdx, rejectIdx + 1100);
  assertEquals(rejectBlock.includes('"unsupported_action"'), true);
  assertEquals(rejectBlock.includes("status: 400"), true);
});

Deno.test("action interna desconhecida (qualquer valor não vazio diferente de resume_funnel, incluindo debug-insert-tracking) é rejeitada com 400", async () => {
  const src = await readIndexSource();
  const rejectIdx = src.indexOf("Allowlist estrita");
  const block = src.slice(rejectIdx, rejectIdx + 1100);
  // A allowlist agora só verifica resume_funnel -- nenhuma outra exceção
  // (nem debug-insert-tracking) sobrevive.
  assertEquals(block.includes('action !== "resume_funnel"'), true);
  assertEquals(block.includes('"debug-insert-tracking"'), false, "debug-insert-tracking não pode mais ter tratamento especial na allowlist");
});

// ── Correção: remoção física de debug-insert-tracking (achado da auditoria
// — sem chamador legítimo, alcançável sem autenticação, escrevia em
// lead_tracking sem organization_id, e o trigger tr_propagate_lead_attribution
// (ativo em produção) propaga `source` para `leads.source` cross-tenant a
// partir de qualquer lead_id existente -- mesmo achado independente já
// corrigido em origin/main, commit 1d2ec5a, Fase 19O). ──────────────────

Deno.test("debug-insert-tracking, como qualquer action não reconhecida, recebe 400 -- não existe mais tratamento algum para essa string", async () => {
  const src = await readIndexSource();
  const rejectIdx = src.indexOf("Allowlist estrita");
  // A allowlist rejeita qualquer action !== resume_funnel incondicionalmente
  // -- debug-insert-tracking cai nesse caminho igual a qualquer outra string
  // não reconhecida, sem branch dedicado.
  const block = src.slice(rejectIdx, rejectIdx + 1100);
  assertEquals(block.includes('action !== "resume_funnel"'), true);
  assertEquals(/action\s*!==\s*"resume_funnel"\s*&&\s*action\s*!==\s*"debug-insert-tracking"/.test(block), false);
});

Deno.test("nenhum SELECT count(*) global (sem filtro) em lead_tracking sobrevive, e a rota não autenticada que escrevia sem organization_id foi removida -- os INSERTs legítimos (atribuição de mensagem inbound) permanecem intactos", async () => {
  const src = await readIndexSource();
  // Os 2 INSERTs legítimos em lead_tracking (atribuição de mensagem inbound,
  // já escopados por lead/organização pelo restante do handler) continuam
  // existindo -- não fazem parte do escopo desta remoção.
  const legitInsertOccurrences = (src.match(/supabase\.from\("lead_tracking"\)\.insert\(tracking\)/g) || []).length;
  assertEquals(legitInsertOccurrences, 2, "os 2 INSERTs legítimos pré-existentes de lead_tracking devem permanecer intocados");
  // O COUNT global (sem organization_id) e os identificadores exclusivos do
  // helper removido não sobrevivem em nenhum lugar do arquivo.
  assertEquals(src.includes("count: 'exact', head: true"), false);
  assertEquals(src.includes("lead_tracking_id"), false);
  assertEquals(src.includes("count_after"), false);
});

Deno.test("a função debugInsertTracking, a string 'debug-insert-tracking' executável e os dois branches não existem mais no source", async () => {
  const src = await readIndexSource();
  assertEquals(src.includes("debugInsertTracking"), false, "nem a definição nem nenhuma chamada da função sobrevivem");
  // A única ocorrência remanescente da string é o comentário explicativo da
  // remoção, no bloco de rejeição -- não um literal usado em comparação
  // executável (`action === "debug-insert-tracking"`).
  assertEquals(src.includes('action === "debug-insert-tracking"'), false);
  const literalOccurrences = (src.match(/debug-insert-tracking/g) || []).length;
  assertEquals(literalOccurrences, 1, "só deve sobrar a menção no comentário explicando a remoção -- zero uso executável");
});

Deno.test("a segunda ocorrência morta (releitura de url.searchParams dentro do fluxo de mensagem) também foi removida -- não sobrevive um segundo `new URL(req.url)` redundante no meio do handler", async () => {
  const src = await readIndexSource();
  // Só a leitura original de `url`/`queryAction`, no topo do handler,
  // permanece.
  const urlConstructorOccurrences = (src.match(/new URL\(req\.url\)/g) || []).length;
  assertEquals(urlConstructorOccurrences, 1, "deve sobrar exatamente 1 `new URL(req.url)` -- a do topo do handler; a releitura redundante dentro do fluxo de mensagem foi removida junto com o branch morto");
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
