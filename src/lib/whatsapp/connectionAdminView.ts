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
export type DisplayStatus =
  | "Online"
  | "Conectando"
  | "Offline"
  | "Offline — sem resposta atual"
  | "Desconhecido";

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
  /**
   * true SOMENTE quando o heartbeat persistido da UazAPI é literalmente
   * "UNKNOWN" (ping não confirmou conexão nem desconexão). Contada como
   * "offline" no agregado operacional (`technicalStatus`/`countAdminConnections`)
   * porque a conexão não está confirmadamente ativa, mas o badge/detalhe
   * individual NUNCA deve afirmar que o ping confirmou desconexão — só que
   * não há confirmação atual. Vem sempre de `last_real_whatsapp_state`
   * persistido, nunca de nome/ID/posição de linha.
   */
  isUnconfirmedOffline: boolean;
}

const CONNECTING_UAZ_STATUSES = new Set(["qr_pending"]);
const CONNECTING_WA_STATES = new Set(["PAIRING", "OPENING"]);
/** Heartbeat persistido que NÃO confirma nem conexão nem desconexão. */
const UNCONFIRMED_WA_STATES = new Set(["UNKNOWN"]);

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
      isUnconfirmedOffline: false,
    };
  }

  const waState = raw.last_real_whatsapp_state ?? null;
  let technicalStatus: TechnicalStatus;
  let displayStatus: DisplayStatus;
  let statusReason: string;
  let isUnconfirmedOffline = false;

  if (waState === "CONNECTED") {
    technicalStatus = "online";
    displayStatus = "Online";
    statusReason = "Heartbeat UazAPI reporta sessão WhatsApp conectada.";
  } else if ((waState && CONNECTING_WA_STATES.has(waState)) || (raw.status && CONNECTING_UAZ_STATUSES.has(raw.status))) {
    technicalStatus = "connecting";
    displayStatus = "Conectando";
    statusReason = "UazAPI em processo de conexão/pareamento.";
  } else if (waState && UNCONFIRMED_WA_STATES.has(waState)) {
    // Heartbeat persistido é "UNKNOWN": o ping não confirmou conexão nem
    // desconexão. Tratada como não-ativa no agregado (nunca "Online"), mas
    // o texto não pode afirmar que houve confirmação de desconexão — só
    // que não há confirmação atual, o que é tecnicamente diferente de um
    // "DISCONNECTED" confirmado.
    technicalStatus = "offline";
    displayStatus = "Offline — sem resposta atual";
    statusReason = 'Heartbeat UazAPI não confirmou conexão nem desconexão (estado "UNKNOWN"). Não é um reparo pendente conhecido — apenas sem confirmação recente.';
    isUnconfirmedOffline = true;
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
    isUnconfirmedOffline,
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

// ============================================================================
// FASE 20C — modelo de TRÊS canais independentes (UazAPI, Sessão Web/Chromium,
// API Oficial/HookCloud-Meta).
//
// Causa raiz corrigida aqui: as Fases 20A/20B já impediram Chromium de
// determinar o status geral de uma conexão UazAPI (`classifyAdminConnection`
// acima), mas o módulo inteiro ainda não tinha NENHUM conceito de "API
// Oficial" — o dado real existe (`evolution_instances_meta_cloud`, FK
// `evolution_instance_id -> evolution_instances.id` com FK composta incluindo
// `organization_id`, já embutido como `meta_cloud_config` pela Fase 18C em
// `useWhatsAppInstances.ts`), mas `ConnectionsManager.tsx` descartava a linha
// inteira antes do merge (`classifyConnectionForDisplay(...) !== 'uazapi'`)
// sempre que o provider não era UazAPI, e nunca lia `meta_cloud_config` para
// as linhas UazAPI que o mantêm (coexistência: uma linha UazAPI pode ter uma
// API Oficial em onboarding associada à MESMA linha via
// `evolution_instances_meta_cloud.evolution_instance_id = evolution_instances.id`
// — ver coluna `coexistence_enabled` na migration
// `20260810120000_meta_cloud_api_foundation.sql`).
//
// NOTA DE RISCO RESIDUAL (documentada, não corrigida nesta fase): em teste
// direto contra o banco linkado, o role `authenticated` NÃO tem grant SELECT
// em `evolution_instances_meta_cloud` (só `service_role` tem) — um `SELECT`
// ou embed PostgREST feito pelo cliente autenticado falha com
// `42501 permission denied`. Isso é pré-existente (Fase 18C, já em
// `origin/main`, fora do diff deste PR) e como hoje existem 0 linhas reais
// nessa tabela o resultado observável não muda (sempre "Não configurada"),
// mas é um bug latente que pode quebrar a query inteira de
// `useWhatsAppInstances()` no dia em que uma linha satélite real existir.
// Corrigir exigiria uma migration (`GRANT SELECT ... TO authenticated`, com
// exposição cuidadosa das colunas — a tabela também guarda
// `access_token_secret_ref`/hashes de webhook), fora do escopo autorizado
// desta fase. Reportado, não corrigido.
//
// A Sessão Web (Chromium) continua sem nenhuma FK real (API REST externa na
// VPS `api.x1zap.cloud`, sem tabela Postgres, sem `organization_id`) — a
// associação com a linha UazAPI é herdada da heurística pré-existente de
// `ConnectionsManager.tsx` (campo inexistente -> telefone normalizado -> nome
// normalizado), que este módulo NÃO redesenha (fora do escopo autorizado:
// exigiria uma coluna nova, ex. `evolution_instances.chromium_instance_id`).
// Este módulo só classifica o resultado já resolvido pelo merge existente.

export type WebSessionStatus =
  | "Online"
  | "Offline"
  | "Aguardando QR"
  | "Não configurada"
  | "Sem resposta atual"
  | "Erro";

const WEB_SESSION_QR_RAW_STATES = new Set(["qr_pending", "qr", "pairing"]);

/**
 * Classifica o canal Sessão Web (Chromium) com o vocabulário completo pedido
 * pela Fase 20C. Reaproveita `classifyChromiumAuxStatus` (já testado) como
 * base e só adiciona a distinção Aguardando QR / Não configurada / Sem
 * resposta atual / Erro em cima dela — nunca reimplementa a regra de
 * "conectado".
 */
export function classifyWebSessionChannel(
  chrom: ChromiumAuxRaw | null | undefined,
): { status: WebSessionStatus; reason: string } {
  if (!chrom) {
    return {
      status: "Não configurada",
      reason: "Nenhuma sessão Web (Chromium) associada a esta conexão.",
    };
  }
  const aux = classifyChromiumAuxStatus(chrom);
  const raw = String(chrom.chromium_status ?? chrom.chromiumStatus ?? chrom.status ?? "").toLowerCase();

  if (raw === "error" || raw === "erro") {
    return { status: "Erro", reason: `Sessão Web reportou erro ("${raw}").` };
  }
  if (aux === "online") {
    return { status: "Online", reason: "Sessão Web (Chromium) conectada." };
  }
  if (aux === "connecting" || WEB_SESSION_QR_RAW_STATES.has(raw)) {
    return { status: "Aguardando QR", reason: "Sessão Web em pareamento (aguardando leitura de QR Code)." };
  }
  if (aux === "unknown") {
    return {
      status: "Sem resposta atual",
      reason: "Sessão Web sem status recente reportado pela VPS (api.x1zap.cloud).",
    };
  }
  return { status: "Offline", reason: "Sessão Web (Chromium) desconectada." };
}

export type OfficialApiStatus = "Não configurada" | "Pendente" | "Online" | "Offline" | "Erro" | "Dados indisponíveis";
/** `unknown` = `onboarding_source` presente mas com valor não reconhecido (ex.: `evohub`) — falha fechada, nunca vira `hookcloud`/`direct_meta` por adivinhação. */
export type OfficialApiSource = "hookcloud" | "direct_meta" | "unknown" | null;

export interface OfficialApiRaw {
  onboarding_state?: string | null;
  onboarding_source?: string | null;
  phone_number_id?: string | null;
}

/** Estados de onboarding que ainda não confirmam a API Oficial como operacional, mas também não são erro/desligada. */
const PENDING_ONBOARDING_STATES = new Set(["pending", "code_exchanged", "waba_linked", "webhook_subscribed"]);

export function classifyOfficialApiSource(source: string | null | undefined): OfficialApiSource {
  if (source === "hookcloud") return "hookcloud";
  if (source === "direct_meta") return "direct_meta";
  if (source) return "unknown";
  return null;
}

/**
 * Classifica o canal API Oficial (HookCloud/Meta Cloud) a partir do registro
 * satélite `evolution_instances_meta_cloud` (já resolvido/embutido pelo
 * chamador — este módulo nunca faz I/O). Sem registro -> "Não configurada"
 * (nunca "Não conectada" — não é uma queda, é ausência de configuração).
 * Falha fechada: `onboarding_state` desconhecido nunca vira "Online".
 */
export function classifyOfficialApi(
  metaCloud: OfficialApiRaw | null | undefined,
): { status: OfficialApiStatus; reason: string; source: OfficialApiSource } {
  const source = classifyOfficialApiSource(metaCloud?.onboarding_source);
  const state = metaCloud?.onboarding_state ?? null;

  if (!metaCloud || !state) {
    return {
      status: "Não configurada",
      reason: "Nenhuma conexão API Oficial (HookCloud/Meta Cloud) configurada para esta linha.",
      source,
    };
  }
  if (state === "active") {
    return { status: "Online", reason: "API Oficial ativa (onboarding_state=\"active\").", source };
  }
  if (state === "error") {
    return { status: "Erro", reason: "API Oficial em estado de erro (onboarding_state=\"error\").", source };
  }
  if (state === "offboarded") {
    return { status: "Offline", reason: "API Oficial desativada (onboarding_state=\"offboarded\").", source };
  }
  if (PENDING_ONBOARDING_STATES.has(state)) {
    return { status: "Pendente", reason: `API Oficial em processo de onboarding (estado "${state}").`, source };
  }
  return {
    status: "Offline",
    reason: `API Oficial em estado não reconhecido ("${state}") — falha fechada, nunca "Online".`,
    source,
  };
}

/**
 * FASE 20D — resultado de TENTAR buscar o DTO administrativo de API Oficial
 * (`instances-api?action=officialApi`), antes de saber se existe alguma
 * linha. Discriminado por `ok` para nunca deixar uma falha de rede/permissão
 * ser silenciosamente convertida num array vazio (que classifyOfficialApi
 * trataria como "Não configurada" — mascarando a falha).
 */
export type OfficialApiFetchResult =
  | { ok: true; rows: readonly OfficialApiRaw[] }
  | { ok: false };

/**
 * Núcleo do defeito de segurança corrigido nesta fase: uma falha ao
 * CONSULTAR a API Oficial (permission denied, rede, timeout, resposta
 * malformada) precisa aparecer como "Dados indisponíveis" — nunca como
 * "Não configurada" (que afirma, incorretamente, que não existe nenhuma
 * conexão configurada). Só quando a consulta teve SUCESSO e não encontrou
 * nenhuma linha é que "Não configurada" é uma afirmação verdadeira.
 */
export function classifyOfficialApiFromFetch(
  fetchResult: OfficialApiFetchResult | null | undefined,
  metaCloud: OfficialApiRaw | null | undefined,
): { status: OfficialApiStatus; reason: string; source: OfficialApiSource } {
  if (!fetchResult || fetchResult.ok !== true) {
    return {
      status: "Dados indisponíveis",
      reason: "Não foi possível consultar a API Oficial (erro de permissão, rede ou backend) — estado real desconhecido, não é o mesmo que \"Não configurada\".",
      source: null,
    };
  }
  return classifyOfficialApi(metaCloud);
}

export type OverallStatus =
  | "Online"
  | "Parcial"
  | "Offline"
  | "Somente UazAPI"
  | "Somente Sessão Web"
  | "Somente API Oficial"
  | "Sem canais configurados";

type ChannelBucket = "online" | "down" | "neutral";

function uazapiBucket(status: DisplayStatus | "Não configurada"): ChannelBucket {
  if (status === "Não configurada") return "neutral";
  if (status === "Online") return "online";
  return "down"; // Conectando, Offline, Offline — sem resposta atual, Desconhecido
}

function webSessionBucket(status: WebSessionStatus): ChannelBucket {
  if (status === "Não configurada") return "neutral";
  if (status === "Online") return "online";
  return "down"; // Offline, Aguardando QR, Sem resposta atual, Erro
}

function officialApiBucket(status: OfficialApiStatus): ChannelBucket {
  // "Pendente" nunca reduz o Status Geral (não é uma falha, é onboarding em
  // andamento) — tratada como neutra para fins de agregação, igual a "Não
  // configurada"; a nota "API Oficial pendente" é adicionada separadamente.
  //
  // FASE 20D — "Dados indisponíveis" (falha ao CONSULTAR o backend: erro de
  // rede, timeout, permissão) também é neutra aqui, pelo MESMO motivo que
  // levou à criação deste estado: uma falha de observabilidade nunca pode
  // rebaixar o Status Geral de uma conexão que continua operacional nos
  // outros canais (UazAPI/Sessão Web). Se tratada como "down", uma simples
  // falha temporária de rede ao buscar a API Oficial degradaria
  // silenciosamente uma conexão saudável para "Parcial"/"Offline" — o MESMO
  // tipo de falso negativo que a Fase 20B corrigiu para o heartbeat UNKNOWN.
  if (status === "Não configurada" || status === "Pendente" || status === "Dados indisponíveis") return "neutral";
  if (status === "Online") return "online";
  return "down"; // Offline, Erro
}

/**
 * Implementa exatamente a matriz da Fase 20C (Parte 7): um canal ausente/
 * "Não configurada" (ou "Pendente" para API Oficial) NUNCA reduz o Status
 * Geral. "Parcial" só existe quando um canal configurado está indisponível
 * E outro canal configurado continua operacional.
 */
export function computeOverallStatus(
  uazapiStatus: DisplayStatus | "Não configurada",
  webSessionStatus: WebSessionStatus,
  officialApiStatus: OfficialApiStatus,
): { status: OverallStatus; reason: string } {
  const buckets: Array<{ channel: "UazAPI" | "Sessão Web" | "API Oficial"; bucket: ChannelBucket }> = [
    { channel: "UazAPI", bucket: uazapiBucket(uazapiStatus) },
    { channel: "Sessão Web", bucket: webSessionBucket(webSessionStatus) },
    { channel: "API Oficial", bucket: officialApiBucket(officialApiStatus) },
  ];
  const configured = buckets.filter((b) => b.bucket !== "neutral");
  const online = configured.filter((b) => b.bucket === "online");
  const pendingNote = officialApiStatus === "Pendente" ? " (API Oficial pendente)" : "";

  if (configured.length === 0) {
    return { status: "Sem canais configurados", reason: "Nenhum canal (UazAPI, Sessão Web, API Oficial) configurado para esta conexão." };
  }
  if (configured.length === 1) {
    const only = configured[0];
    if (only.bucket === "online") {
      const label = only.channel === "UazAPI" ? "Somente UazAPI" : only.channel === "Sessão Web" ? "Somente Sessão Web" : "Somente API Oficial";
      return { status: label as OverallStatus, reason: `Único canal configurado (${only.channel}) está online.${pendingNote}` };
    }
    return { status: "Offline", reason: `Único canal configurado (${only.channel}) está indisponível.${pendingNote}` };
  }
  if (online.length === configured.length) {
    return { status: "Online", reason: `Todos os ${configured.length} canais configurados estão online.${pendingNote}` };
  }
  if (online.length === 0) {
    return { status: "Offline", reason: `Nenhum dos ${configured.length} canais configurados está online.${pendingNote}` };
  }
  return {
    status: "Parcial",
    reason: `${online.length} de ${configured.length} canais configurados estão online — pelo menos um canal configurado está indisponível.${pendingNote}`,
  };
}

export interface ThreeChannelCapabilities {
  supportsQr: boolean;
  supportsReconnect: boolean;
  supportsDelete: boolean;
}

export interface ThreeChannelConnectionViewModel {
  rowId: string;
  organizationId: string | null;
  offerId: string | null;
  offerLabel: string;
  whatsappIdentity: string | null;

  uazapiConnectionId: string | null;
  uazapiStatus: DisplayStatus | "Não configurada";
  uazapiStatusReason: string;
  uazapiLastActivityAt: string | null;
  uazapiIsUnconfirmedOffline: boolean;

  webSessionId: string | null;
  webSessionStatus: WebSessionStatus;
  webSessionStatusReason: string;
  webSessionLastActivityAt: string | null;

  officialApiConnectionId: string | null;
  officialApiSource: OfficialApiSource;
  officialApiStatus: OfficialApiStatus;
  officialApiStatusReason: string;
  officialApiLastActivityAt: string | null;

  overallStatus: OverallStatus;
  overallStatusReason: string;

  activeFunnel: string | null;

  uazapi: ThreeChannelCapabilities;
  webSession: ThreeChannelCapabilities;
  officialApi: ThreeChannelCapabilities;
}

export interface ThreeChannelRawInput {
  rowId: string;
  organizationId?: string | null;
  offerId?: string | null;
  offerLabel?: string | null;
  whatsappIdentity?: string | null;
  uazapi: AdminConnectionRaw | null | undefined;
  webSession: ChromiumAuxRaw | null | undefined;
  webSessionId?: string | null;
  officialApi: OfficialApiRaw | null | undefined;
  officialApiConnectionId?: string | null;
  /**
   * FASE 20D — `true` quando a busca do DTO administrativo de API Oficial
   * (`instances-api?action=officialApi`) falhou para ESTA requisição
   * (permissão/rede/backend) — nunca setado por ausência de linha, que é um
   * resultado de sucesso (`officialApi: null` com fetch OK). Quando `true`,
   * `officialApi` é ignorado e o canal vira "Dados indisponíveis" — nunca
   * "Não configurada". Omitido/`false` preserva o comportamento anterior
   * (fetch OK).
   */
  officialApiUnavailable?: boolean;
  activeFunnel?: string | null;
}

/**
 * Compositor único dos três canais independentes. Nunca deixa a ausência de
 * um canal opcional (Sessão Web/API Oficial) contaminar o status dos demais
 * — cada `classify*` é chamado isoladamente, e só `computeOverallStatus`
 * combina os três resultados já prontos.
 */
export function classifyThreeChannelConnection(input: ThreeChannelRawInput): ThreeChannelConnectionViewModel {
  const isStandaloneOfficialRow = !input.uazapi && input.officialApi != null;

  let uazapiStatus: DisplayStatus | "Não configurada";
  let uazapiStatusReason: string;
  let uazapiIsUnconfirmedOffline = false;
  let uazapiConnectionId: string | null = null;
  let uazapiLastActivityAt: string | null = null;
  let uazapiCaps: ThreeChannelCapabilities = { supportsQr: false, supportsReconnect: false, supportsDelete: false };

  if (!input.uazapi) {
    uazapiStatus = "Não configurada";
    uazapiStatusReason = "Nenhuma instância UazAPI associada a esta linha.";
  } else if (input.uazapi.provider === "meta_cloud") {
    // Linha primária é uma conexão API Oficial standalone (sem UazAPI) —
    // provider explicitamente diferente, nunca tratado como "Desconhecido"/
    // falha (que é reservado a providers realmente desconhecidos).
    uazapiStatus = "Não configurada";
    uazapiStatusReason = "Esta conexão usa provider \"meta_cloud\" — não há canal UazAPI para esta linha.";
  } else {
    const vm = classifyAdminConnection(input.uazapi, input.webSession);
    uazapiStatus = vm.displayStatus;
    uazapiStatusReason = vm.statusReason;
    uazapiIsUnconfirmedOffline = vm.isUnconfirmedOffline;
    uazapiConnectionId = vm.connectionId || null;
    uazapiLastActivityAt = null;
    uazapiCaps = { supportsQr: vm.supportsQr, supportsReconnect: vm.supportsReconnect, supportsDelete: vm.supportsDelete };
  }

  const webSessionRaw = input.webSession ?? null;
  const webSessionClassified = classifyWebSessionChannel(webSessionRaw);
  const webSessionId = input.webSessionId ?? null;
  const webSessionCaps: ThreeChannelCapabilities = {
    supportsQr: webSessionClassified.status !== "Não configurada",
    supportsReconnect: webSessionClassified.status !== "Não configurada",
    supportsDelete: webSessionClassified.status !== "Não configurada",
  };

  const officialApiClassified = input.officialApiUnavailable
    ? classifyOfficialApiFromFetch({ ok: false }, null)
    : classifyOfficialApi(input.officialApi ?? null);
  const officialApiConnectionId = input.officialApiConnectionId ?? null;
  // FASE 20D — "Dados indisponíveis" nunca habilita ações: o estado real é
  // desconhecido (pode ou não existir uma conexão configurada), então
  // oferecer "Reconectar"/"Excluir" seria uma ação às cegas. Só estados
  // conhecidos e configurados (Pendente/Online/Offline/Erro) habilitam.
  const officialApiKnownAndConfigured =
    officialApiClassified.status !== "Não configurada" && officialApiClassified.status !== "Dados indisponíveis";
  const officialApiCaps: ThreeChannelCapabilities = {
    supportsQr: false, // API Oficial nunca usa QR Code
    supportsReconnect: officialApiKnownAndConfigured,
    supportsDelete: officialApiKnownAndConfigured,
  };

  const overall = computeOverallStatus(uazapiStatus, webSessionClassified.status, officialApiClassified.status);

  void isStandaloneOfficialRow; // reservado para telemetria futura; sem efeito na classificação hoje.

  return {
    rowId: input.rowId,
    organizationId: input.organizationId ?? null,
    offerId: input.offerId ?? null,
    offerLabel: input.offerLabel && input.offerLabel.trim() ? input.offerLabel : "Sem oferta",
    whatsappIdentity: input.whatsappIdentity ?? null,

    uazapiConnectionId,
    uazapiStatus,
    uazapiStatusReason,
    uazapiLastActivityAt,
    uazapiIsUnconfirmedOffline,

    webSessionId,
    webSessionStatus: webSessionClassified.status,
    webSessionStatusReason: webSessionClassified.reason,
    webSessionLastActivityAt: null,

    officialApiConnectionId,
    officialApiSource: officialApiClassified.source,
    officialApiStatus: officialApiClassified.status,
    officialApiStatusReason: officialApiClassified.reason,
    officialApiLastActivityAt: null,

    overallStatus: overall.status,
    overallStatusReason: overall.reason,

    activeFunnel: input.activeFunnel ?? null,

    uazapi: uazapiCaps,
    webSession: webSessionCaps,
    officialApi: officialApiCaps,
  };
}

export interface ThreeChannelCounts {
  total: number;
  operational: number;
  offline: number;
  uazapiOnline: number;
  webSessionOnline: number;
  officialApiOnline: number;
}

/**
 * Contadores canônicos do topo — SEMPRE derivados do mesmo array de view
 * models (nunca uma contagem separada, nunca filtrado pelos filtros da UI:
 * o chamador deve passar o array COMPLETO, não o array já filtrado para
 * exibição — caso contrário os contadores mudam quando o usuário filtra a
 * tabela, o que seria enganoso).
 */
export function countThreeChannelConnections(rows: readonly ThreeChannelConnectionViewModel[]): ThreeChannelCounts {
  let operational = 0;
  let offline = 0;
  let uazapiOnline = 0;
  let webSessionOnline = 0;
  let officialApiOnline = 0;
  for (const row of rows) {
    const hasOnlineChannel =
      row.uazapiStatus === "Online" || row.webSessionStatus === "Online" || row.officialApiStatus === "Online";
    if (hasOnlineChannel) operational++;
    else offline++;
    if (row.uazapiStatus === "Online") uazapiOnline++;
    if (row.webSessionStatus === "Online") webSessionOnline++;
    if (row.officialApiStatus === "Online") officialApiOnline++;
  }
  return { total: rows.length, operational, offline, uazapiOnline, webSessionOnline, officialApiOnline };
}
