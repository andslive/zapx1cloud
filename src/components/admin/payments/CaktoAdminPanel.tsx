import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaktoCredentialsForm } from './CaktoCredentialsForm';
import { CaktoOrdersTable } from './CaktoOrdersTable';
import { CaktoSummaryCards } from './CaktoSummaryCards';
import { CaktoOfferMapping } from './CaktoOfferMapping';
import { CaktoRecoveryPanel } from './CaktoRecoveryPanel';

import { useAuth } from '@/hooks/useAuth';
import type { PaymentProvider } from '@/hooks/useCaktoOrders';

export function CaktoAdminPanel() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const supaUrl = import.meta.env.VITE_SUPABASE_URL;
  const caktoWebhookUrl = orgId
    ? `${supaUrl}/functions/v1/cakto-webhook?scope=organization&org=${orgId}`
    : `${supaUrl}/functions/v1/cakto-webhook?scope=organization`;

  const [provider, setProvider] = useState<PaymentProvider | 'all'>('all');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos</h1>
          <p className="text-sm text-muted-foreground">Acompanhe vendas de todas as plataformas conectadas (Cakto, Doppus e mais).</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Plataforma</span>
          <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="cakto">Cakto</SelectItem>
              <SelectItem value="doppus">Doppus</SelectItem>
              <SelectItem value="hotmart">Hotmart</SelectItem>
              <SelectItem value="kiwify">Kiwify</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="mapping">Mapear ofertas</TabsTrigger>
          {(provider === 'all' || provider === 'cakto') && (
            <TabsTrigger value="recovery">Recuperação IA</TabsTrigger>
          )}
          <TabsTrigger value="settings">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <CaktoSummaryCards scope="organization" provider={provider} />
          <CaktoOrdersTable scope="organization" provider={provider} hideSync={provider !== 'cakto'} />
        </TabsContent>

        <TabsContent value="orders" className="pt-4">
          <CaktoOrdersTable scope="organization" provider={provider} hideSync={provider !== 'cakto'} />
        </TabsContent>

        <TabsContent value="mapping" className="pt-4">
          <CaktoOfferMapping />
        </TabsContent>

        <TabsContent value="recovery" className="pt-4">
          <CaktoRecoveryPanel />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <CaktoCredentialsForm scope="organization" webhookUrl={caktoWebhookUrl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
