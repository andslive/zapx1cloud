// deno test --allow-import --no-check supabase/functions/uazapi-webhook/funnel-dedup-behavioral.test.ts
//
// Testes comportamentais de cenário (revisão adversarial 2026-08-27), além
// dos testes unitários/estruturais de funnel-dedup-conversation-isolation.test.ts.
//
// LIMITAÇÃO DECLARADA: o handler principal (Deno.serve em index.ts) não é
// uma função exportada/testável isoladamente — é um único `serve(async (req)
// => {...})` de ~11 mil linhas, que espera uma `Request` HTTP real e usa o
// client Supabase real internamente em ~200 pontos (leads, conversas,
// funis, agentes, orquestrador, mídia, etc.). Extrair os 3 call sites de
// funil para funções puras testáveis exigiria uma refatoração material do
// handler inteiro — fora do escopo autorizado nesta revisão ("qualquer
// refatoração material deve ser destacada, não feita").
//
// Em vez disso, este arquivo:
//   1) usa as funções REAIS exportadas (acquireFunnelRunGate,
//      releaseFunnelRunGate) contra um mock com estado compartilhado que
//      reproduz o comportamento do índice único parcial
//      idx_lead_funnel_history_one_running (migration 20260827150100) —
//      não é a "de verdade" do Postgres, mas a mesma semântica de conflito;
//   2) reproduz, com um mock de tabela que espelha literalmente os filtros
//      usados no código real (mesmos nomes de coluna, mesma ordem de
//      .eq()), a sequência de SELECT/INSERT que os 3 call sites executam —
//      provando a COMPOSIÇÃO da lógica, não a execução linha-a-linha do
//      handler.
//
// Cada teste abaixo referencia, em comentário, a linha real do index.ts que
// a chamada simulada reproduz.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { acquireFunnelRunGate, releaseFunnelRunGate } from "./index.ts";

// ---------------------------------------------------------------------
// Mock de lead_funnel_history com estado compartilhado entre chamadas,
// simulando o índice único parcial WHERE status='running' (migration
// 20260827150100 — ainda não aplicada em produção, mas é o comportamento
// que o gate assume e que este teste prova estar corretamente delegado ao
// banco, não reimplementado em memória pelo código da aplicação).
// ---------------------------------------------------------------------
function fakeLedger() {
  const rows: { id: string; lead_id: string; funnel_id: string; status: string }[] = [];
  return {
    rows,
    from(table: string) {
      if (table !== "lead_funnel_history") throw new Error(`tabela inesperada: ${table}`);
      return {
        insert(row: any) {
          return {
            select(_c: string) {
              return {
                single() {
                  const conflict = rows.some(
                    (r) => r.lead_id === row.lead_id && r.funnel_id === row.funnel_id && r.status === "running",
                  );
                  if (conflict) {
                    return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
                  }
                  const id = crypto.randomUUID();
                  rows.push({ id, lead_id: row.lead_id, funnel_id: row.funnel_id, status: row.status });
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, id: string) {
              const idx = rows.findIndex((r) => r.id === id);
              if (idx >= 0) rows.splice(idx, 1);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    markCompleted(leadId: string, funnelId: string) {
      const r = rows.find((r) => r.lead_id === leadId && r.funnel_id === funnelId && r.status === "running");
      if (r) r.status = "completed";
    },
  };
}

const LEAD = crypto.randomUUID();
const FUNNEL = crypto.randomUUID();

// --- B: duas requisições concorrentes, mesmo lead, mesmo funnel_id, conexões diferentes ---
// Reproduz: linhas ~4413 (reopen), ~4681 (existing) e ~5326 (new) — cada uma
// chamando acquireFunnelRunGate ANTES de setar funnelToRun*/enviar bloco.

Deno.test("B: duas conexões, mesmo (lead_id, funnel_id), quase simultâneas -> exatamente uma adquire, a outra vira already_running, nenhuma segunda inicia", async () => {
  const ledger = fakeLedger();

  // Duas "requisições" concorrentes (simuladas sequencialmente, já que o
  // mock não é assíncrono de verdade — mas a MESMA lógica de conflito do
  // índice único se aplica independente da ordem de chegada).
  const resultConnA = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });
  const resultConnB = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });

  const acquiredCount = [resultConnA, resultConnB].filter((r) => r.acquired).length;
  assertEquals(acquiredCount, 1, "exatamente uma das duas conexões deve adquirir o gate");

  const blocked = [resultConnA, resultConnB].find((r) => !r.acquired);
  assertEquals((blocked as any).reason, "already_running");

  // Só existe UMA linha 'running' no ledger — prova que o "início" (o que
  // no handler real controla se current_flow_id é setado e um bloco é
  // enviado) só pode ter acontecido para o lado que adquiriu.
  assertEquals(ledger.rows.filter((r) => r.status === "running").length, 1);
});

// --- E: keyword — completed permite reentrada; running bloqueia ---
// Reproduz a checagem de `history`/`funnels_completed` (linhas ~4661-4680,
// ~4529-4547) seguida da chamada ao gate (linhas ~4685 em diante).

Deno.test("E1: funil completed -> reentrada por keyword consegue adquirir o gate normalmente (nova execução)", async () => {
  const ledger = fakeLedger();
  const first = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });
  assertEquals(first.acquired, true);
  if (first.acquired) {
    ledger.markCompleted(LEAD, FUNNEL); // simula a conclusão real (linha ~10489)
  }

  // Reentrada por keyword, funil já completed: o código real (isKeywordMatch
  // = true) chega até acquireFunnelRunGate mesmo com `history` preenchido.
  const reentry = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });
  assertEquals(reentry.acquired, true, "reentrada após completed deve conseguir iniciar nova execução");
  assertEquals(ledger.rows.filter((r) => r.status === "running").length, 1);
  assertEquals(ledger.rows.filter((r) => r.status === "completed").length, 1);
});

