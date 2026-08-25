// FASE 20A — classificador canônico da tela Admin → Conexões
// (`ConnectionsManager.tsx`).
//
// Causa raiz corrigida aqui: `ConnectionsManager.tsx` calculava o "Status
// Geral" de cada linha com um XOR entre o estado da UazAPI e o estado da
// Sessão Web (Chromium) — `getGeneralStatus()` antes desta fase:
//   isUazOnline && isWebOnline -> Online
//   isUazOnline || isWebOnline -> "Parcial"   (BUG: uma UazAPI saudável
//                                              sem Chromium virava "Parcial")
//   caso contrário -> Offline
// Chromium é um canal auxiliar (sessão de navegador na VPS
// `api.x1zap.cloud`, sem nenhum papel na entrega real de mensagens desta
// tela) e nunca pode determinar o status geral de uma conexão UazAPI. Este
// módulo separa as duas coisas: `technicalStatus`/`displayStatus` vêm
// SOMENTE do heartbeat real da UazAPI; `chromiumAuxStatus` é informativo,
// exposto à parte.
//
// Reaproveita `isUazapiProvider` (já usado no backend via
// `provider-guard.ts` e no frontend via `connectionProviderView.ts`) como
// única fonte de verdade sobre o transporte — nunca reimplementa essa
// regra. `provider` nulo/ausente/vazio é tratado como UazAPI por
// retrocompatibilidade (mesma regra do backend); qualquer outro valor
// falha fechado (`transportProvider: 'unknown'`, sem nenhuma ação
// oferecida).

import { isUazapiProvider, type ConnectionProviderFields } from "./connectionProviderView.ts";

export type TechnicalStatus = "online" | "connecting" | "offline" | "unknown";
export type DisplayStatus = "Online" | "Conectando" | "Offline" | "Desconhecido";

export interface AdminConnectionRaw extends ConnectionProviderFields {
  id?: string | null;
  last_real_whatsapp_state?: string | null;
  status?: string | null;
}

export interface ChromiumAuxRaw {
  connected?: boolean | null;
  chromium_status?: string | null;
  chromiumStatus?: string | null;
  status?: string | null;
}

export interface AdminConnectionViewModel {
  connectionId: string;
  transportProvider: "uazapi" | "unknown";
  providerLabel: string;
  isUazapi: boolean;
  technicalStatus: TechnicalStatus;
  displayStatus: DisplayStatus;
  statusReason: string;
  supportsQr: boolean;
  supportsReconnect: boolean;
  supportsDelete: boolean;
  chromiumAuxStatus: TechnicalStatus;
}

const CONNECTING_UAZ_STATUSES = new Set(["qr_pending"]);
const CONNECTING_WA_STATES = new Set(["PAIRING", "OPENING"]);

/** Estado do canal Chromium/VPS auxiliar — nunca usado para decidir o status geral de uma conexão UazAPI. */
export function classifyChromiumAuxStatus(chrom: ChromiumAuxRaw | null | undefined): TechnicalStatus {
  if (!chrom) return "unknown";
  if (chrom.connected === true) return "online";
  const raw = chrom.chromium_status ?? chrom.chromiumStatus ?? chrom.status ?? "";
  const s = String(raw).toLowerCase();
  if (s === "online" || s === "authenticated" || s === "ready") return "online";
  if (s === "qr_pending" || s === "qr" || s === "pairing") return "connecting";
  if (!s) return "unknown";
  return "offline";
}

/**
 * Classifica uma linha de `evolution_instances` (mais o objeto Chromium
 * auxiliar já resolvido pelo merge, se houver) para exibição na tela Admin
 * → Conexões. Falha fechada: provider desconhecido/ausente-mas-diferente
 * de uazapi nunca vira "Online" nem oferece ações UazAPI.
 */
export function classifyAdminConnection(
  raw: AdminConnectionRaw | null | undefined,
  chromium: ChromiumAuxRaw | null | undefined,
): AdminConnectionViewModel {
  const chromiumAuxStatus = classifyChromiumAuxStatus(chromium);
  const connectionId = raw?.id ?? "";

  if (!raw || !isUazapiProvider(raw)) {
    return {
      connectionId,
      transportProvider: "unknown",
      providerLabel: "Provider não suportado",
      isUazapi: false,
      technicalStatus: "unknown",
      displayStatus: "Desconhecido",
      statusReason: raw
        ? "Provider não é UazAPI — esta tela não gerencia este provider (falha fechada)."
        : "Sem instância UazAPI correspondente.",
      supportsQr: false,
      supportsReconnect: false,
      supportsDelete: false,
      chromiumAuxStatus,
    };
  }

  const waState = raw.last_real_whatsapp_state ?? null;
  let technicalStatus: TechnicalStatus;
  let displayStatus: DisplayStatus;
  let statusReason: string;

  if (waState === "CONNECTED") {
    technicalStatus = "online";
    displayStatus = "Online";
    statusReason = "Heartbeat UazAPI reporta sessão WhatsApp conectada.";
  } else if ((waState && CONNECTING_WA_STATES.has(waState)) || (raw.status && CONNECTING_UAZ_STATUSES.has(raw.status))) {
    technicalStatus = "connecting";
    displayStatus = "Conectando";
    statusReason = "UazAPI em processo de conexão/pareamento.";
  } else if (waState) {
    technicalStatus = "offline";
    displayStatus = "Offline";
    statusReason = `Heartbeat UazAPI reporta estado "${waState}".`;
  } else {
    technicalStatus = "offline";
    displayStatus = "Offline";
    statusReason = "Sem heartbeat recente da UazAPI para esta conexão.";
  }

  return {
    connectionId,
    transportProvider: "uazapi",
    providerLabel: "UazAPI",
    isUazapi: true,
    technicalStatus,
    displayStatus,
    statusReason,
    supportsQr: true,
    supportsReconnect: true,
    supportsDelete: true,
    chromiumAuxStatus,
  };
}

export interface AdminConnectionCounts {
  total: number;
  online: number;
  offline: number;
  connecting: number;
}

/** Contador canônico — SEMPRE derivado do mesmo array de view models usado para renderizar a tabela (nunca uma contagem separada que possa divergir). */
export function countAdminConnections(rows: readonly AdminConnectionViewModel[]): AdminConnectionCounts {
  let online = 0;
  let offline = 0;
  let connecting = 0;
  for (const row of rows) {
    if (row.technicalStatus === "online") online++;
    else if (row.technicalStatus === "connecting") connecting++;
    else offline++; // offline + unknown contam como não-ativas, nunca como online
  }
  return { total: rows.length, online, offline, connecting };
}
