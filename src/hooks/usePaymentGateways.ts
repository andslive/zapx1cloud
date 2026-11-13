import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type GatewayProvider = 'colocapay' | 'leonapay';
export type GatewayEnvironment = 'sandbox' | 'production';

export interface ConnectionTestResult {
  credential_accepted: boolean;
  method_available: boolean | null;
  detail: string;
  http_status: number | null;
  limits?: { min?: number; max?: number };
  parser_confidence: 'matched' | 'heuristic' | 'none';
  checked_at: string;
}

/** Só estado e dados mascarados: os segredos nunca voltam do backend. */
export interface PaymentGatewayAccount {
  id: string;
  provider: GatewayProvider;
  label: string;
  environment: GatewayEnvironment;
  enabled: boolean;
  api_key_masked: string | null;
  webhook_secret_masked: string | null;
  webhook_secret_set: boolean;
  webhook_url: string;
  last_test_at: string | null;
  last_test_result: ConnectionTestResult | null;
}

export interface PaymentGatewayCatalogEntry {
  provider: GatewayProvider;
  label: string;
  methods: { method: string; currency: string; country?: string; requiresAmount: boolean; supportsAmountless?: boolean }[];
  credential_help: { apiKey: string; webhookSecret: string };
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payment-gateways-api', { body });
  if (error) {
    // Corpo de erro da função (mensagem em PT) quando disponível.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = j.error;
    } catch {
      /* mantém a mensagem genérica */
    }
    throw new Error(msg);
  }
  return data as T;
}

export function usePaymentGatewayAccounts() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['payment-gateway-accounts', profile?.organization_id],
    queryFn: () =>
      call<{ accounts: PaymentGatewayAccount[]; catalog: PaymentGatewayCatalogEntry[] }>({ action: 'list' }),
    enabled: !!profile?.organization_id,
  });
}

export function useSavePaymentGatewayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: string;
      provider: GatewayProvider;
      label: string;
      environment: GatewayEnvironment;
      api_key?: string;
      webhook_secret?: string;
    }) => call<{ account: PaymentGatewayAccount }>({ action: 'upsert', ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-gateway-accounts'] }),
  });
}

export function useTestPaymentGatewayAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call<{ result: ConnectionTestResult }>({ action: 'test', id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-gateway-accounts'] }),
  });
}

export function useSetPaymentGatewayEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      call<{ account: PaymentGatewayAccount }>({ action: 'set_enabled', ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-gateway-accounts'] }),
  });
}
