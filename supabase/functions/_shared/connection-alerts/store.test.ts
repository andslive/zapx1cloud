import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { classifyStoreError, createSupabaseEpisodeStore, EpisodeStoreError } from "./store.ts";
import { openSuspicion, processDueEpisodes, type Deps, type Episode } from "./episode.ts";

/** supabase-js falso: toda cadeia (insert/select/eq/...) termina resolvendo `result`. */
function fakeSupabase(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const chain: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === "then" ? (res: any) => res({ data: result.data ?? null, error: result.error ?? null }) : () => chain),
    apply: () => chain,
  });
  return { from: () => chain };
}
const MISSING = { code: "PGRST205", message: "Could not find the table 'public.connection_disconnect_episodes' in the schema cache" };
const EP = { id: "e", connection_id: "c", version: 1 } as Episode;

Deno.test("classifyStoreError: tabela ausente, permissão e genérico têm códigos estáveis", () => {
  assertEquals(classifyStoreError("x", MISSING).code, "episodes_table_missing");
  assertEquals(classifyStoreError("x", { code: "42P01", message: 'relation "public.connection_disconnect_episodes" does not exist' }).code, "episodes_table_missing");
  assertEquals(classifyStoreError("x", { code: "42501", message: "permission denied for table connection_disconnect_episodes" }).code, "episodes_permission_denied");
  assertEquals(classifyStoreError("x", { code: "57014", message: "timeout" }).code, "episodes_store_error");
  assert(!JSON.stringify(classifyStoreError("x", MISSING)).includes("token"));
});

Deno.test("store: erro NÃO vira 'CAS perdido': claim/update/listDue/get/open lançam com código identificável", async () => {
  const st = createSupabaseEpisodeStore(fakeSupabase({ error: MISSING }));
  for (const [name, fn] of Object.entries({
    listDue: () => st.listDue(new Date(), 5), get: () => st.get("e"), claim: () => st.claim(EP, new Date()),
    update: () => st.update(EP, { state: "closed" }), open: () => st.open({ organization_id: "o", connection_id: "c", now: new Date(), source: "t" }),
  })) {
    const err = await assertRejects(fn as () => Promise<unknown>, EpisodeStoreError, "", name) as EpisodeStoreError;
    assertEquals(err.code, "episodes_table_missing", name);
  }
});

Deno.test("store: 0 linhas atualizadas é CAS perdido (null), não erro", async () => {
  const st = createSupabaseEpisodeStore(fakeSupabase({ data: [] }));
  assertEquals(await st.claim(EP, new Date()), null);
  assertEquals(await st.update(EP, { state: "closed" }), null);
});

Deno.test("operacional: openSuspicion sem a tabela registra operational_error (não silêncio) e não lança", async () => {
  const logs: Array<[string, Record<string, unknown>]> = [];
  const deps = { store: createSupabaseEpisodeStore(fakeSupabase({ error: MISSING })), now: () => new Date(), log: (e: string, f: Record<string, unknown>) => logs.push([e, f]) } as unknown as Deps;
  const r = await openSuspicion(deps, { organization_id: "o", connection_id: "c", source: "heartbeat" });
  assertEquals(r.created, false);
  const op = logs.find(([e]) => e === "operational_error");
  assert(op, "deve haver operational_error");
  assertEquals(op![1].code, "episodes_table_missing");
  assertEquals(op![1].op, "open_suspicion");
});

Deno.test("operacional: processDueEpisodes sem a tabela devolve ok=false + error_code e loga operational_error", async () => {
  const logs: string[] = [];
  const deps = { store: createSupabaseEpisodeStore(fakeSupabase({ error: MISSING })), now: () => new Date(), log: (e: string) => logs.push(e) } as unknown as Deps;
  const r = await processDueEpisodes(deps);
  assertEquals(r.ok, false);
  assertEquals(r.error_code, "episodes_table_missing");
  assert(logs.includes("operational_error"));
});
