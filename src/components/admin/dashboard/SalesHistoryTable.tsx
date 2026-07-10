import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Pencil, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SaleHistoryRow } from '@/hooks/useCommercialDashboard';

const PAGE_SIZE = 20;

const formatBRL = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);

type HidableColumn = 'date' | 'instance' | 'instanceNumber' | 'leadNumber' | 'customer' | 'offer' | 'value' | 'currency' | 'source';
type HiddenColumnsState = Partial<Record<HidableColumn, boolean>>;

const HIDDEN_COLUMNS_STORAGE_KEY = 'dashboard-history-hidden-columns';
const MASK = '••••';

const COLUMNS: { key: HidableColumn; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Data' },
  { key: 'instance', label: 'Instância' },
  { key: 'instanceNumber', label: 'Número da instância' },
  { key: 'leadNumber', label: 'Número do lead' },
  { key: 'customer', label: 'Cliente' },
  { key: 'offer', label: 'Oferta/Funil' },
  { key: 'value', label: 'Valor' },
  { key: 'currency', label: 'Moeda' },
  { key: 'source', label: 'Origem' },
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

interface Props {
  rows: SaleHistoryRow[];
  onEdit: (row: SaleHistoryRow) => void;
}

export function SalesHistoryTable({ rows, onEdit }: Props) {
  const [page, setPage] = useState(1);
  const [hiddenColumns, setHiddenColumns] = useState<HiddenColumnsState>(() => loadHiddenColumns());

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-6 text-center">Nenhuma venda no período/filtros selecionados.</p>;
  }

  const toggleColumnVisibility = (column: HidableColumn) => {
    setHiddenColumns((prev) => {
      const next = { ...prev, [column]: !prev[column] };
      saveHiddenColumns(next);
      return next;
    });
  };

  const isHidden = (column: HidableColumn) => !!hiddenColumns[column];
  const cell = (column: HidableColumn, content: string) => (isHidden(column) ? MASK : content);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => {
                const hidden = isHidden(col.key);
                return (
                  <TableHead key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                    <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                      <span>{col.label}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumnVisibility(col.key);
                        }}
                        title={hidden ? 'Mostrar coluna' : 'Ocultar coluna'}
                        aria-label={hidden ? `Mostrar coluna ${col.label}` : `Ocultar coluna ${col.label}`}
                        className="cursor-pointer rounded-sm opacity-60 transition-colors hover:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  </TableHead>
                );
              })}
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => (
              <TableRow key={`${r.origin}-${r.id}`}>
                <TableCell className="whitespace-nowrap text-sm">
                  {cell('date', new Date(r.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}
                </TableCell>
                <TableCell className="text-sm">{cell('instance', r.instanceName)}</TableCell>
                <TableCell className="text-sm">{cell('instanceNumber', r.instanceNumber || '—')}</TableCell>
                <TableCell className="text-sm">{cell('leadNumber', r.leadPhone || '—')}</TableCell>
                <TableCell className="text-sm">{cell('customer', r.customerName)}</TableCell>
                <TableCell className="text-sm">{cell('offer', r.offerLabel)}</TableCell>
                <TableCell className="text-sm font-medium">{cell('value', formatBRL(r.purchaseValue, r.currency))}</TableCell>
                <TableCell className="text-sm">{cell('currency', r.currency)}</TableCell>
                <TableCell className="text-sm">
                  {isHidden('source') ? (
                    MASK
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Badge variant={r.origin === 'manual' ? 'secondary' : 'outline'} className="text-[10px]">
                        {r.origin === 'manual' ? 'Manual' : 'Automática'}
                      </Badge>
                      {r.edited && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">Editado</Badge>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(r)} title="Editar venda">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive>{page}</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <span className="text-xs text-muted-foreground px-2">de {totalPages}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
