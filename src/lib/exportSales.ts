import * as XLSX from 'xlsx';
import type { SaleHistoryRow } from '@/hooks/useCommercialDashboard';

const HEADERS = [
  'Data', 'Instância', 'Número da instância', 'Número do lead', 'Cliente',
  'Oferta/Funil', 'Valor', 'Moeda', 'Origem', 'Tipo', 'Editado',
];

function toRows(rows: SaleHistoryRow[]): (string | number)[][] {
  return rows.map((r) => [
    new Date(r.date).toLocaleString('pt-BR'),
    r.instanceName,
    r.instanceNumber || '',
    r.leadPhone || '',
    r.customerName,
    r.offerLabel,
    r.purchaseValue,
    r.currency,
    r.sourceLabel,
    r.origin === 'manual' ? 'Manual' : 'Automática',
    r.edited ? 'Sim' : 'Não',
  ]);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportSalesToCsv(rows: SaleHistoryRow[], filename = 'historico-vendas.csv') {
  const lines = [HEADERS, ...toRows(rows)]
    .map((line) => line.map(csvEscape).join(';'))
    .join('\n');
  const blob = new Blob([`﻿${lines}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSalesToXlsx(rows: SaleHistoryRow[], filename = 'historico-vendas.xlsx') {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...toRows(rows)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Vendas');
  XLSX.writeFile(workbook, filename);
}
