import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { dddToUf, UF_NAO_IDENTIFICADO } from '@/lib/dddToUf';

export type CommercialPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface CommercialFilters {
  period: CommercialPeriod;
  startDate?: string; // YYYY-MM-DD (data local SP) — só para custom
  endDate?: string;   // YYYY-MM-DD (data local SP) — só para custom
  connectionId?: string; // filtro por instância (leads.connection_id)
  funnelId?: string;     // filtro por funil (lead_funnel_history.funnel_id)
}

export const FUNIL_NAO_IDENTIFICADO = 'Funil não identificado';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const SP_TZ = 'America/Sao_Paulo';

/** Data local de São Paulo (YYYY-MM-DD) de um instante. */
function spDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return parts; // en-CA => YYYY-MM-DD
}

/** Hora local de São Paulo (00-23) de um instante. */
function spHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: SP_TZ, hour: '2-digit', hour12: false,
  }).format(date));
}

/**
 * Início/fim UTC do dia local de SP que contém `dateKey` (YYYY-MM-DD).
 * SP é UTC-3 fixo (sem horário de verão desde 2019).
 */
function spDayBoundaries(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00-03:00`);
  const end = new Date(`${dateKey}T23:59:59.999-03:00`);
  return { start, end };
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lista de datas locais SP (YYYY-MM-DD) cobertas pelo período. */
function spDateRange(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let cur = startKey;
  // Trava de segurança: nunca iterar mais de 366 dias
  for (let i = 0; i < 366 && cur <= endKey; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function resolvePeriod(filters: CommercialFilters): { startKey: string; endKey: string } {
  const todayKey = spDateKey(new Date());
  switch (filters.period) {
    case 'today':
      return { startKey: todayKey, endKey: todayKey };
    case 'yesterday': {
      const y = addDays(todayKey, -1);
      return { startKey: y, endKey: y };
    }
    case '7d':
      return { startKey: addDays(todayKey, -6), endKey: todayKey };
    case '30d':
      return { startKey: addDays(todayKey, -29), endKey: todayKey };
    case 'custom': {
      const startKey = filters.startDate || todayKey;
      const endKey = filters.endDate || startKey;
      return startKey <= endKey ? { startKey, endKey } : { startKey: endKey, endKey: startKey };
    }
    default:
      return { startKey: todayKey, endKey: todayKey };
  }
}

export interface CommercialDashboardData {
  newLeads: number;
  revenue: number;
  avgTicket: number;
  sales: number;
  metaSpend: number;
  profit: number;
  roas: number | null; // null quando investimento = 0 → UI mostra "—"
  conversionRate: number;
  salesSeries: { label: string; sales: number }[];
  groupedBy: 'hour' | 'day';
  periodDays: string[];
}

export function useCommercialDashboard(filters: CommercialFilters) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery<CommercialDashboardData | null>({
    queryKey: ['commercial-dashboard', orgId, JSON.stringify(filters)],
    queryFn: async () => {
      if (!orgId) return null;

      const { startKey, endKey } = resolvePeriod(filters);
      const startIso = spDayBoundaries(startKey).start.toISOString();
      const endIso = spDayBoundaries(endKey).end.toISOString();
      const periodDays = spDateRange(startKey, endKey);

      const client = supabase as any;

      // 1) Novos leads do período (escopo explícito por organização)
      const { count: leadsCount, error: leadsErr } = await client
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (leadsErr) throw leadsErr;

      // 2) Compras aprovadas. purchase_audit não tem organization_id:
      //    o escopo vem do join com leads (além do RLS do banco).
      const { data: purchasesRaw, error: purchasesErr } = await client
        .from('purchase_audit')
        .select('id, created_at, purchase_value, fbtrace_id, event_id, purchase_status, leads!inner(organization_id)')
        .eq('purchase_status', 'success')
        .eq('leads.organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (purchasesErr) throw purchasesErr;

      // Deduplicação: o mesmo Purchase gera múltiplas linhas (retries de
      // CAPI). Chave forte = fbtrace_id (confirmação Meta) > event_id.
      // Linhas sem identificador forte são descartadas (logs técnicos).
      const unique = new Map<string, any>();
      for (const p of (purchasesRaw || []) as any[]) {
        const fbtrace = p.fbtrace_id && p.fbtrace_id !== 'N/A' ? p.fbtrace_id : null;
        const eventId = p.event_id && p.event_id !== 'N/A' ? p.event_id : null;
        const key = fbtrace || eventId;
        if (!key) continue;
        const existing = unique.get(key);
        if (!existing || (fbtrace && (!existing.fbtrace_id || existing.fbtrace_id === 'N/A'))) {
          unique.set(key, p);
        }
      }
      const purchases = Array.from(unique.values())
        .filter((p) => Number(p.purchase_value) > 0);

      // 3) Investimento Meta manual do período
      const { data: spendRows, error: spendErr } = await client
        .from('commercial_dashboard_meta_spend')
        .select('spend_date, amount')
        .eq('organization_id', orgId)
        .gte('spend_date', startKey)
        .lte('spend_date', endKey);
      if (spendErr) throw spendErr;
      const metaSpend = ((spendRows || []) as any[])
        .reduce((acc, r) => acc + Number(r.amount || 0), 0);

      // 4) Métricas derivadas — regras de divisão por zero
      const revenue = purchases.reduce((acc, p) => acc + Number(p.purchase_value || 0), 0);
      const sales = purchases.length;
      const newLeads = leadsCount || 0;
      const avgTicket = sales > 0 ? revenue / sales : 0;
      const profit = revenue - metaSpend;
      const roas = metaSpend > 0 ? revenue / metaSpend : null;
      const conversionRate = newLeads > 0 ? (sales / newLeads) * 100 : 0;

      // 5) Vendas por período (quantidade), timezone SP
      const groupedBy: 'hour' | 'day' = periodDays.length === 1 ? 'hour' : 'day';
      let salesSeries: { label: string; sales: number }[];
      if (groupedBy === 'hour') {
        const byHour = new Array(24).fill(0);
        for (const p of purchases) byHour[spHour(new Date(p.created_at))]++;
        salesSeries = byHour.map((n, h) => ({
          label: `${String(h).padStart(2, '0')}:00`,
          sales: n,
        }));
      } else {
        const byDay = new Map<string, number>(periodDays.map((d) => [d, 0]));
        for (const p of purchases) {
          const k = spDateKey(new Date(p.created_at));
          if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1);
        }
        salesSeries = periodDays.map((d) => ({
          label: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
          sales: byDay.get(d) || 0,
        }));
      }

      return {
        newLeads, revenue, avgTicket, sales, metaSpend, profit, roas,
        conversionRate, salesSeries, groupedBy, periodDays,
      };
    },
    enabled: !!orgId,
  });
}

/**
 * Salva o investimento Meta manual. Períodos de 1 dia gravam naquele dia;
 * períodos multi-dia gravam o valor inteiro no último dia do período e
 * zeram os demais dias já registrados dentro dele, mantendo a soma do
 * período consistente com o que o usuário digitou.
 */
export function useSaveMetaSpend() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async ({ filters, amount }: { filters: CommercialFilters; amount: number }) => {
      if (!orgId) throw new Error('Organização não identificada');
      if (!(amount >= 0)) throw new Error('Valor inválido');

      const { startKey, endKey } = resolvePeriod(filters);
      const days = spDateRange(startKey, endKey);
      const client = supabase as any;

      if (days.length === 1) {
        const { error } = await client
          .from('commercial_dashboard_meta_spend')
          .upsert(
            { organization_id: orgId, spend_date: days[0], amount },
            { onConflict: 'organization_id,spend_date' },
          );
        if (error) throw error;
        return;
      }

      // Multi-dia: zera os dias existentes do período e registra o total
      // no último dia (soma do período = valor digitado).
      const { error: zeroErr } = await client
        .from('commercial_dashboard_meta_spend')
        .update({ amount: 0 })
        .eq('organization_id', orgId)
        .gte('spend_date', startKey)
        .lte('spend_date', endKey);
      if (zeroErr) throw zeroErr;

      const { error } = await client
        .from('commercial_dashboard_meta_spend')
        .upsert(
          { organization_id: orgId, spend_date: endKey, amount },
          { onConflict: 'organization_id,spend_date' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Investimento Meta salvo');
      queryClient.invalidateQueries({ queryKey: ['commercial-dashboard'] });
    },
    onError: (err: any) => {
      toast.error(`Falha ao salvar investimento: ${err?.message || err}`);
    },
  });
}

// ===================== Dashboard V2 =====================
// Extensões: filtros por instância/funil, quebras por instância/estado e
// Histórico de Vendas (automáticas + manuais + edições auditadas).
// Não altera o comportamento de useCommercialDashboard/useSaveMetaSpend acima.

export interface CommercialFilterOption {
  id: string;
  label: string;
}

/** Instâncias e funis do org, para popular os selects de filtro. */
export function useCommercialFilterOptions() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery<{ connections: CommercialFilterOption[]; funnels: CommercialFilterOption[] }>({
    queryKey: ['commercial-dashboard-filter-options', orgId],
    queryFn: async () => {
      if (!orgId) return { connections: [], funnels: [] };
      const client = supabase as any;

      const [{ data: connections, error: connErr }, { data: funnels, error: funnelErr }] = await Promise.all([
        client.from('evolution_instances').select('id, name, phone_number').eq('organization_id', orgId),
        client.from('capture_funnels').select('id, name').eq('organization_id', orgId),
      ]);
      if (connErr) throw connErr;
      if (funnelErr) throw funnelErr;

      return {
        connections: ((connections || []) as any[]).map((c) => ({
          id: c.id,
          label: c.name || c.phone_number || 'Sem nome',
        })),
        funnels: ((funnels || []) as any[]).map((f) => ({ id: f.id, label: f.name })),
      };
    },
    enabled: !!orgId,
  });
}

export interface SaleHistoryRow {
  id: string;
  origin: 'automatic' | 'manual';
  date: string;
  instanceId: string | null;
  instanceName: string;
  instanceNumber: string | null;
  leadPhone: string | null;
  customerName: string;
  offerLabel: string;
  purchaseValue: number;
  currency: string;
  sourceLabel: string;
  funnelId: string | null;
  edited: boolean;
}

export interface CommercialDashboardV2Data extends CommercialDashboardData {
  salesByInstance: { instanceId: string | null; label: string; sales: number; revenue: number }[];
  salesByState: { uf: string; sales: number }[];
  history: SaleHistoryRow[];
}

/** Última edição (por edited_at) de cada campo, indexada por alvo (purchase_audit_id ou manual_sale_id). */
function buildEditsIndex(edits: any[]): Map<string, Map<string, string>> {
  const byTarget = new Map<string, Map<string, string>>();
  const sorted = [...edits].sort(
    (a, b) => new Date(a.edited_at).getTime() - new Date(b.edited_at).getTime(),
  );
  for (const e of sorted) {
    const targetId = e.purchase_audit_id || e.manual_sale_id;
    if (!targetId) continue;
    if (!byTarget.has(targetId)) byTarget.set(targetId, new Map());
    byTarget.get(targetId)!.set(e.field_name, e.new_value);
  }
  return byTarget;
}

export function useCommercialDashboardV2(filters: CommercialFilters) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery<CommercialDashboardV2Data | null>({
    queryKey: ['commercial-dashboard-v2', orgId, JSON.stringify(filters)],
    queryFn: async () => {
      if (!orgId) return null;
      const client = supabase as any;

      const { startKey, endKey } = resolvePeriod(filters);
      const startIso = spDayBoundaries(startKey).start.toISOString();
      const endIso = spDayBoundaries(endKey).end.toISOString();
      const periodDays = spDateRange(startKey, endKey);

      // 1) Novos leads do período
      const { count: leadsCount, error: leadsErr } = await client
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (leadsErr) throw leadsErr;

      // 2) Compras automáticas aprovadas, com dados de lead para instância/telefone/UF.
      //    Não seleciono purchase_audit.connection_id: essa coluna está corrompida em
      //    produção (guarda o JSON da instância inteira) — a instância real e confiável
      //    vem de leads.connection_id (FK válida).
      const { data: purchasesRaw, error: purchasesErr } = await client
        .from('purchase_audit')
        .select(
          'id, created_at, purchase_value, currency, fbtrace_id, event_id, purchase_status, ' +
          'customer_name, phone, lead_id, leads!inner(organization_id, connection_id, phone_normalized, phone, name)',
        )
        .eq('purchase_status', 'success')
        .eq('leads.organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (purchasesErr) throw purchasesErr;

      // Dedup: mesma regra da V1 (fbtrace_id > event_id; descarta sem id forte).
      const uniqueMap = new Map<string, any>();
      for (const p of (purchasesRaw || []) as any[]) {
        const fbtrace = p.fbtrace_id && p.fbtrace_id !== 'N/A' ? p.fbtrace_id : null;
        const eventId = p.event_id && p.event_id !== 'N/A' ? p.event_id : null;
        const key = fbtrace || eventId;
        if (!key) continue;
        const existing = uniqueMap.get(key);
        if (!existing || (fbtrace && (!existing.fbtrace_id || existing.fbtrace_id === 'N/A'))) {
          uniqueMap.set(key, p);
        }
      }
      const automaticPurchases = Array.from(uniqueMap.values())
        .filter((p) => Number(p.purchase_value) > 0);

      // 3) Funil por lead: lead_funnel_history é parcial (cobre ~46% dos leads
      //    com compra). Quando um lead tem mais de um registro, uso o mais
      //    recente (completed_at, com fallback para started_at).
      const leadIds = Array.from(new Set(automaticPurchases.map((p) => p.lead_id).filter(Boolean)));
      const funnelByLead = new Map<string, string>();
      for (const idsChunk of chunk(leadIds, 300)) {
        const { data: fh, error: fhErr } = await client
          .from('lead_funnel_history')
          .select('lead_id, funnel_id, completed_at, started_at')
          .in('lead_id', idsChunk);
        if (fhErr) throw fhErr;
        for (const row of (fh || []) as any[]) {
          const ts = row.completed_at || row.started_at;
          const current = funnelByLead.get(row.lead_id);
          if (!current) {
            funnelByLead.set(row.lead_id, row.funnel_id);
            (funnelByLead as any).set(`${row.lead_id}__ts`, ts);
          } else {
            const currentTs = (funnelByLead as any).get(`${row.lead_id}__ts`);
            if (ts && (!currentTs || new Date(ts) > new Date(currentTs))) {
              funnelByLead.set(row.lead_id, row.funnel_id);
              (funnelByLead as any).set(`${row.lead_id}__ts`, ts);
            }
          }
        }
      }

      // 4) Vendas manuais ativas do período
      const { data: manualRaw, error: manualErr } = await client
        .from('commercial_manual_sales')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .gte('sale_date', startKey)
        .lte('sale_date', endKey);
      if (manualErr) throw manualErr;
      const manualSales = (manualRaw || []) as any[];

      // 5) Edições auditadas (overlay de exibição — nunca sobrescreve o dado bruto)
      const purchaseIds = automaticPurchases.map((p) => p.id);
      const manualIds = manualSales.map((m) => m.id);
      const edits: any[] = [];
      for (const idsChunk of chunk(purchaseIds, 300)) {
        if (idsChunk.length === 0) continue;
        const { data, error } = await client
          .from('commercial_sale_edits')
          .select('purchase_audit_id, manual_sale_id, field_name, new_value, edited_at')
          .in('purchase_audit_id', idsChunk);
        if (error) throw error;
        edits.push(...(data || []));
      }
      for (const idsChunk of chunk(manualIds, 300)) {
        if (idsChunk.length === 0) continue;
        const { data, error } = await client
          .from('commercial_sale_edits')
          .select('purchase_audit_id, manual_sale_id, field_name, new_value, edited_at')
          .in('manual_sale_id', idsChunk);
        if (error) throw error;
        edits.push(...(data || []));
      }
      const editsIndex = buildEditsIndex(edits);

      // 6) Instâncias/funis para rotular
      const { connections, funnels } = await (async () => {
        const [{ data: c }, { data: f }] = await Promise.all([
          client.from('evolution_instances').select('id, name, phone_number').eq('organization_id', orgId),
          client.from('capture_funnels').select('id, name').eq('organization_id', orgId),
        ]);
        return {
          connections: new Map(((c || []) as any[]).map((r) => [r.id, r])),
          funnels: new Map(((f || []) as any[]).map((r) => [r.id, r.name])),
        };
      })();

      // 7) Monta linhas unificadas do histórico + aplica filtros de instância/funil
      const history: SaleHistoryRow[] = [];

      for (const p of automaticPurchases) {
        const instanceId: string | null = p.leads?.connection_id || null;
        const funnelId = funnelByLead.get(p.lead_id) || null;
        if (filters.connectionId && instanceId !== filters.connectionId) continue;
        if (filters.funnelId && funnelId !== filters.funnelId) continue;

        const fieldEdits = editsIndex.get(p.id);
        const instance = instanceId ? connections.get(instanceId) : null;
        history.push({
          id: p.id,
          origin: 'automatic',
          date: p.created_at,
          instanceId,
          instanceName: fieldEdits?.get('source_label') ?? (instance?.name || 'Sem instância'),
          instanceNumber: instance?.phone_number || null,
          leadPhone: p.leads?.phone || p.phone || null,
          customerName: fieldEdits?.get('customer_name') ?? (p.customer_name || p.leads?.name || 'Não identificado'),
          offerLabel: fieldEdits?.get('offer_name') ?? (funnelId ? funnels.get(funnelId) || FUNIL_NAO_IDENTIFICADO : FUNIL_NAO_IDENTIFICADO),
          purchaseValue: fieldEdits?.has('purchase_value') ? Number(fieldEdits.get('purchase_value')) : Number(p.purchase_value),
          currency: p.currency || 'BRL',
          sourceLabel: fieldEdits?.get('source_label') ?? '—',
          funnelId,
          edited: !!fieldEdits && fieldEdits.size > 0,
        });
      }

      for (const m of manualSales) {
        if (filters.connectionId && m.connection_id !== filters.connectionId) continue;
        if (filters.funnelId && m.funnel_id !== filters.funnelId) continue;

        const fieldEdits = editsIndex.get(m.id);
        const instance = m.connection_id ? connections.get(m.connection_id) : null;
        history.push({
          id: m.id,
          origin: 'manual',
          date: m.sale_date,
          instanceId: m.connection_id,
          instanceName: instance?.name || 'Sem instância',
          instanceNumber: instance?.phone_number || null,
          leadPhone: m.lead_phone,
          customerName: fieldEdits?.get('customer_name') ?? m.customer_name,
          offerLabel: fieldEdits?.get('offer_name') ?? (m.funnel_id ? funnels.get(m.funnel_id) || m.offer_name || FUNIL_NAO_IDENTIFICADO : m.offer_name || FUNIL_NAO_IDENTIFICADO),
          purchaseValue: fieldEdits?.has('purchase_value') ? Number(fieldEdits.get('purchase_value')) : Number(m.purchase_value),
          currency: m.currency || 'BRL',
          sourceLabel: fieldEdits?.get('source_label') ?? (m.source_label || '—'),
          funnelId: m.funnel_id,
          edited: !!fieldEdits && fieldEdits.size > 0,
        });
      }

      history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // 8) Métricas: automáticas dedupe + manuais ativas, sem sobreposição
      //    possível (tabelas fisicamente distintas).
      const revenue = history.reduce((acc, r) => acc + r.purchaseValue, 0);
      const sales = history.length;
      const newLeads = leadsCount || 0;
      const avgTicket = sales > 0 ? revenue / sales : 0;

      const { data: spendRows, error: spendErr } = await client
        .from('commercial_dashboard_meta_spend')
        .select('spend_date, amount')
        .eq('organization_id', orgId)
        .gte('spend_date', startKey)
        .lte('spend_date', endKey);
      if (spendErr) throw spendErr;
      const metaSpend = ((spendRows || []) as any[]).reduce((acc, r) => acc + Number(r.amount || 0), 0);

      const profit = revenue - metaSpend;
      const roas = metaSpend > 0 ? revenue / metaSpend : null;
      const conversionRate = newLeads > 0 ? (sales / newLeads) * 100 : 0;

      const groupedBy: 'hour' | 'day' = periodDays.length === 1 ? 'hour' : 'day';
      let salesSeries: { label: string; sales: number }[];
      if (groupedBy === 'hour') {
        const byHour = new Array(24).fill(0);
        for (const r of history) byHour[spHour(new Date(r.date))]++;
        salesSeries = byHour.map((n, h) => ({ label: `${String(h).padStart(2, '0')}:00`, sales: n }));
      } else {
        const byDay = new Map<string, number>(periodDays.map((d) => [d, 0]));
        for (const r of history) {
          const k = spDateKey(new Date(r.date));
          if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1);
        }
        salesSeries = periodDays.map((d) => ({ label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, sales: byDay.get(d) || 0 }));
      }

      // 9) Quebras por instância e por estado (estimativa por DDD)
      const byInstance = new Map<string, { instanceId: string | null; label: string; sales: number; revenue: number }>();
      for (const r of history) {
        const key = r.instanceId || 'none';
        const label = r.instanceId ? (connections.get(r.instanceId)?.name || r.instanceName) : 'Sem instância';
        if (!byInstance.has(key)) byInstance.set(key, { instanceId: r.instanceId, label, sales: 0, revenue: 0 });
        const b = byInstance.get(key)!;
        b.sales += 1;
        b.revenue += r.purchaseValue;
      }
      const salesByInstance = Array.from(byInstance.values()).sort((a, b) => b.revenue - a.revenue);

      const byState = new Map<string, number>();
      for (const r of history) {
        const uf = dddToUf(r.leadPhone);
        byState.set(uf, (byState.get(uf) || 0) + 1);
      }
      const salesByState = Array.from(byState.entries())
        .map(([uf, count]) => ({ uf, sales: count }))
        .sort((a, b) => (a.uf === UF_NAO_IDENTIFICADO ? 1 : b.uf === UF_NAO_IDENTIFICADO ? -1 : b.sales - a.sales));

      return {
        newLeads, revenue, avgTicket, sales, metaSpend, profit, roas,
        conversionRate, salesSeries, groupedBy, periodDays,
        salesByInstance, salesByState, history,
      };
    },
    enabled: !!orgId,
  });
}

/**
 * Leads por instância no período (leads.connection_id). Consulta mínima e
 * adicional — não existe hoje nenhuma fonte já buscada pelo Dashboard V2 com
 * granularidade por instância para Leads (o `newLeads` do V2 é um total
 * único do período). Usada apenas pelo card "Resumo por Instância e Funil".
 */
export function useLeadsByInstance(filters: CommercialFilters) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery<Map<string, number>>({
    queryKey: ['commercial-dashboard-leads-by-instance', orgId, JSON.stringify(filters)],
    queryFn: async () => {
      if (!orgId) return new Map();
      const client = supabase as any;

      const { startKey, endKey } = resolvePeriod(filters);
      const startIso = spDayBoundaries(startKey).start.toISOString();
      const endIso = spDayBoundaries(endKey).end.toISOString();

      let query = client
        .from('leads')
        .select('connection_id')
        .eq('organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (filters.connectionId) query = query.eq('connection_id', filters.connectionId);

      const { data, error } = await query;
      if (error) throw error;

      const map = new Map<string, number>();
      for (const r of (data || []) as any[]) {
        const key = r.connection_id || 'none';
        map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
    },
    enabled: !!orgId,
  });
}

export interface CreateManualSaleInput {
  saleDate: string;
  connectionId?: string;
  leadPhone?: string;
  customerName: string;
  funnelId?: string;
  offerName?: string;
  purchaseValue: number;
  currency?: string;
  sourceLabel?: string;
  notes?: string;
}

export function useCreateManualSale() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (input: CreateManualSaleInput) => {
      if (!orgId) throw new Error('Organização não identificada');
      if (!user?.id) throw new Error('Usuário não identificado');
      if (!(input.purchaseValue >= 0)) throw new Error('Valor inválido');
      if (!input.customerName.trim()) throw new Error('Cliente é obrigatório');

      const client = supabase as any;
      const { error } = await client.from('commercial_manual_sales').insert({
        organization_id: orgId,
        sale_date: input.saleDate,
        connection_id: input.connectionId || null,
        lead_phone: input.leadPhone || null,
        customer_name: input.customerName.trim(),
        funnel_id: input.funnelId || null,
        offer_name: input.offerName || null,
        purchase_value: input.purchaseValue,
        currency: input.currency || 'BRL',
        source_label: input.sourceLabel || null,
        notes: input.notes || null,
        manual_created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Venda manual registrada');
      queryClient.invalidateQueries({ queryKey: ['commercial-dashboard-v2'] });
    },
    onError: (err: any) => {
      toast.error(`Falha ao registrar venda: ${err?.message || err}`);
    },
  });
}

export interface EditSaleInput {
  origin: 'automatic' | 'manual';
  id: string;
  fieldName: 'purchase_value' | 'customer_name' | 'offer_name' | 'source_label';
  oldValue: string;
  newValue: string;
  reason?: string;
}

/**
 * Registra uma edição auditável. Para vendas manuais (tabela própria),
 * também atualiza o valor exibido diretamente na linha; para vendas
 * automáticas, o purchase_audit bruto NUNCA é alterado — a edição vira
 * um overlay de exibição via commercial_sale_edits.
 */
export function useEditSale() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (input: EditSaleInput) => {
      if (!orgId) throw new Error('Organização não identificada');
      if (!user?.id) throw new Error('Usuário não identificado');

      const client = supabase as any;

      const { error: editErr } = await client.from('commercial_sale_edits').insert({
        organization_id: orgId,
        purchase_audit_id: input.origin === 'automatic' ? input.id : null,
        manual_sale_id: input.origin === 'manual' ? input.id : null,
        field_name: input.fieldName,
        old_value: input.oldValue,
        new_value: input.newValue,
        edited_by: user.id,
        reason: input.reason || null,
      });
      if (editErr) throw editErr;

      if (input.origin === 'manual') {
        const columnMap: Record<string, string> = {
          purchase_value: 'purchase_value',
          customer_name: 'customer_name',
          offer_name: 'offer_name',
          source_label: 'source_label',
        };
        const column = columnMap[input.fieldName];
        const value = input.fieldName === 'purchase_value' ? Number(input.newValue) : input.newValue;
        const { error: updErr } = await client
          .from('commercial_manual_sales')
          .update({ [column]: value })
          .eq('id', input.id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      toast.success('Venda atualizada (edição registrada na auditoria)');
      queryClient.invalidateQueries({ queryKey: ['commercial-dashboard-v2'] });
    },
    onError: (err: any) => {
      toast.error(`Falha ao editar venda: ${err?.message || err}`);
    },
  });
}
