// deno test --allow-read --allow-env supabase/functions/whatsapp-proxy/archive-instance.test.ts
//
// FASE 20H — cobre o núcleo de `archive_instance`, extraído para
// `archive-instance.ts` (ver comentário no topo daquele módulo). Este
// arquivo testa SÓ `performArchiveInstance` (id/provider/escrita/
// idempotência/concorrência) — a autorização (só super_admin real) já é
// coberta separadamente em `connection-authorization.test.ts`
// (`authorizeSuperAdminForArchive`). Mock estrutural do client Supabase,
// sem nenhuma chamada de rede real, sem credencial real, sem UazAPI/Meta.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { performArchiveInstance, type ArchiveQueryClient } from "./archive-instance.ts";

interface FakeInstanceRow {
  id: string;
  organization_id: string;
  name: string;
  custom_name?: string | null;
  provider?: string | null;
  status: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
}

/**
 * Mock em memória de `evolution_instances`, suportando exatamente as
 * cadeias usadas por `performArchiveInstance`:
 *   select(...).eq('id', x).maybeSingle()
 *   update(patch).eq('id', x).is('archived_at', null).select(...).maybeSingle()
 * O `update` só é aplicado de fato (efeito colateral no array em memória)
 * quando a condição `archived_at IS NULL` bate no momento da execução —
 * modela a mesma atomicidade do `UPDATE ... WHERE` real do Postgres o
 * bastante para testar a reconciliação de corrida (`raceWinner`).
 */
function makeFakeSupabase(opts: {
  rows: FakeInstanceRow[];
  /** Se setado, simula que outra chamada arquivou a linha ENTRE o SELECT
   * inicial e o UPDATE desta chamada (condição de corrida real). */
  raceWinnerFor?: string;
  /** Força `update(...)` a devolver um erro simulado (falha de rede/DB). */
  forceUpdateError?: boolean;
  /** Força o SELECT inicial a devolver um erro simulado. */
  forceFindError?: boolean;
}): ArchiveQueryClient {
  const rows = opts.rows;

  return {
    from(table: string) {
      if (table !== "evolution_instances") {
        throw new Error(`unexpected table in test mock: ${table}`);
      }
      const state: { idFilter?: string; updatePatch?: Record<string, any>; isArchivedNull?: boolean } = {};
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, value: unknown) {
          if (col === "id") state.idFilter = String(value);
          return builder;
        },
        is(col: string, value: null) {
          if (col === "archived_at" && value === null) state.isArchivedNull = true;
          return builder;
        },
        update(patch: Record<string, any>) {
          state.updatePatch = patch;
          return builder;
        },
        async maybeSingle() {
          const row = rows.find((r) => r.id === state.idFilter) ?? null;

          if (state.updatePatch) {
            if (opts.forceUpdateError) {
              return { data: null, error: { message: "simulated update error" } };
            }
            if (!row) return { data: null, error: null };

            // FASE 20H (teste) — condição de corrida: outra chamada
            // "venceu" e arquivou a linha exatamente antes deste UPDATE.
            if (opts.raceWinnerFor === row.id && row.archived_at == null) {
              row.archived_at = "2026-08-24T12:00:00.000Z";
              row.archived_by = "race-winner-user";
              row.archive_reason = null;
            }

            const conditionOk = !state.isArchivedNull || row.archived_at == null;
            if (!conditionOk) {
              return { data: null, error: null }; // 0 linhas afetadas
            }
            Object.assign(row, state.updatePatch);
            return { data: { ...row }, error: null };
          }

          if (opts.forceFindError) {
            return { data: null, error: { message: "simulated find error" } };
          }
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return builder;
    },
  };
}

const ORG_A = "org-a";
const USER_SUPER = "user-super";
const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const OTHER_UUID = "22222222-2222-2222-2222-222222222222";

function activeRow(overrides: Partial<FakeInstanceRow> = {}): FakeInstanceRow {
  return {
    id: VALID_UUID,
    organization_id: ORG_A,
    name: "Conexão Teste",
    provider: "uazapi",
    status: "connected",
    archived_at: null,
    ...overrides,
  };
}

// 1) UUID malformado
Deno.test("id malformado => invalid_id, nunca consulta o banco", async () => {
  const supabase = makeFakeSupabase({ rows: [activeRow()] });
  const result = await performArchiveInstance({ supabase, id: "nao-e-um-uuid", actingUserId: USER_SUPER });
  assertEquals(result.kind, "invalid_id");
});

Deno.test("id ausente/vazio => invalid_id", async () => {
  const supabase = makeFakeSupabase({ rows: [activeRow()] });
  const result = await performArchiveInstance({ supabase, id: "", actingUserId: USER_SUPER });
  assertEquals(result.kind, "invalid_id");
});

// 2) UUID inexistente
Deno.test("UUID bem formado mas inexistente => not_found", async () => {
  const supabase = makeFakeSupabase({ rows: [activeRow()] });
  const result = await performArchiveInstance({ supabase, id: OTHER_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "not_found");
});

// 3) provider desconhecido — falha fechada, nunca arquiva
Deno.test("provider desconhecido => unsupported_provider, linha NUNCA é escrita", async () => {
  const row = activeRow({ provider: "chromium" });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "unsupported_provider");
  assertEquals(row.archived_at, null); // nunca escreveu
});

