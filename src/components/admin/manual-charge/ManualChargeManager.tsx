import { useMemo } from 'react';
import { useManualChargeDispatches } from '@/hooks/useManualChargeDispatches';
import { ManualChargeTable } from './ManualChargeTable';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';

// Página "Cobrança" -- reusa o layout Card/Table dos demais painéis do dashboard, sem CSS novo.
// Nesta entrega é uma tela de REVISÃO: nada aqui envia mensagem, e nenhum registro está liberado.
export function ManualChargeManager() {
  const { data, isLoading, isError, error } = useManualChargeDispatches();
  const queryClient = useQueryClient();
  const rows = useMemo(() => data ?? [], [data]);

  const summary = useMemo(() => ({
    total: rows.length,
    review: rows.filter((r) => r.status === 'eligible' && r.review_reason !== null).length,
    voluntary: rows.filter((r) => r.charge_kind === 'voluntary_contribution_reminder').length,
    debt: rows.filter((r) => r.charge_kind === 'debt_reminder').length,
    ambiguous: rows.filter((r) => r.scheduling_status === 'blocked_ambiguous_order').length,
    unblocked: rows.filter((r) => r.review_reason === null).length,
  }), [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-sm">
            <span className="font-medium">Carga de setembro em revisão.</span>{' '}
            <span className="text-muted-foreground">
              Os compromissos abaixo foram identificados por regra automática (provisória) e ainda não foram confirmados.
              Nenhum envio está liberado e nenhuma mensagem é enviada por esta tela.
            </span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div><div className="text-2xl font-semibold">{summary.total}</div><div className="text-xs text-muted-foreground">registros</div></div>
            <div><div className="text-2xl font-semibold">{summary.debt}</div><div className="text-xs text-muted-foreground">dívidas (prováveis)</div></div>
            <div><div className="text-2xl font-semibold">{summary.voluntary}</div><div className="text-xs text-muted-foreground">contribuições voluntárias</div></div>
            <div><div className="text-2xl font-semibold">{summary.ambiguous}</div><div className="text-xs text-muted-foreground">com datas divergentes</div></div>
            <div><div className="text-2xl font-semibold">{summary.unblocked}</div><div className="text-xs text-muted-foreground">liberados para envio</div></div>
          </div>
        </CardContent>
      </Card>
      {isError && (
        <Card><CardContent className="py-4 text-sm text-destructive">Não foi possível carregar a cobrança: {error instanceof Error ? error.message : 'erro desconhecido'}.</CardContent></Card>
      )}
      <ManualChargeTable
        rows={rows}
        isLoading={isLoading}
        onManualTriggered={() => queryClient.invalidateQueries({ queryKey: ['manual-charge-dispatches-panel'] })}
      />
    </div>
  );
}
