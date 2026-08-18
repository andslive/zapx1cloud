// Minimal direct OpenAI adapter — Fase 1 da remoção do Lovable AI Gateway.
// Não faz roteamento por organização nem fallback; isso continua em ai-router.ts/ai-credentials.ts.
// Cada caller passa a apiKey e o model explicitamente.

const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const OPENAI_TRANSCRIPTIONS_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

export interface OpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: Array<Record<string, any>>;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<Record<string, any>>;
  tool_choice?: Record<string, any> | string;
  response_format?: Record<string, any>;
  stream?: boolean;
}

/** Calls OpenAI chat completions directly. Returns the raw Response (caller decides how to read it). */
export async function openAIChat(opts: OpenAIChatOptions): Promise<Response> {
  const { apiKey, ...body } = opts;
  return await fetch(OPENAI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export interface OpenAIEmbedOptions {
  apiKey: string;
  model: string;
  input: string | string[];
}

/** Calls OpenAI embeddings directly. Returns the raw Response. */
export async function openAIEmbed(opts: OpenAIEmbedOptions): Promise<Response> {
  const { apiKey, ...body } = opts;
  return await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export interface OpenAITranscribeOptions {
  apiKey: string;
  model: string;
  audioBytes: Uint8Array;
  mime: string;
  ext: string;
  language?: string;
  response_format?: string;
}

/** Calls OpenAI audio transcriptions directly. Returns the raw Response. */
export async function openAITranscribe(opts: OpenAITranscribeOptions): Promise<Response> {
  const { apiKey, model, audioBytes, mime, ext, language, response_format } = opts;
  const fileBuffer = new ArrayBuffer(audioBytes.byteLength);
  new Uint8Array(fileBuffer).set(audioBytes);
  const blob = new Blob([fileBuffer], { type: mime });

  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  fd.append("model", model);
  if (language) fd.append("language", language);
  fd.append("response_format", response_format || "text");

  return await fetch(OPENAI_TRANSCRIPTIONS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
}

/** Friendly error message helper for non-ok OpenAI responses (mirrors ai-call.ts's describeAIError for OpenAI). */
export async function describeOpenAIError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (response.status === 429) return "Limite de requisições excedido. Tente novamente em alguns segundos.";
  if (response.status === 402) return "Sua conta OpenAI está sem créditos ou bloqueada. Verifique em platform.openai.com/billing.";
  if (response.status === 401 || response.status === 403) return "Chave da OpenAI inválida ou sem permissão.";
  return `Erro da OpenAI (${response.status}): ${text.slice(0, 200) || response.statusText}`;
}
