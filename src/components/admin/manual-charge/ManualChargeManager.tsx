import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ManualChargeFilters, useManualChargePage, useManualChargeSummary,
} from '@/hooks/useManualChargeDispatches';
import { ManualChargeTable } from './ManualChargeTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Página "Cobrança" -- reusa o layout Card/Table dos demais painéis do dashboard, sem CSS novo.
// Nesta entrega é uma tela de REVISÃO: nada aqui envia mensagem, e nenhum registro está liberado.
export function ManualChargeManager() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ManualChargeFilters>({ search: '', kind: 'all', status: 'all', page: 1 });
  const [searchInput, setSearchInput] = useState('');

  // Busca com atraso: uma consulta por pausa de digitação, não por tecla.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const page = useManualChargePage(filters);
  const summary = useManualChargeSummary();
  const s = summary.data;
  const tile = (value: number | undefined) => (value === undefined ? '—' : value);

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
            <div><div className="text-2xl font-semibold">{tile(s?.total)}</div><div className="text-xs text-muted-foreground">registros</div></div>
            <div><div className="text-2xl font-semibold">{tile(s?.debt)}</div><div className="text-xs text-muted-foreground">dívidas (prováveis)</div></div>
            <div><div className="text-2xl font-semibold">{tile(s?.voluntary)}</div><div className="text-xs text-muted-foreground">contribuições voluntárias</div></div>
            <div><div className="text-2xl font-semibold">{tile(s?.ambiguous)}</div><div className="text-xs text-muted-foreground">com datas divergentes</div></div>
            <div><div className="text-2xl font-semibold">{tile(s?.unblocked)}</div><div className="text-xs text-muted-foreground">liberados para envio</div></div>
          </div>
          {summary.isError && (
            <p className="text-xs text-destructive">Totais indisponíveis no momento.</p>
          )}
        </CardContent>
      </Card>

      {page.isError && !page.data ? (
        <Card>
          <CardContent className="py-6 space-y-3" role="alert">
            <p className="text-sm font-medium">Dados indisponíveis</p>
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar a cobrança agora ({page.error instanceof Error ? page.error.message : 'erro desconhecido'}).
              Isto não significa que não haja registros.
            </p>
            <Button variant="outline" size="sm" onClick={() => { void page.refetch(); void summary.refetch(); }} disabled={page.isFetching}>
              {page.isFetching ? 'Tentando…' : 'Tentar novamente'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ManualChargeTable
          rows={page.data?.rows ?? []}
          total={page.data?.total ?? 0}
          isLoading={page.isLoading}
          isFetching={page.isFetching && !page.isLoading}
          filters={filters}
          searchInput={searchInput}
          onSearchInput={setSearchInput}
          onFiltersChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onManualTriggered={() => queryClient.invalidateQueries({ queryKey: ['manual-charge-dispatches-panel'] })}
        />
      )}
    </div>
  );
}