// 4) providers conhecidos: uazapi, meta_cloud, legado (null)
Deno.test("provider 'uazapi' => arquiva com sucesso", async () => {
  const row = activeRow({ provider: "uazapi" });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "success");
  if (result.kind === "success") assertEquals(result.alreadyArchived, false);
});

Deno.test("provider 'meta_cloud' (Meta/HookCloud) => arquiva com sucesso — archive_instance é agnóstico de provider, diferente das ações de transporte UazAPI", async () => {
  const row = activeRow({ provider: "meta_cloud", status: "disconnected" });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "success");
});

Deno.test("provider ausente (legado, retrocompat.) => tratado como uazapi, arquiva com sucesso", async () => {
  const row = activeRow({ provider: null });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "success");
});

// 5) conexão ativa arquivada com sucesso — DTO sanitizado, nunca token
Deno.test("conexão ativa arquivada com sucesso => success/alreadyArchived=false, DTO nunca inclui token/qr_code/metadata", async () => {
  const row = activeRow({ custom_name: "Nome Customizado" });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({
    supabase, id: VALID_UUID, actingUserId: USER_SUPER, reason: "teste de arquivamento",
  });
  assertEquals(result.kind, "success");
  if (result.kind !== "success") return;
  assertEquals(result.alreadyArchived, false);
  assertEquals(result.instance.id, VALID_UUID);
  assertEquals(result.instance.organization_id, ORG_A);
  assertEquals(result.instance.name, "Nome Customizado"); // custom_name tem prioridade
  assertEquals(result.instance.archived_by, USER_SUPER);
  assertEquals(result.instance.archive_reason, "teste de arquivamento");
  assertExists(result.instance.archived_at);
  // Nenhuma das chaves abaixo pode aparecer no DTO — checagem estrutural.
  const dtoKeys = Object.keys(result.instance);
  for (const forbidden of ["instance_token", "qr_code", "metadata", "health_data", "webhook_url"]) {
    assertEquals(dtoKeys.includes(forbidden), false, `DTO nunca deveria conter '${forbidden}'`);
  }
});

// 6) idempotência: já arquivada
Deno.test("conexão já arquivada => success/alreadyArchived=true, NUNCA sobrescreve archived_by/archive_reason antigos", async () => {
  const row = activeRow({
    archived_at: "2026-08-01T00:00:00.000Z",
    archived_by: "user-original",
    archive_reason: "motivo original",
  });
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({
    supabase, id: VALID_UUID, actingUserId: "user-diferente", reason: "motivo novo, nunca deveria vencer",
  });
  assertEquals(result.kind, "success");
  if (result.kind !== "success") return;
  assertEquals(result.alreadyArchived, true);
  assertEquals(result.instance.archived_by, "user-original");
  assertEquals(result.instance.archive_reason, "motivo original");
});

// 7) duas chamadas concorrentes — reconciliação
Deno.test("condição de corrida real (outra chamada venceu entre o SELECT e o UPDATE) => reconcilia para success/alreadyArchived=true, nunca erro", async () => {
  const row = activeRow();
  const supabase = makeFakeSupabase({ rows: [row], raceWinnerFor: VALID_UUID });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "success");
  if (result.kind !== "success") return;
  assertEquals(result.alreadyArchived, true);
  assertEquals(result.instance.archived_by, "race-winner-user"); // preserva quem venceu de verdade
});

// 8) erro interno na busca inicial
Deno.test("erro simulado no SELECT inicial => internal_error, nunca lança exceção não tratada", async () => {
  const supabase = makeFakeSupabase({ rows: [activeRow()], forceFindError: true });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "internal_error");
});

// 9) erro interno no UPDATE
Deno.test("erro simulado no UPDATE => internal_error, nunca reporta sucesso", async () => {
  const supabase = makeFakeSupabase({ rows: [activeRow()], forceUpdateError: true });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "internal_error");
});

// 10) nenhuma outra linha é tocada
Deno.test("arquivar uma conexão nunca altera outra linha (nenhum vazamento entre conexões)", async () => {
  const target = activeRow({ id: VALID_UUID });
  const bystander = activeRow({ id: OTHER_UUID, name: "Conexão Intocada" });
  const supabase = makeFakeSupabase({ rows: [target, bystander] });
  await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(target.archived_at !== null, true);
  assertEquals(bystander.archived_at, null); // nunca tocada
});

// 11) reason muito longo é truncado, nunca rejeitado
Deno.test("reason maior que 500 caracteres é truncado, nunca causa erro", async () => {
  const row = activeRow();
  const supabase = makeFakeSupabase({ rows: [row] });
  const longReason = "x".repeat(1000);
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER, reason: longReason });
  assertEquals(result.kind, "success");
  if (result.kind !== "success") return;
  assertEquals(result.instance.archive_reason?.length, 500);
});

// 12) reason ausente/vazio vira null, nunca string vazia
Deno.test("reason ausente => archive_reason null (nunca string vazia)", async () => {
  const row = activeRow();
  const supabase = makeFakeSupabase({ rows: [row] });
  const result = await performArchiveInstance({ supabase, id: VALID_UUID, actingUserId: USER_SUPER });
  assertEquals(result.kind, "success");
  if (result.kind !== "success") return;
  assertEquals(result.instance.archive_reason, null);
});
