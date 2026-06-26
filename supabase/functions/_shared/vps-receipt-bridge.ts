// Fase G.1 — Ponte de leitura do resultado oficial da VPS2 para o bloco
// "Reconhecer Comprovante" (ai_receipt) do uazapi-webhook.
//
// Escopo cirúrgico: só é usada quando a flag + allowlist de instância +
// allowlist de funil baterem. Em qualquer outro cenário a Lovable processa
// localmente como sempre (caminho legado). Erros aqui NUNCA propagam:
// chamador faz try/catch e cai no legado (fail-open).
//
// Variáveis de ambiente (Edge Function secrets):
//   ENABLE_VPS_RECEIPT_RESULT          ("true" para ligar; default OFF)
//   VPS_RECEIPT_ALLOWED_INSTANCES      CSV ex.: "canal46"
//   VPS_RECEIPT_ALLOWED_FUNNELS        CSV ex.: "Funil Gordura (10reais) (novo2)"
//   VPS_RECEIPT_POLL_TIMEOUT_MS        default 2000
//   VPS_RECEIPT_POLL_INTERVAL_MS       default 250

export interface VpsReceiptResultRow {
  message_id: string;
  instance: string | null;
  pix_id: string | null;
  is_receipt: boolean | null;
  amount: number | null;
  customer_name: string | null;
  confidence: number | null;
  ocr_text: string | null;
  ai_reason: string | null;
  phone: string | null;
}

const csv = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const isVpsReceiptEnabled = (
  instanceName: string | null | undefined,
  funnelName: string | null | undefined,
): { enabled: boolean; reason: string } => {
  if (Deno.env.get("ENABLE_VPS_RECEIPT_RESULT") !== "true") {
    return { enabled: false, reason: "disabled" };
  }
  const inst = String(instanceName ?? "").trim().toLowerCase();
  const fname = String(funnelName ?? "").trim();

  const allowedInstances = csv(Deno.env.get("VPS_RECEIPT_ALLOWED_INSTANCES")).map(
    (s) => s.toLowerCase(),
  );
  const allowedFunnels = csv(Deno.env.get("VPS_RECEIPT_ALLOWED_FUNNELS"));

  if (!inst || !allowedInstances.includes(inst)) {
    return { enabled: false, reason: "instance_not_allowed" };
  }
  if (!fname || !allowedFunnels.includes(fname)) {
    return { enabled: false, reason: "funnel_not_allowed" };
  }
  return { enabled: true, reason: "ok" };
};

// deno-lint-ignore no-explicit-any
type Supa = any;

export const pollVpsReceiptResult = async (
  supabase: Supa,
  args: {
    messageId: string;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<VpsReceiptResultRow | null> => {
  const timeoutMs = Number(
    args.timeoutMs ?? Deno.env.get("VPS_RECEIPT_POLL_TIMEOUT_MS") ?? 2000,
  );
  const intervalMs = Number(
    args.intervalMs ?? Deno.env.get("VPS_RECEIPT_POLL_INTERVAL_MS") ?? 250,
  );
  const deadline = Date.now() + Math.max(0, timeoutMs);

  while (true) {
    try {
      const { data, error } = await supabase
        .from("vps_receipt_results")
        .select(
          "message_id,instance,pix_id,is_receipt,amount,customer_name,confidence,ocr_text,ai_reason,phone",
        )
        .eq("message_id", args.messageId)
        .maybeSingle();
      if (!error && data) return data as VpsReceiptResultRow;
    } catch (_) {
      // ignore — retry until deadline
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, Math.max(50, intervalMs)));
  }
};
