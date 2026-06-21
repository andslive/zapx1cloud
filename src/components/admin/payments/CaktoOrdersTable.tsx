import { useState } from 'react';
import type { CaktoScope } from '@/hooks/useCaktoCredentials';
import { useCaktoOrders, useSyncCaktoOrders } from '@/hooks/useCaktoOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PaymentMethodBadge } from './PaymentMethodBadge';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  paid: { label: 'Pago', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  refunded: { label: 'Reembolsado', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending: { label: 'Pendente', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  waiting_payment: { label: 'Aguardando', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  chargeback: { label: 'Chargeback', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

interface Props {
  scope: CaktoScope;
  provider?: 'cakto' | 'doppus' | 'hotmart' | 'kiwify' | 'manual' | 'all';
  hideSync?: boolean;
}

const PROVIDER_META: Record<string, { label: string; className: string }> = {
  cakto: { label: 'Cakto', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  doppus: { label: 'Doppus', className: 'bg-violet-500/10 text-violet-700 border-violet-500/20' },
  hotmart: { label: 'Hotmart', className: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  kiwify: { label: 'Kiwify', className: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  manual: { label: 'Manual', className: 'bg-muted text-muted-foreground border-border' },
};

export function CaktoOrdersTable({ scope, provider = 'all', hideSync }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const { data: orders, isLoading } = useCaktoOrders(scope, { search, status, provider });
  const sync = useSyncCaktoOrders(scope);

  const handleSync = async () => {
    try {
      const r = await sync.mutateAsync();
      toast.success(`${r.synced} pedidos sincronizados`);
    } catch (e: any) {
      toast.error(e.message ?? 'Erro');
    }
  };

  const fmtBRL = (v: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Pedidos</CardTitle>
          {!hideSync && (
            <Button onClick={handleSync} disabled={sync.isPending} size="sm" variant="outline">
              {sync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar Cakto
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, ref, produto…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="waiting_payment">Aguardando</SelectItem>
              <SelectItem value="refunded">Reembolsado</SelectItem>
              <SelectItem value="chargeback">Chargeback</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && (orders?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhum pedido encontrado.</TableCell></TableRow>
              )}
              {orders?.map((o) => {
                const meta = STATUS_LABELS[o.status] ?? { label: o.status, className: 'bg-muted text-muted-foreground' };
                const date = o.paid_at ?? o.created_at_cakto;
                const provMeta = PROVIDER_META[o.provider] ?? PROVIDER_META.manual;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {date ? format(new Date(date), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={provMeta.className}>{provMeta.label}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{o.customer_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{o.customer_email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{o.product_name ?? '—'}</TableCell>
                    <TableCell><PaymentMethodBadge method={o.payment_method} /></TableCell>
                    <TableCell className="text-right font-medium">{fmtBRL(o.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{o.cakto_ref_id ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
