// deno test --allow-import --no-config --unstable-sloppy-imports hookCloudAuthorization.test.ts
//
// FASE 21G — testes da decisão de papel canônica do frontend.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { canManageHookCloud } from "./hookCloudAuthorization.ts";

Deno.test("admin sozinho é suficiente", () => {
  assertEquals(canManageHookCloud(["admin"]), true);
});

Deno.test("super_admin sozinho é suficiente", () => {
  assertEquals(canManageHookCloud(["super_admin"]), true);
});

Deno.test("admin junto com super_admin é suficiente", () => {
  assertEquals(canManageHookCloud(["admin", "super_admin"]), true);
});

Deno.test("manager sozinho NÃO é suficiente", () => {
  assertEquals(canManageHookCloud(["manager"]), false);
});

Deno.test("seller sozinho NÃO é suficiente", () => {
  assertEquals(canManageHookCloud(["seller"]), false);
});

Deno.test("manager junto com seller NÃO é suficiente (nenhum papel autorizado presente)", () => {
  assertEquals(canManageHookCloud(["manager", "seller"]), false);
});

Deno.test("papel desconhecido NÃO é suficiente", () => {
  assertEquals(canManageHookCloud(["algum_papel_inventado"]), false);
});

Deno.test("capitalização inválida (Admin/ADMIN) NÃO é suficiente — comparação exata, nunca normaliza", () => {
  assertEquals(canManageHookCloud(["Admin"]), false);
  assertEquals(canManageHookCloud(["ADMIN"]), false);
  assertEquals(canManageHookCloud(["Super_Admin"]), false);
});

Deno.test("lista de papéis vazia NÃO é suficiente", () => {
  assertEquals(canManageHookCloud([]), false);
});
