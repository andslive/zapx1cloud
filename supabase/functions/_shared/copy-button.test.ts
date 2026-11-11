// deno test --allow-import copy-button.test.ts

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCopyButtonMenuPayload, COPY_BUTTON_TEXT } from "./copy-button.ts";

Deno.test("sem imagem: sem campo file, text U+200B, 1 choice copy", () => {
  assertEquals(
    buildCopyButtonMenuPayload({
      number: "5511999990000",
      label: "Copiar llave Bre-B",
      value: "@minhallave",
    }),
    {
      number: "5511999990000",
      type: "button",
      text: "\u200B",
      choices: ["Copiar llave Bre-B|copy:@minhallave"],
    },
  );
});

Deno.test("com imagem: file com a URL", () => {
  assertEquals(
    buildCopyButtonMenuPayload({
      number: "5511999990000",
      label: "Copiar llave Bre-B",
      value: "@minhallave",
      imageUrl: "https://x.supabase.co/storage/v1/object/public/a/qr.png",
    }),
    {
      number: "5511999990000",
      type: "button",
      text: "\u200B",
      choices: ["Copiar llave Bre-B|copy:@minhallave"],
      file: "https://x.supabase.co/storage/v1/object/public/a/qr.png",
    },
  );
});

Deno.test("imagem vazia/espaços não gera file", () => {
  const p = buildCopyButtonMenuPayload({ number: "1", label: "a", value: "b", imageUrl: "  " });
  assertEquals("file" in (p as object), false);
});

Deno.test("rótulo/valor vazios => null", () => {
  assertEquals(buildCopyButtonMenuPayload({ number: "1", label: " ", value: "x" }), null);
  assertEquals(buildCopyButtonMenuPayload({ number: "1", label: "x", value: "" }), null);
});

Deno.test("'|' no rótulo é removido; '|' no valor é preservado", () => {
  const p = buildCopyButtonMenuPayload({ number: "1", label: "A|B", value: "x|y" });
  assertEquals(p?.choices, ["A B|copy:x|y"]);
});

Deno.test("text é U+200B (nunca vazio, nunca ASCII visível)", () => {
  const p = buildCopyButtonMenuPayload({ number: "1", label: "a", value: "b" })!;
  assertEquals(p.text, "\u200B");
  assertEquals(COPY_BUTTON_TEXT.length, 1);
  assertEquals(COPY_BUTTON_TEXT.charCodeAt(0), 0x200b);
});
