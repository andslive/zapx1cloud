// Catálogo único de gateways/métodos implementados. Interface e backend usam estas mesmas
// regras de disponibilidade (a Edge Function expõe o catálogo; o frontend só o renderiza).

export type GatewayProvider = "colocapay" | "leonapay";
export type GatewayEnvironment = "sandbox" | "production";

export interface GatewayMethod {
  method: string; // "SPEI" | "OXXO"
  currency: string; // "MXN"
  country: string; // ISO3 quando aplicável
  requiresAmount: boolean;
  supportsAmountless: boolean;
}

export interface GatewayDefinition {
  provider: GatewayProvider;
  label: string;
  methods: GatewayMethod[];
  baseUrls: Record<GatewayEnvironment, string>;
  /** Credencial a informar, com a dica de onde obter. */
  credentialHelp: { apiKey: string; webhookSecret: string };
}

export const GATEWAYS: Record<GatewayProvider, GatewayDefinition> = {
  colocapay: {
    provider: "colocapay",
    label: "ColocaPay",
    methods: [{ method: "SPEI", currency: "MXN", country: "MEX", requiresAmount: true, supportsAmountless: false }],
    baseUrls: {
      sandbox: "https://api.qa.colocapayments.com/api/v1",
      production: "https://api.us.colocapayments.com/api/v1",
    },
    credentialHelp: {
      apiKey:
        "Painel ColocaPay (QA: app.qa.colocapayments.com; produção: app.us.colocapayments.com) → API keys. A chave começa com sk_. Cada ambiente tem a sua.",
      webhookSecret:
        "Valor do x-secret definido ao cadastrar o webhook de organização no painel da ColocaPay.",
    },
  },
  leonapay: {
    provider: "leonapay",
    label: "LeonaPay",
    methods: [{ method: "OXXO", currency: "MXN", country: "MEX", requiresAmount: true, supportsAmountless: false }],
    baseUrls: {
      sandbox: "https://sandbox.api.leonapay.com.br",
      production: "https://api.leonapay.com.br",
    },
    credentialHelp: {
      apiKey:
        "Dashboard LeonaPay → Integrações → chave de API. Sandbox e Produção têm chaves distintas; uma chave sandbox não opera em produção.",
      webhookSecret:
        "Segredo whsec_… exibido uma única vez ao criar o webhook (painel ou POST /api/v2/webhooks). Cadastre-o aqui logo após criar.",
    },
  },
};

export function isProvider(v: unknown): v is GatewayProvider {
  return v === "colocapay" || v === "leonapay";
}
export function isEnvironment(v: unknown): v is GatewayEnvironment {
  return v === "sandbox" || v === "production";
}

/** Meios habilitados para provider+moeda. Mesma regra na interface e no backend. */
export function methodsFor(provider: GatewayProvider, currency?: string): GatewayMethod[] {
  return GATEWAYS[provider].methods.filter((m) => !currency || m.currency === currency);
}

export function webhookPath(provider: GatewayProvider, token: string): string {
  return `/functions/v1/payments-webhook/${provider}/${token}`;
}

/**
 * Base da API. Só o SANDBOX aceita sobrescrita por variável de ambiente do operador
 * (PAYMENT_SANDBOX_BASE_URL_COLOCAPAY / _LEONAPAY), usada por testes E2E com gateway simulado.
 * Contas de produção nunca são desviadas.
 */
export function gatewayBaseUrl(provider: GatewayProvider, env: GatewayEnvironment): string {
  if (env === "sandbox") {
    try {
      const o = Deno.env.get(`PAYMENT_SANDBOX_BASE_URL_${provider.toUpperCase()}`);
      if (o && /^https?:\/\//.test(o)) return o.replace(/\/$/, "");
    } catch { /* sem permissão de env: usa o padrão */ }
  }
  return GATEWAYS[provider].baseUrls[env];
}
