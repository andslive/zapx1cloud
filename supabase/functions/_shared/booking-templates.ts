// Shared helpers for the Booking automation engine.
// Render message templates and build standard variable maps from a booking row.

export type BookingVars = Record<string, string>;

/**
 * Replace {{variable}} placeholders in the template with values from the map.
 * Unknown variables are left empty (not echoed) to avoid leaking placeholders.
 */
export function renderTemplate(template: string | null | undefined, vars: BookingVars): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Format a Date in the booking timezone (BR-friendly).
 */
function fmtDate(date: Date, timezone: string): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: timezone,
  });
}

function fmtTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: timezone,
  });
}

/**
 * Build the standard variable map used in confirmation/reminder/recovery messages.
 */
export function buildBookingVars(input: {
  guest_name: string;
  guest_email: string;
  guest_phone?: string | null;
  start_time: string;
  end_time: string;
  timezone?: string | null;
  event_name?: string | null;
  host_name?: string | null;
  meet_link?: string | null;
  confirmation_url?: string | null;
  reschedule_url?: string | null;
}): BookingVars {
  const tz = input.timezone || "America/Sao_Paulo";
  const start = new Date(input.start_time);
  const end = new Date(input.end_time);
  return {
    nome_lead: input.guest_name || "",
    email_lead: input.guest_email || "",
    telefone_lead: input.guest_phone || "",
    nome_evento: input.event_name || "",
    nome_anfitriao: input.host_name || "",
    data: fmtDate(start, tz),
    hora: fmtTime(start, tz),
    hora_fim: fmtTime(end, tz),
    link_reuniao: input.meet_link || "",
    link_confirmar: input.confirmation_url || "",
    link_reagendar: input.reschedule_url || "",
  };
}

/**
 * Default templates used when the org didn't customize anything.
 */
export const DEFAULT_TEMPLATES = {
  confirmation_whatsapp:
    "Olá {{nome_lead}}! 👋\n\nSua reunião *{{nome_evento}}* foi agendada com sucesso para *{{data}} às {{hora}}*.\n\nResponda:\n*1* — Confirmar\n*2* — Reagendar\n*3* — Cancelar",
  confirmation_email_subject:
    "Confirmação: {{nome_evento}} — {{data}} às {{hora}}",
  reminder_whatsapp:
    "Oi {{nome_lead}}! Lembrando que temos *{{nome_evento}}* hoje às *{{hora}}*. Responda *1* para confirmar.",
  recovery_whatsapp:
    "Oi {{nome_lead}}, sentimos sua falta na reunião de hoje. Quer reagendar? Responda esta mensagem que te ajudamos.",
  internal_whatsapp:
    "📅 Novo agendamento: {{nome_lead}} — {{nome_evento}} em {{data}} às {{hora}}.",
} as const;
