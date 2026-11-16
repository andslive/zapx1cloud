import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAliasEmail, normalizeForAlias, resolvePayerEmail, resolvePayerName, usableName } from "./payer-data.ts";

Deno.test("nome: ignora telefone, JID, LID, UUID e fallback numérico do pushName", () => {
  for (const bad of ["5574991946784", "+55 74 99194-6784", "5574991946784@s.whatsapp.net", "123456789012@lid", "14f398f4-c0a5-44af-9f0e-7d500b41daf9", "", "  ", "a", "🙂"]) {
    assertEquals(usableName(bad), null, String(bad));
  }
  assertEquals(usableName("  João   da Silva "), "João da Silva");
});
Deno.test("nome: ordem lead → display name → @usuário (só se aceito) → pedir", () => {
  assertEquals(resolvePayerName({ leadName: "Ana Souza", whatsappDisplayName: "Aninha" })?.source, "lead");
  assertEquals(resolvePayerName({ leadName: "5574991946784", whatsappDisplayName: "Aninha" })?.source, "whatsapp_display_name");
  assertEquals(resolvePayerName({ leadName: null, whatsappDisplayName: "5574991946784", whatsappUsername: "@ana_s" }), null);
  assertEquals(resolvePayerName({ whatsappUsername: "@ana_s", gatewayAcceptsUsername: true })?.name, "@ana_s");
  assertEquals(resolvePayerName({}), null);
});
Deno.test("e-mail: lead válido; senão alias só se configurado e confirmado; senão pergunta", () => {
  assertEquals(resolvePayerEmail({ leadEmail: "a@b.co", name: "Ana", seq: 1 }), { email: "a@b.co", source: "lead" });
  assertEquals(resolvePayerEmail({ leadEmail: "invalido", name: "Ana", seq: 1 }), null);
  const cfg = { enabled: true, providerAcceptsAlias: true, domain: "pagamentos.exemplo.com.br" };
  assertEquals(resolvePayerEmail({ leadEmail: null, name: "João Silva", seq: 12, alias: cfg }), { email: "joao.silva012@pagamentos.exemplo.com.br", source: "alias" });
  assertEquals(resolvePayerEmail({ leadEmail: null, name: "Ana", seq: 1, alias: { ...cfg, providerAcceptsAlias: false } }), null);
  assertEquals(resolvePayerEmail({ leadEmail: null, name: "Ana", seq: 1, alias: { ...cfg, enabled: false } }), null);
  assertEquals(resolvePayerEmail({ leadEmail: null, name: "Ana", seq: 1 }), null);
});
Deno.test("alias: normaliza acentos, primeiro.último e sufixo de 3 dígitos", () => {
  assertEquals(normalizeForAlias("María-José Ñandú"), "mariajosenandu");
  assertEquals(buildAliasEmail("A", 5, { enabled: true, providerAcceptsAlias: true, domain: "x.com" }), "a005@x.com");
});

Deno.test("alias: nome composto vira primeiro.último; um só nome fica simples", () => {
  const cfg = { enabled: true, providerAcceptsAlias: true, domain: "gmail.com" };
  assertEquals(buildAliasEmail("Anderson da Silva", 1, cfg), "anderson.silva001@gmail.com");
  assertEquals(buildAliasEmail("María José Ñandú", 42, cfg), "maria.nandu042@gmail.com");
  assertEquals(buildAliasEmail("Ana", 7, cfg), "ana007@gmail.com");
});
