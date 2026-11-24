// Allowlist de log seguro para respostas da UazAPI (GET /instance/status e
// afins) e para erros. Existe porque `GET /instance/status` ecoa o `token`
// da instância em texto puro no corpo da resposta (confirmado em produção)
// — qualquer `console.log(JSON.stringify(rawResponse))` desse endpoint
// vaza o secret.
//
// Desenho deliberado: NUNCA parte do objeto bruto e tenta remover chaves
// (recursivamente ou não) como defesa — isso é frágil a qualquer campo
// novo que a UazAPI passe a devolver amanhã. Em vez disso, cada função
// aqui CONSTRÓI um objeto novo, só com os campos explicitamente
// permitidos, lidos por caminho fixo (`raw.instance.status`,
// `raw.status.connected`, etc.) — um campo que não está na allowlist
// simplesmente nunca existe no resultado, não importa o que a API mande.

export interface SafeInstanceLabel {
  instanceId?: string;
  instanceName?: string;
  organizationId?: string | null;
  provider?: string | null;
}

export interface SafeStatusSummary {
  instance_id?: string;
  instance_name?: string;
  organization_id?: string | null;
  provider?: string | null;
  operation?: string;
  http_status?: number;
  status?: unknown;
  connected?: unknown;
  loggedIn?: unknown;
  resetting?: unknown;
  current_presence?: unknown;
  owner_masked?: string | null;
}

/** Mantém só os últimos 4 dígitos de um telefone; nunca o valor completo. */
export function maskPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

/**
 * Constrói um resumo seguro de uma resposta de `GET /instance/status`
 * (ou formato equivalente) para log — nunca inclui token, headers, ou
 * qualquer campo fora da allowlist abaixo.
 */
export function buildSafeStatusSummary(
  raw: unknown,
  label: SafeInstanceLabel & { operation?: string; httpStatus?: number } = {},
): SafeStatusSummary {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const inst = obj.instance && typeof obj.instance === "object" ? (obj.instance as Record<string, unknown>) : {};
  const st = obj.status && typeof obj.status === "object" ? (obj.status as Record<string, unknown>) : {};

  return {
    instance_id: label.instanceId,
    instance_name: label.instanceName,
    organization_id: label.organizationId ?? null,
    provider: label.provider ?? null,
    operation: label.operation,
    http_status: label.httpStatus,
    status: inst.status,
    connected: st.connected,
    loggedIn: st.loggedIn,
    resetting: st.resetting,
    current_presence: inst.current_presence,
    owner_masked: maskPhone(inst.owner),
  };
}

export interface SafeProfileSyncSummary {
  instance_id?: string;
  instance_name?: string;
  has_push_name: boolean;
  has_avatar: boolean;
  phone_masked: string | null;
}

/**
 * Resumo seguro do passo de sincronização de perfil (push name, avatar,
 * telefone) — nunca registra os valores brutos, só presença/ausência e
 * telefone mascarado.
 */
export function buildSafeProfileSyncSummary(
  raw: unknown,
  label: SafeInstanceLabel = {},
): SafeProfileSyncSummary {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const inst = obj.instance && typeof obj.instance === "object" ? (obj.instance as Record<string, unknown>) : {};
  const st = obj.status && typeof obj.status === "object" ? (obj.status as Record<string, unknown>) : {};

  const pushName = obj.pushName ?? obj.profileName ?? inst.profileName ?? inst.pushName ?? obj.verifiedName ?? inst.verifiedName;
  const avatar = obj.profilePicUrl ?? obj.profilePictureUrl ?? obj.avatar ?? inst.profilePicUrl ?? inst.avatar;
  const phone = obj.number ?? inst.number ?? inst.owner ??
    (typeof st.jid === "string" ? st.jid.split("@")[0].split(":")[0] : undefined);

  return {
    instance_id: label.instanceId,
    instance_name: label.instanceName,
    has_push_name: !!(pushName && pushName !== "---"),
    has_avatar: !!avatar,
    phone_masked: maskPhone(phone),
  };
}

/**
 * Sanitiza uma mensagem de erro solta (nunca estruturada por natureza):
 * redige qualquer segredo reconhecível em query string de URL e qualquer
 * sequência alfanumérica longa (30+ caracteres — tokens típicos têm 32-50)
 * que possa ser um token/apikey embutido na mensagem.
 */
export function sanitizeErrorMessage(message: unknown): string {
  let s = message === null || message === undefined ? "" : String(message);
  s = s.replace(/([?&](?:token|apikey|api_key|access_token|admintoken|adminToken)=)[^&\s]+/gi, "$1<redacted>");
  s = s.replace(/[A-Za-z0-9_-]{30,}/g, "<redacted>");
  return s;
}

export interface SafeErrorSummary {
  error_name?: string;
  error_message: string;
}

/** Resumo seguro de um erro qualquer (Error nativo ou valor solto). */
export function buildSafeErrorSummary(err: unknown): SafeErrorSummary {
  if (err instanceof Error) {
    return { error_name: err.name, error_message: sanitizeErrorMessage(err.message) };
  }
  return { error_message: sanitizeErrorMessage(err) };
}
