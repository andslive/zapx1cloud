import { useMemo, useState } from 'react';
import { Network, ArrowUp, ArrowDown, ChevronsUpDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInstanceColorClasses } from '@/lib/instanceColors';
import { FUNIL_NAO_IDENTIFICADO, type SaleHistoryRow } from '@/hooks/useCommercialDashboard';

interface Props {
  history: SaleHistoryRow[];
  leadsByInstance: Map<string, number>;
}

interface SummaryRow {
  key: string;
  instanceId: string | null;
  instanceName: string;
  offerLabel: string;
  leads: number | null; // null => "—" (leads já contados em outra linha da mesma instância)
  sales: number;
  revenue: number;
}

type SortColumn = 'instanceName' | 'offerLabel' | 'leads' | 'sales' | 'conversion' | 'leadPerSale' | 'ticket' | 'revenue';
type SortDirection = 'asc' | 'desc';
type HidableColumn = 'offerLabel' | 'leads' | 'sales' | 'conversion' | 'leadPerSale' | 'ticket' | 'revenue';
type HiddenColumnsState = Partial<Record<HidableColumn, boolean>>;

const HIDDEN_COLUMNS_STORAGE_KEY = 'dashboard-summary-hidden-columns';
const MASK = '••••';

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const COLUMNS: { key: SortColumn; label: string; align: 'left' | 'right'; hidable: boolean }[] = [
  { key: 'instanceName', label: 'Instância', align: 'left', hidable: false },
  { key: 'offerLabel', label: 'Oferta / Funil', align: 'left', hidable: true },
  { key: 'leads', label: 'Leads', align: 'right', hidable: true },
  { key: 'sales', label: 'Nº Vendas', align: 'right', hidable: true },
  { key: 'conversion', label: '% Venda', align: 'right', hidable: true },
  { key: 'leadPerSale', label: 'Lead/Venda', align: 'right', hidable: true },
  { key: 'ticket', label: 'Ticket Médio', align: 'right', hidable: true },
  { key: 'revenue', label: 'Vendas', align: 'right', hidable: true },
];

