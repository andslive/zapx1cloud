// FASE 16B — camada de endurecimento HTTP compartilhada, exclusiva dos
// dois endpoints administrativos HookCloud (`hookcloud-provision-connection`
// e `hookcloud-rotate-credentials`). Não é um mecanismo genérico do
// projeto — não existe hoje nenhum helper de allowlist de origem/CORS
// canônico no repositório (confirmado por busca antes de criar este
// arquivo); este módulo fica deliberadamente pequeno e limitado a esses
// dois endpoints, em vez de generalizar um padrão novo para o projeto
// inteiro fora do escopo desta fase.
//
// Responsabilidades, e SOMENTE estas:
//   1) allowlist exata de origens administrativas (`HOOKCLOUD_ADMIN_ALLOWED_ORIGINS`);
//   2) cabeçalhos CORS construídos a partir dessa allowlist (nunca `*`);
//   3) cabeçalhos anti-cache (`Cache-Control: no-store`, e o par
//      `Pragma`/`Expires` para respostas que carregam credenciais brutas);
//   4) leitura do corpo da requisição com limite REAL de bytes (lendo o
//      stream de verdade, nunca confiando só em `Content-Length`);
//   5) validação do `Content-Type` declarado.
//
// Nunca contém lógica de negócio, autenticação, autorização ou chamada a
// RPC — isso continua exclusivamente em `handleProvisionRequest`/
// `handleRotateCredentialsRequest`, inalterados por este módulo.

/** 16 KiB — generoso o bastante para os campos administrativos reais (nomes, IDs Meta, token de acesso, flags booleanas), pequeno o bastante para rejeitar um corpo absurdo antes de gastar memória/CPU. */
export const HOOKCLOUD_ADMIN_MAX_BODY_BYTES = 16 * 1024;

/** Nunca cacheável — nem sucesso, nem erro, nem preflight. */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store",
});

/** Além de `no-store`: reforço explícito para respostas que carregam credenciais brutas (callback secret, verify token) — nunca armazenadas por navegador, CDN ou proxy intermediário. */
export const CREDENTIAL_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "Expires": "0",
});

/**
 * FASE 17A (achado de revisão): confirma que `candidate` é uma origem
 * bem formada — exatamente `scheme://host[:port]`, nunca path, query,
 * fragmento ou credenciais embutidas (uma origem real de navegador,
 * enviada no header `Origin`, nunca tem nenhum desses componentes; uma
 * entrada de configuração que os tivesse nunca combinaria com um
 * `Origin` real de qualquer forma — mas antes desta correção era aceita
 * silenciosamente na allowlist como uma entrada "morta", em vez de
 * rejeitada explicitamente). Exige HTTPS, com a MESMA exceção restrita
 * já usada em `isTrustedCallbackBaseUrl` (`hookcloud-provision-connection`)
 * para desenvolvimento local — nunca uma heurística ampla, só
 * `127.0.0.1`/`localhost` em HTTP.
 */
function isWellFormedAdministrativeOrigin(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
  if (parsed.search !== "") return false;
  if (parsed.hash !== "") return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) return true;
  return false;
}

/**
 * Allowlist exata de origens administrativas, lida de
 * `HOOKCLOUD_ADMIN_ALLOWED_ORIGINS` (lista separada por vírgulas).
 * Normaliza SOMENTE espaços externos de cada entrada — nunca interpreta
 * substring, wildcard ou regex. Uma entrada literal `"*"` é
 * deliberadamente descartada (defesa contra configuração acidentalmente
 * permissiva) — esta allowlist nunca aceita "qualquer origem" por
 * construção. Entradas malformadas (path/query/fragmento/credenciais
 * embutidas, esquema inseguro fora da exceção de desenvolvimento local)
 * são descartadas, nunca aceitas como uma "origem" literal qualquer.
 * Entradas válidas são normalizadas para a forma canônica
 * `scheme://host[:port]` via `URL.origin` (nunca reescreve o HOST em si
 * — só remove uma eventual barra final redundante), que é exatamente o
 * formato que o header `Origin` real de um navegador sempre tem.
 * Variável ausente/vazia => allowlist vazia => toda requisição de
 * navegador com `Origin` falha fechada (nenhuma origem é permitida por
 * padrão).
 */
