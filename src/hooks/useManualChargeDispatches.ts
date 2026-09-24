import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// manual_charge_dispatches_panel ainda não está nos tipos gerados do
// Supabase (view nova, migration não aplicada em produção). Tipa a forma
// real esperada via uma interface declarada + `unknown` no cast do
// client, nunca `any` (ver ManualChargeTriggerButton.tsx para o mesmo
// padrão).
export interface ManualChargeDispatchRow {
  dispatch_id: string;
  organization_id: string;
  lead_id: string;
  lead_name: string | null;
  phone_normalized: string | null;
  campaign_key: string;
  charge_kind: 'debt_reminder' | 'voluntary_contribution_reminder';
  status: string;
  disposition_reason: string | null;
  claim_token: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
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
  lead_timezone_confidence: number | null;
  effective_promised_date: string | null;
  promised_date_occurred_at_source: string | null;
  promised_date_precision: string | null;
  has_pending_ambiguous_signal: boolean | null;
  is_refused: boolean | null;
  refused_reason: string | null;
  is_payment_claimed: boolean | null;
  payment_claim_status: string | null;
  payment_confirmed: boolean;
  attribution_status: string;
  reopen_count: number;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

type PanelViewClient = {
  from: (table: 'manual_charge_dispatches_panel') => {
    select: (columns: '*') => Promise<{ data: ManualChargeDispatchRow[] | null; error: { message: string } | null }>;
  };
};

export function useManualChargeDispatches() {
  return useQuery({
    queryKey: ['manual-charge-dispatches-panel'],
    queryFn: async () => {
      const client = supabase as unknown as PanelViewClient;
      const { data, error } = await client.from('manual_charge_dispatches_panel').select('*');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
