// deno test --allow-import hookcloud-authorization.test.ts
//
// FASE 21G — testes da política canônica única de autorização HookCloud,
// compartilhada entre hookcloud-provision-connection e
// hookcloud-rotate-credentials (e espelhada pelo frontend em
// canManageHookCloud, src/lib/hookcloud/hookCloudAuthorization.ts).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { HOOKCLOUD_AUTHORIZED_ROLES, isHookCloudAuthorizedRole } from "./hookcloud-authorization.ts";

Deno.test("allowlist canônica é exatamente {admin, super_admin} — nem mais, nem menos", () => {
  assertEquals(HOOKCLOUD_AUTHORIZED_ROLES.size, 2);
  assertEquals(HOOKCLOUD_AUTHORIZED_ROLES.has("admin"), true);
  assertEquals(HOOKCLOUD_AUTHORIZED_ROLES.has("super_admin"), true);
  assertEquals(HOOKCLOUD_AUTHORIZED_ROLES.has("manager"), false);
  assertEquals(HOOKCLOUD_AUTHORIZED_ROLES.has("seller"), false);
});

Deno.test("admin sozinho autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole(["admin"]), true);
});

Deno.test("super_admin sozinho autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole(["super_admin"]), true);
});

Deno.test("admin e super_admin juntos autorizam", () => {
  assertEquals(isHookCloudAuthorizedRole(["admin", "super_admin"]), true);
});

Deno.test("admin junto com manager ainda autoriza (um papel autorizado entre vários basta)", () => {
  assertEquals(isHookCloudAuthorizedRole(["admin", "manager"]), true);
});

Deno.test("manager sozinho NÃO autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole(["manager"]), false);
});

Deno.test("seller sozinho NÃO autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole(["seller"]), false);
});

Deno.test("manager e seller juntos (nenhum papel autorizado) NÃO autorizam", () => {
  assertEquals(isHookCloudAuthorizedRole(["manager", "seller"]), false);
});

Deno.test("papel desconhecido/inventado NÃO autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole(["papel_inventado"]), false);
});

Deno.test("capitalização/grafia inválida NÃO autoriza — comparação exata, nunca normalizada", () => {
  assertEquals(isHookCloudAuthorizedRole(["Admin"]), false);
  assertEquals(isHookCloudAuthorizedRole(["ADMIN"]), false);
  assertEquals(isHookCloudAuthorizedRole(["Super_Admin"]), false);
  assertEquals(isHookCloudAuthorizedRole(["SUPER_ADMIN"]), false);
});

Deno.test("lista de papéis vazia NÃO autoriza", () => {
  assertEquals(isHookCloudAuthorizedRole([]), false);
});