Deno.test("E2: funil running (em qualquer conexão) -> keyword NÃO consegue iniciar segunda execução", async () => {
  const ledger = fakeLedger();
  const first = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });
  assertEquals(first.acquired, true);

  // Segunda conexão, mensagem com keyword, funil ainda running (não completed):
  // isKeywordMatch=true faz o código pular o bloqueio de "já completou" (que
  // nem se aplicaria, pois não está completed), mas o GATE ainda intercepta.
  const second = await acquireFunnelRunGate(ledger, { leadId: LEAD, funnelId: FUNNEL });
  assertEquals(second.acquired, false);
  if (!second.acquired) {
    assertEquals((second as any).reason, "already_running");
  }
  assertEquals(ledger.rows.filter((r) => r.status === "running").length, 1);
});

// --- A: P -> C -> P, mesma lead, mesmo telefone, duas conexões, conversas estáveis ---
// Reproduz a query real de existingByPhone (linhas ~4356-4366: .eq("organization_id",...)
// .eq("channel","whatsapp").eq("visitor_phone_normalized",...).eq("connection_id", instance.id))
// e o insert de newConv (linhas ~5423+: connection_id/evolution_instance_id = instance.id).

function fakeConversationStore() {
  const rows: { id: string; organization_id: string; channel: string; visitor_phone_normalized: string; connection_id: string; status: string }[] = [];
  return {
    rows,
    // Reproduz exatamente o filtro usado na query real de existingByPhone.
    findExistingForConnection(orgId: string, phone: string, connectionId: string) {
      return rows.find(
        (r) =>
          r.organization_id === orgId &&
          r.channel === "whatsapp" &&
          r.visitor_phone_normalized === phone &&
          r.connection_id === connectionId &&
          r.status !== "closed",
      ) || null;
    },
    createFor(orgId: string, phone: string, connectionId: string) {
      const row = {
        id: crypto.randomUUID(),
        organization_id: orgId,
        channel: "whatsapp",
        visitor_phone_normalized: phone,
        connection_id: connectionId,
        status: "bot_active",
      };
      rows.push(row);
      return row;
    },
  };
}

