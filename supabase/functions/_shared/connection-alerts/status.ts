/**
 * Classificação PURA da resposta de `GET {uazapi}/instance/status` (o mesmo endpoint que o heartbeat já usa).
 *
 * Só há três resultados. Apenas `disconnected` comprova queda; erro HTTP, timeout, corpo vazio, estado
 * desconhecido ou transitório (`connecting`) são `inconclusive` e NUNCA contam como desconexão.
 */
export type StatusProbe =
  | { kind: "connected"; state: string }
  | { kind: "disconnected"; state: string }
  | { kind: "inconclusive"; reason: string };

const CONNECTED = new Set(["CONNECTED", "OPEN", "ONLINE"]);
const DISCONNECTED = new Set(["DISCONNECTED", "CLOSE", "CLOSED", "LOGGED_OUT", "LOGGEDOUT", "OFFLINE", "WAITING_QR"]);

/** Mesma extração do heartbeat (status.connected → instance.status → state → status), sem efeitos colaterais. */
export function extractState(data: any): string {
  let s: any = "UNKNOWN";
  if (data?.status && typeof data.status === "object" && data.status.connected !== undefined) {
    s = data.status.connected ? "CONNECTED" : "DISCONNECTED";
    // `connected:false` com instance.status "connecting" é reconexão em curso, não queda comprovada.
    const inst = String(data?.instance?.status ?? "").toUpperCase();
    if (!data.status.connected && inst === "CONNECTING") s = "CONNECTING";
  } else if (data?.instance?.status !== undefined) s = data.instance.status;
  else if (data?.state !== undefined) s = data.state;
  else if (data?.status !== undefined) s = data.status;
  if (s && typeof s === "object") s = s.state || s.status || (s.connected ? "CONNECTED" : "DISCONNECTED");
  return String(s ?? "UNKNOWN").toUpperCase();
}

export function classifyStatus(httpOk: boolean, httpStatus: number, data: unknown): StatusProbe {
  if (!httpOk) return { kind: "inconclusive", reason: `http_${httpStatus}` };
  if (!data || typeof data !== "object" || Object.keys(data as object).length === 0) {
    return { kind: "inconclusive", reason: "empty_body" };
  }
  const state = extractState(data);
  if (CONNECTED.has(state)) return { kind: "connected", state };
  if (DISCONNECTED.has(state)) return { kind: "disconnected", state };
  return { kind: "inconclusive", reason: `state_${state}` };
}

/** Consulta direta à UazAPI com timeout. Qualquer exceção (timeout, rede) vira `inconclusive`. */
export async function probeInstance(
  uazapiUrl: string,
  token: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<StatusProbe> {
  const f = opts.fetchImpl ?? fetch;
  if (!uazapiUrl || !token) return { kind: "inconclusive", reason: "missing_url_or_token" };
  try {
    const res = await f(`${uazapiUrl.replace(/\/$/, "")}/instance/status`, {
      method: "GET",
      headers: { token },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const body = await res.json().catch(() => null);
    return classifyStatus(res.ok, res.status, body);
  } catch (e) {
    return { kind: "inconclusive", reason: (e as Error)?.name === "TimeoutError" ? "timeout" : "network_error" };
  }
}
