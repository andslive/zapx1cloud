import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Pencil } from 'lucide-react';
import type { SaleHistoryRow } from '@/hooks/useCommercialDashboard';

const PAGE_SIZE = 20;

const formatBRL = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);

interface Props {
  rows: SaleHistoryRow[];
  onEdit: (row: SaleHistoryRow) => void;
}

export function SalesHistoryTable({ rows, onEdit }: Props) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-6 text-center">Nenhuma venda no período/filtros selecionados.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Número da instância</TableHead>
              <TableHead>Número do lead</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Oferta/Funil</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Moeda</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => (
              <TableRow key={`${r.origin}-${r.id}`}>
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(r.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </TableCell>
                <TableCell className="text-sm">{r.instanceName}</TableCell>
                <TableCell className="text-sm">{r.instanceNumber || '—'}</TableCell>
                <TableCell className="text-sm">{r.leadPhone || '—'}</TableCell>
                <TableCell className="text-sm">{r.customerName}</TableCell>
                <TableCell className="text-sm">{r.offerLabel}</TableCell>
                <TableCell className="text-sm font-medium">{formatBRL(r.purchaseValue, r.currency)}</TableCell>
                <TableCell className="text-sm">{r.currency}</TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={r.origin === 'manual' ? 'secondary' : 'outline'} className="text-[10px]">
                      {r.origin === 'manual' ? 'Manual' : 'Automática'}
                    </Badge>
                    {r.edited && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">Editado</Badge>}
                  </div>
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
