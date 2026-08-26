// deno test --allow-import hookcloud-profiles-fixture.test.ts
//
// FASE 21K.1 — testes da allowlist canônica de colunas reais de
// `profiles`, criada após o achado crítico da Fase 21K (`disabled` nunca
// existiu no banco real; o mock de teste antigo aceitava esse campo sem
// nenhuma validação).

import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertOnlyRealProfileColumns,
  parseSelectColumns,
  PROFILES_REAL_COLUMNS,
} from "./hookcloud-profiles-fixture.ts";

Deno.test("PROFILES_REAL_COLUMNS não contém 'disabled' — é exatamente esse achado que esta allowlist existe para prevenir", () => {
  assertEquals(PROFILES_REAL_COLUMNS.has("disabled"), false);
});

Deno.test("PROFILES_REAL_COLUMNS contém 'is_active' e 'organization_id' — colunas reais usadas pelos endpoints HookCloud", () => {
  assertEquals(PROFILES_REAL_COLUMNS.has("is_active"), true);
  assertEquals(PROFILES_REAL_COLUMNS.has("organization_id"), true);
});

Deno.test("parseSelectColumns separa e limpa espaços de uma string .select()", () => {
  assertEquals(parseSelectColumns("organization_id, is_active"), ["organization_id", "is_active"]);
  assertEquals(parseSelectColumns("organization_id,is_active"), ["organization_id", "is_active"]);
});

Deno.test("assertOnlyRealProfileColumns aceita uma seleção só com colunas reais", () => {
  assertOnlyRealProfileColumns("organization_id, is_active"); // não deve lançar
});

Deno.test("assertOnlyRealProfileColumns lança para 'disabled' — a coluna que causou o achado crítico da Fase 21K", () => {
  assertThrows(() => assertOnlyRealProfileColumns("organization_id, disabled, is_active"));
});

Deno.test("assertOnlyRealProfileColumns lança para qualquer coluna inventada, não só 'disabled'", () => {
  assertThrows(() => assertOnlyRealProfileColumns("organization_id, coluna_que_nao_existe"));
});
