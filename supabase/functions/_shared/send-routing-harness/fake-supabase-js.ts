// Fake em memória de @supabase/supabase-js — SÓ para os harnesses de teste
// comportamental do roteamento de envio (uazapi-send e uazapi-webhook). Nunca é
// importado por código de produção (o import map do teste o injeta no lugar de
// esm.sh).
//
// Mini-banco: insert/update/delete/select com filtros eq, neq, is, in, not-is.
// Filtros não suportados são ignorados (não restringem o resultado).
//
//   FAKE_TABLE_ROWS   JSON {tabela:[linhas]} — estado inicial
//   FAKE_CALLS_FILE   JSONL com toda chamada ao "banco" (tabela, op, valores, filtros)
//   FAKE_STATE_FILE   JSON com o estado completo do mini-banco, regravado após cada escrita

import { normalizePhoneBR } from "../phone.ts";

const env = (k: string) => Deno.env.get(k);
const CALLS = env("FAKE_CALLS_FILE");
const STATE = env("FAKE_STATE_FILE");
type Row = Record<string, unknown>;
const DB = new Map<string, Row[]>();
for (const [t, rows] of Object.entries(env("FAKE_TABLE_ROWS") ? JSON.parse(env("FAKE_TABLE_ROWS")!) as Record<string, Row[]> : {})) {
  DB.set(t, structuredClone(rows));
}
for (const [t, rows] of DB) for (const r of rows) applyGenerated(t, r); // linhas semeadas também respeitam colunas geradas
const rowsOf = (t: string): Row[] => { if (!DB.has(t)) DB.set(t, []); return DB.get(t)!; };
let seq = 0;

// Colunas geradas do schema real que o fake precisa reproduzir:
//   webchat_conversations.visitor_phone_normalized = normalize_phone_br(visitor_phone)  (GENERATED ALWAYS)
function applyGenerated(table: string, row: Row) {
  if (table === "webchat_conversations" && "visitor_phone" in row) {
    row.visitor_phone_normalized = normalizePhoneBR(row.visitor_phone);
  }
}

function snapshot() {
  if (STATE) Deno.writeTextFileSync(STATE, JSON.stringify(Object.fromEntries(DB)));
}

function rec(o: unknown) {
  if (CALLS) Deno.writeTextFileSync(CALLS, JSON.stringify(o) + "\n", { append: true });
}

const FILTERS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not", "or",
  "contains", "containedBy", "filter", "match", "textSearch", "overlaps", "rangeGt",
];

function matches(r: Row, filters: unknown[][]): boolean {
  return filters.every((f) => {
    const [k, c, v, w] = f as [string, string, unknown, unknown];
    switch (k) {
      case "eq": return r[c] === v;
      case "neq": return r[c] !== v;
      case "is": return v === null ? r[c] == null : r[c] === v;
      case "in": return Array.isArray(v) && v.includes(r[c]);
      // comparações (ISO-8601 e números): linha sem o campo nunca satisfaz
      case "gt": return r[c] != null && (r[c] as string | number) > (v as string | number);
      case "gte": return r[c] != null && (r[c] as string | number) >= (v as string | number);
      case "lt": return r[c] != null && (r[c] as string | number) < (v as string | number);
      case "lte": return r[c] != null && (r[c] as string | number) <= (v as string | number);
      case "not": return v === "is" && w === null ? r[c] != null : true;
      default: return true;
    }
  });
}

// deno-lint-ignore no-explicit-any
class Query implements PromiseLike<any> {
  op = "select";
  values: unknown;
  filters: unknown[][] = [];
  returning = false;
  cols?: string;
  one: false | "single" | "maybe" = false;
  constructor(public table: string) {
    for (const f of FILTERS) {
      // deno-lint-ignore no-explicit-any
      (this as any)[f] = (...a: unknown[]) => { this.filters.push([f, ...a]); return this; };
    }
  }
  select(cols?: string) { this.returning = true; this.cols = cols; return this; }
  insert(v: unknown) { this.op = "insert"; this.values = v; return this; }
  update(v: unknown) { this.op = "update"; this.values = v; return this; }
  upsert(v: unknown) { this.op = "upsert"; this.values = v; return this; }
  delete() { this.op = "delete"; return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  // deno-lint-ignore no-explicit-any
  then(res?: any, rej?: any) { return this.exec().then(res, rej); }

  // deno-lint-ignore no-explicit-any
  private shape(rows: Row[]): { data: any; error: null } {
    const out = rows.map((r) => structuredClone(r));
    return this.one ? { data: out[0] ?? null, error: null } : { data: out, error: null };
  }

  // deno-lint-ignore no-explicit-any
  async exec(): Promise<any> {
    rec({ table: this.table, op: this.op, values: this.values, filters: this.filters, select: this.cols ?? null });
    const rows = rowsOf(this.table);
    if (this.op === "select") return this.shape(rows.filter((r) => matches(r, this.filters)));
    if (this.op === "insert" || this.op === "upsert") {
      const list = (Array.isArray(this.values) ? this.values : [this.values]) as Row[];
      const stored: Row[] = list.map((v) => ({ id: `${this.table}-${++seq}`, ...structuredClone(v) }));
      // DEFAULT now() das colunas created_at (o schema real preenche no banco)
      for (const r of stored) { if (r.created_at === undefined) r.created_at = new Date().toISOString(); applyGenerated(this.table, r); }
      rows.push(...stored);
      snapshot();
      return this.returning || this.one ? this.shape(stored) : { data: null, error: null };
    }
    if (this.op === "update") {
      const hit = rows.filter((r) => matches(r, this.filters));
      for (const r of hit) { Object.assign(r, structuredClone(this.values as Row)); applyGenerated(this.table, r); }
      snapshot();
      return this.returning || this.one ? this.shape(hit) : { data: null, error: null };
    }
    if (this.op === "delete") {
      const keep = rows.filter((r) => !matches(r, this.filters));
      rows.length = 0;
      rows.push(...keep);
      snapshot();
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

export function createClient(_url: string, _key: string) {
  const channel = () => ({
    on() { return this; },
    subscribe() { return this; },
    send() { return Promise.resolve("ok"); },
    unsubscribe() { return Promise.resolve("ok"); },
  });
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args?: unknown) => {
      rec({ table: "__rpc", op: name, values: args ?? null });
      // contratos mínimos das RPCs de lock/lease usadas pelo webhook
      const results: Record<string, unknown> = { try_acquire_conversation_lock: true, acquire_conversation_lease: "lease-token" };
      return Promise.resolve({ data: name in results ? results[name] : null, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }) }) },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel,
    removeChannel: () => Promise.resolve("ok"),
  };
}
