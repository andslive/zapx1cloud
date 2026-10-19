/**
 * Interpretação única de valores monetários de comprovantes (BRL e COP).
 *
 * Regra: o ÚLTIMO separador, quando há os dois (`.` e `,`), é o decimal.
 * Com um único tipo de separador:
 *  - grupos de exatamente 3 dígitos depois do separador (`10.000`, `1.234.567`,
 *    `10,000`) => separador de MILHAR (valores COP como "$ 10.000" não têm decimais);
 *  - 1 ou 2 dígitos depois (`15,5`, `37.90`, `4.50`) => decimal;
 *  - parte inteira começando em 0 (`0.500`) => decimal;
 *  - qualquer outra forma ambígua (`1.2.3`, `12.3456`) => null (nunca adivinha).
 * Retorna null para vazio/zero/negativo/não numérico.
 */
export function parseMoneyAmount(raw: unknown): number | null {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    const intPart = s.slice(0, s.lastIndexOf(dec));
    const groups = intPart.split(thou);
    // parte inteira: 1–3 dígitos iniciais e grupos de exatamente 3 (ex.: "1.500", "10.000.000")
    const validGroups = !intPart.includes(dec) && groups[0].length >= 1 && groups[0].length <= 3 &&
      groups.slice(1).every((g) => g.length === 3);
    if (!validGroups) return null; // ex.: "1,5,3.20"
    s = groups.join("") + "." + s.slice(s.lastIndexOf(dec) + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const first = parts[0];
    const rest = parts.slice(1);
    const thousands = first.length >= 1 && first.length <= 3 && !first.startsWith("0") &&
      rest.every((p) => p.length === 3);
    if (thousands) s = parts.join("");
    else if (parts.length === 2 && (rest[0].length === 1 || rest[0].length === 2 || first.startsWith("0"))) {
      s = first + "." + rest[0];
    } else return null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