export function resolveHookCloudAdminAllowedOrigins(
  env: { get(key: string): string | undefined } = Deno.env,
): ReadonlySet<string> {
  const raw = env.get("HOOKCLOUD_ADMIN_ALLOWED_ORIGINS") ?? "";
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "*")
    .filter(isWellFormedAdministrativeOrigin)
    .map((s) => new URL(s).origin);
  return new Set(origins);
}

export interface CorsDecision {
  /** Cabeçalhos a mesclar na resposta — vazio quando não há Origin (contexto não-browser) ou quando a origem é rejeitada. */
  headers: Record<string, string>;
  /** `true` quando a requisição pode prosseguir (sem Origin — contexto servidor-servidor — OU Origin explicitamente permitida). `false` somente quando existe um Origin e ele NÃO está na allowlist. */
  allowed: boolean;
}

/**
 * Decide CORS por comparação EXATA de string contra a allowlist — nunca
 * substring, nunca prefixo, nunca `Host`/`Referer`/body/query como fonte
 * de verdade (só o header `Origin` real da requisição).
 *
 * Ausência de `Origin` (chamada servidor-servidor, sem contexto de
 * navegador) é tratada como "prossiga" aqui — CORS é um mecanismo do
 * NAVEGADOR; sua ausência não isenta a requisição de autenticação JWT
 * completa, que continua acontecendo no handler downstream inalterado.
 *
 * Nunca inclui `Access-Control-Allow-Credentials: true` — a autenticação
 * é exclusivamente via header `Authorization: Bearer`, nunca cookie.
 */
export function buildCorsDecision(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): CorsDecision {
  if (origin === null) {
    return { headers: {}, allowed: true };
  }
  if (!allowedOrigins.has(origin)) {
    return { headers: {}, allowed: false };
  }
  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  };
}

/** Compara o tipo de mídia declarado ignorando parâmetros (`; charset=utf-8` etc.) — só `application/json` é aceito. */
export function isAcceptableJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json";
}

export type ReadJsonBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "empty" | "invalid_utf8" };

/**
 * Lê o corpo da requisição em bytes REAIS do stream, abortando assim que
 * o total ultrapassa `maxBytes` — nunca confia isoladamente em
 * `Content-Length` (que pode estar ausente, incorreto, ou mentir sobre o
 * tamanho real). Funciona igualmente bem com corpos `chunked` (sem
 * `Content-Length` algum). Lê o stream UMA vez; o chamador é responsável
 * por nunca tentar ler o `Request` original de novo depois desta chamada
 * (o body já foi consumido) — para repassar adiante, construa um novo
 * `Request` a partir do texto já lido aqui.
 */
export async function readJsonBodyWithLimit(req: Request, maxBytes: number): Promise<ReadJsonBodyResult> {
  const reader = req.body?.getReader();
  if (!reader) {
    return { ok: false, reason: "empty" };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  }
  if (total === 0) {
    return { ok: false, reason: "empty" };
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    // FASE 17A (achado de revisão): `{ fatal: true }` — sem isso,
    // `TextDecoder` por padrão SUBSTITUI silenciosamente sequências de
    // bytes UTF-8 inválidas por U+FFFD em vez de rejeitar, o que
    // significa que um corpo corrompido/malicioso não seria detectado
    // aqui (poderia até "acidentalmente" virar JSON válido depois da
    // substituição silenciosa). Com `fatal: true`, bytes inválidos
    // lançam, e tratamos isso como rejeição explícita de transporte.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}

/** `true` somente se `text` é JSON sintaticamente válido — usado só como gate de transporte (400 cedo), nunca substitui a validação de campos que já acontece dentro dos handlers auditados. */
export function isSyntacticallyValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
