// CSV export utilities for leads.
export type ExportableLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  temperature: string | null;
  lead_origin: string | null;
  lead_channel: string | null;
  deal_value: number | null;
  current_stage_id?: string | null;
  pipeline_stages?: { name?: string | null } | null;
  assigned_to?: string | null;
  squad_id?: string | null;
  product_id?: string | null;
  created_at: string;
  last_contact_at: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

export type ExportContext = {
  teamMap: Record<string, string>;
  squadMap: Record<string, string>;
  productMap: Record<string, string>;
  tagsByLead: Record<string, string[]>;
};

const TEMP_LABELS: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
};

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function leadsToCsv(leads: ExportableLead[], ctx: ExportContext): string {
  const headers = [
    'Nome', 'E-mail', 'Telefone', 'Empresa', 'Cargo', 'Temperatura',
    'Origem', 'Canal', 'Estágio', 'Vendedor', 'Squad', 'Produto',
    'Valor (R$)', 'Etiquetas', 'UTM Source', 'UTM Medium', 'UTM Campaign',
    'Criado em', 'Último contato',
  ];
  const rows = leads.map((l) => [
    l.name,
    l.email,
    l.phone,
    l.company,
    l.position,
    l.temperature ? TEMP_LABELS[l.temperature] || l.temperature : '',
    l.lead_origin,
    l.lead_channel,
    l.pipeline_stages?.name || '',
    l.assigned_to ? ctx.teamMap[l.assigned_to] || '' : '',
    l.squad_id ? ctx.squadMap[l.squad_id] || '' : '',
    l.product_id ? ctx.productMap[l.product_id] || '' : '',
    l.deal_value ?? 0,
    (ctx.tagsByLead[l.id] || []).join('; '),
    l.utm_source,
    l.utm_medium,
    l.utm_campaign,
    l.created_at,
    l.last_contact_at,
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  // BOM for Excel UTF-8 recognition
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Minimal CSV parser supporting quoted fields and commas
  const lines: string[][] = [];
  let cur: string[] = [];
  let val = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; }
        else inQuotes = false;
      } else {
        val += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(val); val = ''; }
      else if (c === '\n') { cur.push(val); lines.push(cur); cur = []; val = ''; }
      else if (c === '\r') { /* ignore */ }
      else val += c;
    }
  }
  if (val.length > 0 || cur.length > 0) { cur.push(val); lines.push(cur); }

  const headers = (lines.shift() || []).map((h) => h.trim());
  const rows = lines
    .filter((r) => r.some((c) => c && c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
  return { headers, rows };
}
