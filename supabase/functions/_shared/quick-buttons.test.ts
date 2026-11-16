import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildQuickButtonsMenuPayload, numberedMenuText } from "./quick-buttons.ts";

const o = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, label: `$${(i + 1) * 100}` }));

Deno.test("até 3 opções: botões de resposta com o id da opção", () => {
  const p: any = buildQuickButtonsMenuPayload({ number: "55", text: "Elige", options: o(3) });
  assertEquals(p.type, "button");
  assertEquals(p.choices, ["$100|id1", "$200|id2", "$300|id3"]);
  assertEquals(p.listButton, undefined);
});
Deno.test("mais de 3: lista; máximo 10", () => {
  const p: any = buildQuickButtonsMenuPayload({ number: "55", text: "Elige", options: o(12) });
  assertEquals(p.type, "list");
  assertEquals(p.choices.length, 10);
  assertEquals(p.listButton, "Ver opções");
});
Deno.test("texto vazio usa U+200B; '|' e quebras saem do rótulo; sem opções = null", () => {
  const p: any = buildQuickButtonsMenuPayload({ number: "55", text: "", options: [{ id: "a", label: "Sí|\nclaro" }] });
  assertEquals(p.text, "​");
  assertEquals(p.choices, ["Sí claro|a"]);
  assertEquals(buildQuickButtonsMenuPayload({ number: "55", text: "x", options: [] }), null);
});
Deno.test("reserva numerada", () => {
  assertEquals(numberedMenuText("Elige", o(2)), "Elige\n\n1) $100\n2) $200");
});
