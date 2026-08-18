// deno test --allow-import --allow-read meta-vault-secrets.frontend-boundary.test.ts
//
// FASE 2B.0, item 3: "Adicione teste estrutural de fronteira
// frontend/backend, mas não o trate como substituto dos testes de
// permissão no banco" — isto é exatamente esse teste auxiliar, não o
// único teste deste módulo (ver meta-vault-secrets.test.ts para os
// testes comportamentais reais).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...await walk(path));
    } else if (entry.isFile && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

Deno.test("meta-vault-secrets.ts nunca é importado por nenhum arquivo em src/ (fronteira frontend/backend)", async () => {
  const srcRoot = new URL("../../../src", import.meta.url).pathname;
  let files: string[];
  try {
    files = await walk(srcRoot);
  } catch {
    // Se src/ não existir neste ambiente de teste isolado, o teste não
    // tem o que provar — mas isso não deveria acontecer no repositório real.
    throw new Error(`Não foi possível varrer ${srcRoot} — ajuste o caminho relativo se a estrutura do repo mudar`);
  }

  const offenders: string[] = [];
  for (const file of files) {
    const content = await Deno.readTextFile(file);
    if (content.includes("meta-vault-secrets")) {
      offenders.push(file);
    }
  }

  assertEquals(offenders, [], `Arquivo(s) de frontend referenciando meta-vault-secrets.ts: ${offenders.join(", ")}`);
});