Deno.test("A: piloto -> chip17new -> piloto, mesmo lead/telefone, duas conexões -> conversas separadas e estáveis, connection_id nunca 'vibra'", () => {
  const store = fakeConversationStore();
  const ORG = crypto.randomUUID();
  const PHONE = "5574991946784";
  const PILOTO = crypto.randomUUID();
  const CHIP17NEW = crypto.randomUUID();

  // Mensagem 1: piloto
  let conv = store.findExistingForConnection(ORG, PHONE, PILOTO);
  if (!conv) conv = store.createFor(ORG, PHONE, PILOTO);
  const pilotoConvId = conv.id;
  assertEquals(conv.connection_id, PILOTO);

  // Mensagem 2: chip17new (mesmo lead/telefone, conexão diferente)
  let conv2 = store.findExistingForConnection(ORG, PHONE, CHIP17NEW);
  if (!conv2) conv2 = store.createFor(ORG, PHONE, CHIP17NEW);
  const chip17newConvId = conv2.id;
  assertEquals(conv2.connection_id, CHIP17NEW);
  assertEquals(chip17newConvId === pilotoConvId, false, "devem ser conversas DIFERENTES");

  // Mensagem 3: piloto de novo
  let conv3 = store.findExistingForConnection(ORG, PHONE, PILOTO);
  if (!conv3) conv3 = store.createFor(ORG, PHONE, PILOTO);
  assertEquals(conv3.id, pilotoConvId, "reaproveita a MESMA conversa da piloto, não cria outra");
  assertEquals(conv3.connection_id, PILOTO, "connection_id da conversa da piloto nunca mudou para chip17new");

  // Exatamente 2 conversas no total, cada uma estável na sua conexão.
  assertEquals(store.rows.length, 2);
  assertEquals(store.rows.find((r) => r.id === pilotoConvId)?.connection_id, PILOTO);
  assertEquals(store.rows.find((r) => r.id === chip17newConvId)?.connection_id, CHIP17NEW);
});

// --- F: criação concorrente, mesmo telefone + mesma conexão -> 23505 recupera só da mesma conexão ---
// Reproduz a query real de recuperação pós-23505 (linhas ~5462-5471):
// .eq("organization_id",...).eq("channel","whatsapp").eq("visitor_phone_normalized",...)
// .eq("connection_id", instance.id).neq("status","closed")

Deno.test("F: 23505 na criação de conversa nova recupera exclusivamente a conversa da MESMA conexão, nunca de outra", () => {
  const store = fakeConversationStore();
  const ORG = crypto.randomUUID();
  const PHONE = "557491946784";
  const PILOTO = crypto.randomUUID();
  const CHIP17NEW = crypto.randomUUID();

  // Já existe conversa da piloto para este telefone (ganhou a corrida).
  const pilotoConv = store.createFor(ORG, PHONE, PILOTO);

  // chip17new tenta criar a sua e, no cenário real, um 23505 (índice
  // webchat_conv_open_phone_connection_unique) só ocorreria se JÁ houvesse
  // uma conversa aberta da MESMA conexão (chip17new) — não da piloto. Este
  // teste prova que, mesmo que o código de recuperação seja acionado, ele
  // JAMAIS encontraria a conversa da piloto, porque o filtro inclui
  // connection_id.
  const recovered = store.findExistingForConnection(ORG, PHONE, CHIP17NEW);
  assertEquals(recovered, null, "não deve recuperar a conversa da piloto para a conexão chip17new");
  assertEquals(recovered === pilotoConv, false);
});

// ---------------------------------------------------------------------
// Coexistência transitória: índice antigo (sem connection_id) ainda existe
// + índice novo (com connection_id) também existe + function nova já
// publicada + flag de rollout controla o comportamento por organização.
// Reproduz o cenário exato pedido na revisão adversarial: conversa aberta
// na piloto, mensagem chega no chip17new.
// ---------------------------------------------------------------------

function fakeConversationStoreWithOldIndex() {
  // Simula as DUAS constraints coexistindo:
  //   old: UNIQUE (org, channel, phone) WHERE status<>'closed'
  //   new: UNIQUE (org, channel, phone, connection_id) WHERE status<>'closed'
  const rows: { id: string; organization_id: string; channel: string; visitor_phone_normalized: string; connection_id: string; status: string }[] = [];
  return {
    rows,
    insert(row: { organization_id: string; channel: string; visitor_phone_normalized: string; connection_id: string; status: string }) {
      const oldConflict = rows.some(
        (r) => r.organization_id === row.organization_id && r.channel === row.channel &&
          r.visitor_phone_normalized === row.visitor_phone_normalized && r.status !== "closed",
      );
      if (oldConflict) {
        return { data: null, error: { code: "23505", constraint: "webchat_conv_open_phone_unique" } };
      }
      const newConflict = rows.some(
        (r) => r.organization_id === row.organization_id && r.channel === row.channel &&
          r.visitor_phone_normalized === row.visitor_phone_normalized &&
          r.connection_id === row.connection_id && r.status !== "closed",
      );
      if (newConflict) {
        return { data: null, error: { code: "23505", constraint: "webchat_conv_open_phone_connection_unique" } };
      }
      const created = { id: crypto.randomUUID(), ...row };
      rows.push(created);
      return { data: created, error: null };
    },
    findByConnection(orgId: string, phone: string, connectionId: string) {
      return rows.find(
        (r) => r.organization_id === orgId && r.visitor_phone_normalized === phone &&
          r.connection_id === connectionId && r.status !== "closed",
      ) || null;
    },
    findByPhoneAnyConnection(orgId: string, phone: string) {
      return rows.find(
        (r) => r.organization_id === orgId && r.visitor_phone_normalized === phone && r.status !== "closed",
      ) || null;
    },
  };
}

