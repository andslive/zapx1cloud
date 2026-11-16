import { assertEquals } from "jsr:@std/assert@1";
import { extractClavesRastreo, normalizeClave, referenceClave } from "./receipt-match.ts";

Deno.test("referenceClave: remove o prefixo spei- e normaliza", () => {
  assertEquals(referenceClave("spei-085907908204332062"), "085907908204332062");
  assertEquals(referenceClave("SPEI-mban0100ab12cd34"), "MBAN0100AB12CD34");
  assertEquals(referenceClave(null), "");
});

Deno.test("extractClavesRastreo: layout de PDF com colunas", () => {
  const t = "Datos de la transferencia\nNúmero de autorización                790820\nClave de rastreo                      085907908204332062\nTipo de cuenta                        CLABE interbancaria\nConcepto  cajas tazas";
  assertEquals(extractClavesRastreo(t), ["085907908204332062"]);
});

Deno.test("extractClavesRastreo: texto lido da imagem, com variações do rótulo", () => {
  assertEquals(extractClavesRastreo("Clave de rastreo: MBAN01002611160012345678"), ["MBAN01002611160012345678"]);
  assertEquals(extractClavesRastreo("CLAVE RASTREO: ab12cd34ef56"), ["AB12CD34EF56"]);
  assertEquals(extractClavesRastreo("Cve. de rastreo 1234567890AB"), ["1234567890AB"]);
});

Deno.test("extractClavesRastreo: sem valor, sem dígito ou curta → nada", () => {
  assertEquals(extractClavesRastreo("Clave de rastreo\nTipo de cuenta  CLABE"), []);
  assertEquals(extractClavesRastreo("Clave de rastreo: 1234"), []);
  assertEquals(extractClavesRastreo("Clave de rastreo: Concepto"), []);
  assertEquals(extractClavesRastreo("Referencia numérica 161126 monto 100.00"), []);
  assertEquals(extractClavesRastreo(""), []);
});

Deno.test("extractClavesRastreo: duas claves distintas ficam ambas (decisão é do cruzamento exato)", () => {
  assertEquals(extractClavesRastreo("Clave de rastreo 111122223333444455\nOtra: Clave de rastreo 999988887777666655").length, 2);
});

Deno.test("normalizeClave", () => {
  assertEquals(normalizeClave(" ab-12 cd "), "AB12CD");
});
