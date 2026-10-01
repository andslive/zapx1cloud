// deno test --allow-import uazapi-recipient.test.ts
// Funções puras. Identificadores SINTÉTICOS, no formato real observado
// (`<15 dígitos>@lid` com sender_pn vazio).
import { isLidJid, resolveUazapiRecipient, resolveWebhookSendTarget } from "./uazapi-recipient.ts";
import { normalizePhoneBR } from "./phone.ts";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const LID15 = "900000000000001@lid";
const LID14 = "90000000000002@lid";

// Fórmula ANTERIOR (uazapi-send @ 7c2ce81), reproduzida para provar que o caminho de telefone não mudou.
function legacy(to: string) {
  const rawPhone = to.replace(/\D/g, "");
  const phone = normalizePhoneBR(rawPhone) || rawPhone;
  const jid = to.includes("@") ? to : `${phone}@s.whatsapp.net`;
  return { number: phone, jid };
}

Deno.test("LID de 15 e 14 dígitos: number e jid mantêm o sufixo @lid; nunca viram telefone", () => {
  for (const lid of [LID15, LID14]) {
    const r = resolveUazapiRecipient(lid, normalizePhoneBR);
    assertEquals(r.kind, "lid");
    assertEquals(r.number, lid);
    assertEquals(r.jid, lid);
    assertFalse(r.jid.includes("s.whatsapp.net"));
  }
});

Deno.test("LID com ':device' e sufixo em maiúsculas é normalizado sem inventar telefone", () => {
  assertEquals(resolveUazapiRecipient("900000000000001:7@lid", normalizePhoneBR).number, LID15);
  assertEquals(resolveUazapiRecipient("900000000000001@LID", normalizePhoneBR).number, LID15);
});

Deno.test("LID que parece telefone BR (12-13 dígitos começando com 55) NÃO passa por normalizePhoneBR", () => {
  for (const d of ["551199999999", "5511999999999"]) {
    const r = resolveUazapiRecipient(`${d}@lid`, normalizePhoneBR);
    assertEquals(r.number, `${d}@lid`);
    assertEquals(r.kind, "lid");
  }
});

Deno.test("caminho de telefone idêntico ao anterior (entradas variadas)", () => {
  const inputs = [
    "5511999999999", "11999999999", "1199999999", "+55 (11) 99999-9999", "5511999999999@s.whatsapp.net",
    "5511999999999:12@s.whatsapp.net", "573001234567", "447911123456", "120363000000000000@g.us",
    "123", "", "abc", "5511999999999@c.us", "00551199999999",
  ];
  for (const i of inputs) {
    const r = resolveUazapiRecipient(i, normalizePhoneBR);
    const l = legacy(i);
    assertEquals({ number: r.number, jid: r.jid }, l, `divergiu para ${JSON.stringify(i)}`);
    assertEquals(r.kind, "phone");
  }
});

Deno.test("isLidJid: aceita só <dígitos>@lid; rejeita telefone, g.us, texto e valores não-string", () => {
  assert(isLidJid(LID15));
  for (const v of ["5511999999999", "5511999999999@s.whatsapp.net", "12036300@g.us", "abc@lid", "@lid", "1234@lid", "", null, undefined, 123]) {
    assertFalse(isLidJid(v), `não deveria ser LID: ${String(v)}`);
  }
});

Deno.test("resolveWebhookSendTarget: LID => o próprio @lid; telefone resolvido (sender_pn) => telefone, como antes", () => {
  assertEquals(resolveWebhookSendTarget(LID15, "900000000000001"), LID15);
  assertEquals(resolveWebhookSendTarget("5511999999999@s.whatsapp.net", "5511999999999"), "5511999999999");
  assertEquals(resolveWebhookSendTarget("", "5511999999999"), "5511999999999");
  assertEquals(resolveWebhookSendTarget(undefined, "5511999999999"), "5511999999999");
});
