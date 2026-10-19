import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseMoneyAmount } from "./money-normalize.ts";

const CASES: Array<[string, number | null]> = [
  // COP — sem decimais (formato Nequi/Bancolombia), o caso que quebrou
  ["10.000", 10000], ["$ 10.000", 10000], ["$10.000", 10000], ["20.000", 20000], ["15.000", 15000],
  ["30.000", 30000], ["120.000", 120000], ["1.234.567", 1234567], ["10,000", 10000],
  // COP/BRL com decimais
  ["10.000,00", 10000], ["$ 20.000,00", 20000], ["10,000.00", 10000], ["1.500,00", 1500], ["R$ 1.500,50", 1500.5],
  ["316,00", 316], ["316", 316], ["37,90", 37.9], ["37.90", 37.9], ["R$ 37,90", 37.9], ["4.50", 4.5], ["15,5", 15.5], ["15.5", 15.5],
  ["10", 10], ["10000", 10000], ["10 000", 10000], ["0.500", 0.5], ["0,50", 0.5],
  // inválidos/ambíguos => null (nunca adivinha)
  ["", null], ["abc", null], ["0", null], ["0,00", null], ["-15", 15], ["1.2.3", null], ["12.3456", null], ["1,5,3.20", null],
];

for (const [input, expected] of CASES) {
  Deno.test(`parseMoneyAmount(${JSON.stringify(input)}) = ${expected}`, () => {
    assertEquals(parseMoneyAmount(input), expected);
  });
}

Deno.test("regressão do incidente: comportamento ANTIGO convertia 10.000 em 10", () => {
  const old = (v: string) => {
    let x = v.replace(/[^\d.,]/g, "");
    if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", ".");
    else if (x.includes(",")) x = x.replace(",", ".");
    return parseFloat(x);
  };
  assertEquals(old("10.000"), 10); // bug reproduzido
  assertEquals(parseMoneyAmount("10.000"), 10000); // corrigido
});