Deno.test("Coexistência, flag DESLIGADA (legado): conversa da piloto aberta + mensagem no chip17new -> 23505 do índice ANTIGO, recuperação SEM filtro de connection_id encontra a conversa da piloto, NENHUMA mensagem perdida", () => {
  const store = fakeConversationStoreWithOldIndex();
  const ORG = "org-1";
  const PHONE = "557491946784";
  const PILOTO = "piloto-conn";
  const CHIP17NEW = "chip17new-conn";

  // Conversa já aberta na piloto.
  const pilotoConv = store.insert({ organization_id: ORG, channel: "whatsapp", visitor_phone_normalized: PHONE, connection_id: PILOTO, status: "human_active" });
  assertEquals(pilotoConv.error, null);

  // Mensagem chega no chip17new: tenta criar conversa própria da conexão.
  const attempt = store.insert({ organization_id: ORG, channel: "whatsapp", visitor_phone_normalized: PHONE, connection_id: CHIP17NEW, status: "bot_active" });
  // Bate no índice ANTIGO primeiro (é o mais amplo, conflita primeiro).
  assertEquals(attempt.error?.code, "23505");
  assertEquals(attempt.error?.constraint, "webchat_conv_open_phone_unique");

  // Reação em legacyMode: busca SEM filtro de connection_id (replica be3116b).
  const recovered = store.findByPhoneAnyConnection(ORG, PHONE);
  assertEquals(recovered?.id, pilotoConv.data!.id, "em legacyMode, a mensagem é anexada à conversa da piloto — comportamento idêntico ao pré-existente, NENHUMA mensagem perdida (é exatamente o comportamento de produção hoje, antes desta correção)");
});

Deno.test("Coexistência, flag LIGADA (novo): mesmo cenário -> 23505 do índice antigo, recuperação COM filtro de connection_id NÃO encontra nada, falha fechada (sem cruzar conexão)", () => {
  const store = fakeConversationStoreWithOldIndex();
  const ORG = "org-1";
  const PHONE = "557491946784";
  const PILOTO = "piloto-conn";
  const CHIP17NEW = "chip17new-conn";

  const pilotoConv = store.insert({ organization_id: ORG, channel: "whatsapp", visitor_phone_normalized: PHONE, connection_id: PILOTO, status: "human_active" });
  assertEquals(pilotoConv.error, null);

  const attempt = store.insert({ organization_id: ORG, channel: "whatsapp", visitor_phone_normalized: PHONE, connection_id: CHIP17NEW, status: "bot_active" });
  assertEquals(attempt.error?.code, "23505");
  assertEquals(attempt.error?.constraint, "webchat_conv_open_phone_unique", "o conflito, quando ocorre, é sempre do índice ANTIGO nesta janela — o novo nunca conflitaria aqui, pois não existe ainda conversa do chip17new");

  // Reação com a flag ligada: busca COM filtro de connection_id.
  const recovered = store.findByConnection(ORG, PHONE, CHIP17NEW);
  assertEquals(recovered, null, "não deve recuperar a conversa da piloto — resultado correto é falhar fechado (500), nunca reutilizar conexão errada");
});

Deno.test("Coexistência: com a flag ligada e SEM conflito nenhum (nenhuma conversa prévia), a criação da conversa do chip17new funciona normalmente respeitando os dois índices", () => {
  const store = fakeConversationStoreWithOldIndex();
  const ORG = "org-2"; // organização diferente, sem conflito possível
  const PHONE = "557491946784";
  const CHIP17NEW = "chip17new-conn";

  const attempt = store.insert({ organization_id: ORG, channel: "whatsapp", visitor_phone_normalized: PHONE, connection_id: CHIP17NEW, status: "bot_active" });
  assertEquals(attempt.error, null);
  assertEquals(attempt.data?.connection_id, CHIP17NEW);
});