function loadHiddenColumns(): HiddenColumnsState {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveHiddenColumns(state: HiddenColumnsState) {
  try {
    localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponível (ex.: modo privado) — apenas não persiste entre sessões.
  }
}

/**
 * Agrupa o Histórico de Vendas já carregado (dedup + edições aplicadas) por
 * instância + oferta/funil. Não recalcula Receita/Vendas: soma exatamente o
 * que já está em `history`.
 *
 * Leads não tem granularidade por funil (o vínculo lead→funil só existe a
 * partir de `lead_funnel_history`, cobertura parcial, e apenas para quem
 * comprou) — por isso o total de leads da instância é atribuído só à linha
 * de maior volume de vendas daquela instância; funis adicionais da mesma
 * instância mostram "—" em Leads/%Venda/Lead-Venda para não contar o mesmo
 * lead duas vezes no Total Geral.
 */
function buildSummaryRows(history: SaleHistoryRow[], leadsByInstance: Map<string, number>): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const r of history) {
    const key = `${r.instanceId ?? 'none'}__${r.offerLabel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        instanceId: r.instanceId,
        instanceName: r.instanceId ? r.instanceName : 'Sem instância',
        offerLabel: r.offerLabel || FUNIL_NAO_IDENTIFICADO,
        leads: null,
        sales: 0,
        revenue: 0,
      });
    }
    const g = groups.get(key)!;
    g.sales += 1;
    g.revenue += r.purchaseValue;
  }

  // Atribui Leads da instância à linha de maior volume de vendas daquela instância.
  const byInstance = new Map<string, SummaryRow[]>();
  for (const g of groups.values()) {
    const ik = g.instanceId ?? 'none';
    if (!byInstance.has(ik)) byInstance.set(ik, []);
    byInstance.get(ik)!.push(g);
  }
  for (const [ik, rows] of byInstance) {
    const leads = leadsByInstance.get(ik) ?? 0;
    const top = rows.reduce((best, r) => (r.sales > best.sales ? r : best), rows[0]);
    top.leads = leads;
  }

  return Array.from(groups.values());
}

function metricValue(row: SummaryRow, column: SortColumn): number | string | null {
  switch (column) {
    case 'instanceName':
      return row.instanceName;
    case 'offerLabel':
      return row.offerLabel;
    case 'leads':
      return row.leads;
    case 'sales':
      return row.sales;
    case 'conversion':
      return row.leads !== null && row.leads > 0 ? (row.sales / row.leads) * 100 : null;
    case 'leadPerSale':
      return row.leads !== null && row.sales > 0 ? row.leads / row.sales : null;
    case 'ticket':
      return row.sales > 0 ? row.revenue / row.sales : 0;
    case 'revenue':
      return row.revenue;
    default:
      return null;
  }
}

/** null/"—" sempre no final, independente da direção — a ordenação usa sempre o valor real, nunca a máscara de exibição. */
function sortRows(rows: SummaryRow[], column: SortColumn, direction: SortDirection): SummaryRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = metricValue(a, column);
    const vb = metricValue(b, column);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, 'pt-BR') * sign;
    }
    return ((va as number) - (vb as number)) * sign;
  });
}

export function SalesSummaryTable({ history, leadsByInstance }: Props) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [hiddenColumns, setHiddenColumns] = useState<HiddenColumnsState>(() => loadHiddenColumns());

  const rows = useMemo(() => buildSummaryRows(history, leadsByInstance), [history, leadsByInstance]);
  const sortedRows = useMemo(() => sortRows(rows, sortColumn, sortDirection), [rows, sortColumn, sortDirection]);

  const totals = useMemo(() => {
    const totalLeads = Array.from(leadsByInstance.values()).reduce((acc, n) => acc + n, 0);
    const totalSales = history.length;
    const totalRevenue = history.reduce((acc, r) => acc + r.purchaseValue, 0);
    return { totalLeads, totalSales, totalRevenue };
  }, [history, leadsByInstance]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-6 text-center">Nenhuma venda no período/filtros selecionados.</p>;
  }

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleColumnVisibility = (column: HidableColumn) => {
    setHiddenColumns((prev) => {
      const next = { ...prev, [column]: !prev[column] };
      saveHiddenColumns(next);
      return next;
    });
  };

  const isHidden = (column: HidableColumn) => !!hiddenColumns[column];
  const cell = (column: HidableColumn, content: string) => (isHidden(column) ? MASK : content);

  const totalConversion = totals.totalLeads > 0 ? (totals.totalSales / totals.totalLeads) * 100 : 0;
  const totalLeadPerSale = totals.totalSales > 0 ? totals.totalLeads / totals.totalSales : null;
  const totalTicket = totals.totalSales > 0 ? totals.totalRevenue / totals.totalSales : 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((col) => {
              const active = sortColumn === col.key;
              const ariaSort: 'ascending' | 'descending' | 'none' = active
                ? (sortDirection === 'asc' ? 'ascending' : 'descending')
                : 'none';
              const hidden = col.hidable && isHidden(col.key as HidableColumn);
              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort}
                  className={cn('px-4 py-3 whitespace-nowrap font-semibold text-muted-foreground', col.align === 'right' ? 'text-right' : 'text-left')}
                >
                  <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      title={active ? (sortDirection === 'asc' ? 'Ordenar decrescente' : 'Ordenar crescente') : 'Ordenar crescente'}
                      aria-label={`Ordenar por ${col.label}`}
                      className={cn(
                        'inline-flex items-center gap-1 cursor-pointer select-none rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'text-foreground',
                      )}
                    >
                      <span>{col.label}</span>
                      {active ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />
                      )}
                    </button>
                    {col.hidable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumnVisibility(col.key as HidableColumn);
                        }}
                        title={hidden ? 'Mostrar coluna' : 'Ocultar coluna'}
                        aria-label={hidden ? `Mostrar coluna ${col.label}` : `Ocultar coluna ${col.label}`}
                        className="cursor-pointer rounded-sm opacity-60 transition-colors hover:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => {
            const colors = getInstanceColorClasses(r.instanceName);
            const conversion = r.leads !== null && r.leads > 0 ? (r.sales / r.leads) * 100 : null;
            const leadPerSale = r.leads !== null && r.sales > 0 ? r.leads / r.sales : null;
            const ticket = r.sales > 0 ? r.revenue / r.sales : 0;
            return (
              <tr
                key={r.key}
                className={cn('border-b border-border/60 last:border-b-0 border-l-4 transition-colors hover:brightness-125', colors.border, colors.bg)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 font-medium text-foreground">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', colors.dot)} />
                    {r.instanceName}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cell('offerLabel', r.offerLabel)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {cell('leads', r.leads === null ? '—' : formatNumber(r.leads))}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{cell('sales', formatNumber(r.sales))}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-emerald-400">
                  {cell('conversion', conversion === null ? '—' : `${conversion.toFixed(2)}%`)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {cell('leadPerSale', leadPerSale === null ? '—' : leadPerSale.toFixed(1))}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{cell('ticket', formatBRL(ticket))}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-emerald-400">
                  {cell('revenue', formatBRL(r.revenue))}
                </td>
              </tr>
            );
          })}
          <tr className="bg-secondary/50 font-bold">
            <td className="px-4 py-3 whitespace-nowrap">
              <span className="inline-flex items-center gap-2 text-foreground">
                <Network className="h-4 w-4 text-primary" />
                TOTAL GERAL
              </span>
            </td>
            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cell('offerLabel', '—')}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">{cell('leads', formatNumber(totals.totalLeads))}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">{cell('sales', formatNumber(totals.totalSales))}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap text-emerald-400">
              {cell('conversion', `${totalConversion.toFixed(2)}%`)}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              {cell('leadPerSale', totalLeadPerSale === null ? '—' : totalLeadPerSale.toFixed(1))}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">{cell('ticket', formatBRL(totalTicket))}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap text-emerald-400">
              {cell('revenue', formatBRL(totals.totalRevenue))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
