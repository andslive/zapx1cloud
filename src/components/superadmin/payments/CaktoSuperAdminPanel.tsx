import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CaktoCredentialsForm } from '@/components/admin/payments/CaktoCredentialsForm';
import { CaktoOrdersTable } from '@/components/admin/payments/CaktoOrdersTable';
import { CaktoSummaryCards } from '@/components/admin/payments/CaktoSummaryCards';
import { CaktoLogo } from '@/components/ui/integrations/CaktoLogo';
import { CaktoPlanMapping } from './CaktoPlanMapping';

export function CaktoSuperAdminPanel() {
  const supaUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supaUrl}/functions/v1/cakto-webhook?scope=platform`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <CaktoLogo /> Pagamentos
          </h1>
          <p className="text-sm text-muted-foreground">Conta Cakto da plataforma — recebimentos e mapeamento dos planos.</p>
        </div>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Configuração</TabsTrigger>
          <TabsTrigger value="receipts">Recebimentos</TabsTrigger>
          <TabsTrigger value="plans">Vínculo de planos</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="pt-4">
          <CaktoCredentialsForm scope="platform" webhookUrl={webhookUrl} />
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4 pt-4">
          <CaktoSummaryCards scope="platform" />
          <CaktoOrdersTable scope="platform" />
        </TabsContent>

        <TabsContent value="plans" className="pt-4">
          <CaktoPlanMapping />
        </TabsContent>
      </Tabs>
    </div>
  );
}
