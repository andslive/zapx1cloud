import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// manual_charge_dispatches_panel / manual_charge_dispatches ainda não estão nos tipos gerados do Supabase.
// Tipa a forma real esperada via interfaces declaradas + `unknown` no cast do client, nunca `any`.
//
// DESEMPENHO (causa do "canceling statement due to statement timeout"): a view calcula `payment_confirmed`
// com um EXISTS correlacionado em purchase_audit (sem índice em lead_id). Para leads NÃO pagos, cada dispatch
// varre a tabela inteira. Por isso: (1) colunas EXPLÍCITAS, sem payment_confirmed (coluna não pedida não é
// calculada); (2) paginação no servidor; (3) totais por contagem no servidor sobre o conjunto filtrado.

export interface ManualChargeDispatchRow {
  dispatch_id: string;
  organization_id: string;
  lead_id: string;
  lead_name: string | null;
  phone_normalized: string | null;
  campaign_key: string;
  charge_kind: 'debt_reminder' | 'voluntary_contribution_reminder';
  status: string;
  sent_at: string | null;
  agreed_date: string | null;
  planned_send_at: string | null;
  scheduling_status: string;
  connection_id: string | null;
  connection_name: string | null;
  connection_status: string | null;
  connection_provider: string;
  lead_preferred_locale: string | null;
  lead_locale_source: string | null;
  lead_preferred_timezone: string | null;
  lead_timezone_source: string | null;
  effective_promised_date: string | null;
  promised_date_precision: string | null;
  has_pending_ambiguous_signal: boolean | null;
  is_refused: boolean | null;
  refused_reason: string | null;
  is_payment_claimed: boolean | null;
  payment_claim_status: string | null;
  reopen_count: number;
  review_reason: string | null;
  created_at: string;
}

const PANEL_COLUMNS = [
  'dispatch_id', 'organization_id', 'lead_id', 'lead_name', 'phone_normalized', 'campaign_key', 'charge_kind', 'status',
  'sent_at', 'agreed_date', 'planned_send_at', 'scheduling_status', 'connection_id', 'connection_name', 'connection_status',
  'connection_provider', 'lead_preferred_locale', 'lead_locale_source', 'lead_preferred_timezone', 'lead_timezone_source',
  'effective_promised_date', 'promised_date_precision', 'has_pending_ambiguous_signal', 'is_refused', 'refused_reason',
  'is_payment_claimed', 'payment_claim_status', 'reopen_count', 'review_reason', 'created_at',
].join(',');

export const MANUAL_CHARGE_PAGE_SIZE = 20;

export interface ManualChargeFilters {
  search: string;
  kind: 'all' | 'debt_reminder' | 'voluntary_contribution_reminder';
  /**
   * 'all' | 'review' (Em revisão) | 'receipt' (Comprovante em análise) | status exato.
   * Em revisão = status interno eligible, ou hold_receipt_review SEM alegação de pagamento, sempre COM motivo de bloqueio.
   * Comprovante em análise = hold_receipt_review COM alegação de pagamento no registro.
   */
  status: string;
  page: number;
}

interface QueryResult<T> { data: T | null; error: { message: string } | null; count: number | null }
interface Builder<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string): Builder<T>;
  is(column: string, value: null): Builder<T>;
  not(column: string, operator: string, value: null): Builder<T>;
  or(filters: string): Builder<T>;
  order(column: string, opts: { ascending: boolean }): Builder<T>;
  range(from: number, to: number): Builder<T>;
}
interface TableClient {
  from(table: 'manual_charge_dispatches_panel' | 'manual_charge_dispatches'): {
    select<T>(columns: string, opts?: { count: 'exact'; head?: boolean }): Builder<T>;
  };
}

// Termo de busca: remove os caracteres que têm significado na sintaxe de filtros do PostgREST.
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export interface ManualChargePage { rows: ManualChargeDispatchRow[]; total: number }

export function useManualChargePage(filters: ManualChargeFilters) {
  return useQuery({
    queryKey: ['manual-charge-dispatches-panel', 'page', filters],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<ManualChargePage> => {
      const client = supabase as unknown as TableClient;
      let q = client.from('manual_charge_dispatches_panel').select<ManualChargeDispatchRow[]>(PANEL_COLUMNS, { count: 'exact' });
      if (filters.kind !== 'all') q = q.eq('charge_kind', filters.kind);
      if (filters.status === 'review') {
        // Em revisão: eligible, ou hold_receipt_review sem alegação de pagamento; sempre com motivo de bloqueio.
        q = q.not('review_reason', 'is', null)
          .or('status.eq.eligible,and(status.eq.hold_receipt_review,or(is_payment_claimed.is.null,is_payment_claimed.eq.false))');
      } else if (filters.status === 'receipt') {
        q = q.eq('status', 'hold_receipt_review').eq('is_payment_claimed', 'true');
      } else if (filters.status !== 'all') {
        q = q.eq('status', filters.status);
      }
      const term = sanitizeSearch(filters.search);
      // Dois parâmetros `or` na mesma consulta são combinados com AND pelo PostgREST (verificado); postgrest-js não tem `.and()`.
      if (term) q = q.or(`lead_name.ilike.*${term}*,phone_normalized.ilike.*${term}*,campaign_key.ilike.*${term}*`);
      const from = (filters.page - 1) * MANUAL_CHARGE_PAGE_SIZE;
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .order('dispatch_id', { ascending: true })
        .range(from, from + MANUAL_CHARGE_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
}

export interface ManualChargeSummary {
  total: number;
  debt: number;
  voluntary: number;
  ambiguous: number;
  unblocked: number;
}

// Totais da organização (não dependem dos filtros da tabela). total/tipo/ambíguo vêm da tabela base (barato);
// "liberados" precisa do motivo de revisão, calculado pela view só para o filtro pedido.
export function useManualChargeSummary() {
  return useQuery({
    queryKey: ['manual-charge-dispatches-panel', 'summary'],
    queryFn: async (): Promise<ManualChargeSummary> => {
      const client = supabase as unknown as TableClient;
      const head = { count: 'exact' as const, head: true };
      const n = async (b: Builder<unknown>) => {
        const { error, count } = await b;
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const base = () => client.from('manual_charge_dispatches').select<unknown>('id', head);
      const [total, debt, voluntary, ambiguous, unblocked] = await Promise.all([
        n(base()),
        n(base().eq('charge_kind', 'debt_reminder')),
        n(base().eq('charge_kind', 'voluntary_contribution_reminder')),
        n(base().eq('scheduling_status', 'blocked_ambiguous_order')),
        n(client.from('manual_charge_dispatches_panel').select<unknown>('dispatch_id', head).is('review_reason', null)),
      ]);
      return { total, debt, voluntary, ambiguous, unblocked };
    },
  });
}
