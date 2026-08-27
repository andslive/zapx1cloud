// deno test --allow-import --no-check supabase/functions/uazapi-heartbeat/presence-wiring.test.ts
//
// Guardas estruturais para a fiação da reconciliação de presence dentro do
// handler gigante do heartbeat (não extraído para função pura testável
// isoladamente — a lógica de decisão em si já é pura e testada em
// _shared/uazapi-presence-policy.test.ts; este arquivo só prova que ela
// está conectada corretamente no lugar certo).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("políticas são carregadas UMA vez por execução do heartbeat, fora do loop de instâncias", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const loadIdx = src.indexOf("await loadEnabledPresencePolicies(");
  const loopIdx = src.indexOf("instances.map(inst => processInstanceHealth(");
  assertEquals(loadIdx > 0 && loopIdx > 0 && loadIdx < loopIdx, true);
  // Só uma ocorrência de carregamento — nunca dentro de processInstanceHealth.
  const occurrences = src.split("await loadEnabledPresencePolicies(").length - 1;
  assertEquals(occurrences, 1);
});

Deno.test("reconciliação de presence usa o GET /instance/status já feito pelo heartbeat, sem nova consulta de rede", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const fnStart = src.indexOf("async function processInstanceHealth");
  const presenceIdx = src.indexOf("decidePresenceReconciliation({", fnStart);
  const statusFetchIdx = src.indexOf(`fetch(\`\${uazapiUrl}/instance/status\``, fnStart);
  assertEquals(presenceIdx > statusFetchIdx && statusFetchIdx > 0, true);
});

Deno.test("chamada de presence está envolvida em try/catch próprio, isolado do restante de processInstanceHealth", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const presenceIdx = src.indexOf("decidePresenceReconciliation({");
  const before = src.slice(Math.max(0, presenceIdx - 300), presenceIdx);
  assertEquals(before.includes("try {"), true);
});

Deno.test("falha na reconciliação de presence não impede a atualização normal de status/disconnect/reconnect (código segue depois do try/catch de presence)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const presenceIdx = src.indexOf("decidePresenceReconciliation({");
  const afterPresence = src.slice(presenceIdx, presenceIdx + 3000);
  assertEquals(afterPresence.includes("Logic for alerting and status sync"), true);
  assertEquals(afterPresence.includes("oldRealState"), true);
});

Deno.test("processInstanceHealth aceita presencePolicies com default seguro (Map vazio) — chamadas antigas sem esse argumento continuam funcionando", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.includes("presencePolicies: Map<string, DesiredPresence> = new Map()"), true);
});
