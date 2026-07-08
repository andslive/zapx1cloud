import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type CommercialPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface CommercialFilters {
  period: CommercialPeriod;
  startDate?: string; // YYYY-MM-DD (data local SP) — só para custom
  endDate?: string;   // YYYY-MM-DD (data local SP) — só para custom
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
