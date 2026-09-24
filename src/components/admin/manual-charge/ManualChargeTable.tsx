import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ManualChargeDispatchRow } from '@/hooks/useManualChargeDispatches';
import { ManualChargeTriggerButton } from './ManualChargeTriggerButton';

// Nesta entrega o disparo manual NÃO está liberado para ninguém, mesmo que a linha, no futuro, deixe de estar em revisão.
const MANUAL_TRIGGER_ENABLED = false;
// A partir desta data (regra aprovada) promessas vencidas antes dela ficam com regra pendente.
const PROMISE_FLOOR = '2026-09-29';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  eligible: { label: 'Elegível (interno)', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  sending: { label: 'Enviando', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  sent: { label: 'Enviado', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  paid: { label: 'Pago', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  cancelled_permanent: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
  hold_human: { label: 'Atendimento humano', className: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  hold_suppression_review: { label: 'Recusa em revisão', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  needs_review_suppression: { label: 'Recusa em revisão', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  needs_review_payment_claim: { label: 'Pagamento em verificação', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  needs_review_integrity: { label: 'Inconsistência — revisar', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  needs_review_human_state: { label: 'Estado inconsistente', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  hold_receipt_review: { label: 'Comprovante em análise', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  needs_review_receipt: { label: 'Comprovante rejeitado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  failed: { label: 'Falhou', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  unknown_result: { label: 'Resultado desconhecido', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const IN_REVIEW = { label: 'Em revisão', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };

const SCHEDULING_LABELS: Record<string, string> = {
  unscheduled: 'Não agendado',
  blocked_no_connection: 'Sem conexão vinculada',
  blocked_no_timezone: 'Sem fuso do lead',
  blocked_timezone_uncertain: 'Fuso incerto — confirmar com o lead',
  blocked_capacity: 'Capacidade esgotada no dia combinado',
  blocked_overdue_promise_pending_rule: 'Promessa vencida — regra pendente',
  blocked_ambiguous_order: 'Datas divergentes — ordem ambígua',
  blocked_missed_window: 'Horário perdido — reagendar',
};

const REVIEW_LABELS: Record<string, string> = {
  provisional_or_pending_classification: 'Classificação provisória (regex), ainda não confirmada',
  untranscribed_media: 'Áudio/mídia sem transcrição',
  edited_message_not_reclassified: 'Mensagem editada — reavaliar',
  commitment_already_contacted_other_campaign: 'Compromisso já cobrado em outra campanha',
};

const TIMEZONE_SOURCE_LABELS: Record<string, string> = {
  explicit: 'informado',
  phone_area_code: 'DDD — inferido, confirmar',
  country_single_timezone: 'país — inferido, confirmar',
  conversation_detected: 'incerto',
  country_hint: 'incerto',
};

const LOCALE_SOURCE_LABELS: Record<string, string> = {
  explicit: 'informado',
  conversation_detected: 'conversa',
};

const PAYMENT_CLAIM_LABELS: Record<string, string> = {
  pending_reconciliation: 'em conferência',
  confirmed: 'confirmado',
  rejected: 'não confirmado',
};

// 'YYYY-MM-DD' vindo do banco é uma data de calendário: não passa por Date (UTC) para não recuar um dia no Brasil.
function fmtDateOnly(value: string | null) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '—';
}

function fmtDateTime(value: string | null) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd/MM/yy HH:mm', { locale: ptBR });
  } catch {
    return '—';
  }
}

// Linha "em revisão": status interno elegível, mas com motivo de bloqueio (nunca apresentado como liberado).
function isInReview(r: ManualChargeDispatchRow) {
  return r.status === 'eligible' && r.review_reason !== null;
}

function promiseInfo(r: ManualChargeDispatchRow): { main: string; sub?: string } {
  if (r.scheduling_status === 'blocked_ambiguous_order') {
    return { main: 'Mais de uma data prometida', sub: 'Ordem das mensagens ambígua — decidir manualmente' };
  }
  if (r.is_refused) return { main: 'Recusa registrada', sub: r.refused_reason ?? undefined };
  const date = r.agreed_date ?? r.effective_promised_date;
  if (!date) return { main: '—', sub: 'Sem data informada' };
  if (r.promised_date_precision === 'flexible_period_start') {
    return { main: fmtDateOnly(date), sub: 'Período flexível ("final do mês"), a partir desta data' };
  }
  if (date < PROMISE_FLOOR) return { main: fmtDateOnly(date), sub: 'Anterior a 29/09 — regra pendente' };
  return { main: fmtDateOnly(date) };
}

interface Props {
  rows: ManualChargeDispatchRow[];
  isLoading?: boolean;
  onManualTriggered?: () => void;
}

const PAGE_SIZE = 20;

export function ManualChargeTable({ rows, isLoading, onManualTriggered }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status === 'review' ? !isInReview(r) : status !== 'all' && r.status !== status) return false;
      if (kind !== 'all' && r.charge_kind !== kind) return false;
      if (search) {
        const s = search.toLowerCase();
        const haystack = `${r.lead_name ?? ''} ${r.phone_normalized ?? ''} ${r.campaign_key}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, status, kind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Cobrança</CardTitle>
          <span className="text-xs text-muted-foreground">{filtered.length} de {rows.length} registros</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar lead, telefone, campanha…" className="pl-9" />
          </div>
          <Select value={kind} onValueChange={(v) => { setKind(v); setPage(1); }}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="debt_reminder">Dívida (provável)</SelectItem>
              <SelectItem value="voluntary_contribution_reminder">Contribuição voluntária</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="review">Em revisão</SelectItem>
              <SelectItem value="hold_receipt_review">Comprovante em análise</SelectItem>
              <SelectItem value="hold_human">Atendimento humano</SelectItem>
              <SelectItem value="hold_suppression_review">Recusa em revisão</SelectItem>
              <SelectItem value="needs_review_payment_claim">Pagamento em verificação</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="cancelled_permanent">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Promessa / data</TableHead>
                <TableHead>Situação e bloqueio</TableHead>
                <TableHead>Conexão</TableHead>
                <TableHead>Idioma / fuso</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Nenhuma cobrança encontrada. Esta área é visível apenas para administradores e gerentes da organização.
                  </TableCell>
                </TableRow>
              )}
              {paged.map((r) => {
                const inReview = isInReview(r);
                const statusMeta = inReview
                  ? IN_REVIEW
                  : STATUS_LABELS[r.status] ?? { label: r.status, className: 'bg-muted text-muted-foreground border-border' };
                const isVoluntary = r.charge_kind === 'voluntary_contribution_reminder';
                const provisional = r.review_reason !== null;
                const promise = promiseInfo(r);
                const schedulingLabel = SCHEDULING_LABELS[r.scheduling_status];
                return (
                  <TableRow key={r.dispatch_id}>
                    <TableCell>
                      <div className="font-medium text-sm truncate max-w-[180px]" title={r.lead_name ?? undefined}>{r.lead_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.phone_normalized}</div>
                    </TableCell>
                    <TableCell>
                      {isVoluntary ? (
                        <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 text-xs">Contribuição voluntária</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/20 text-xs">Dívida</Badge>
                      )}
                      {provisional && <div className="text-xs text-muted-foreground mt-1">provável — classificação por regex</div>}
                      {r.reopen_count > 0 && (
                        <div className="text-xs text-blue-600 mt-1">Nova data após envio{r.reopen_count > 1 ? ` (${r.reopen_count})` : ''}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="text-sm">{promise.main}</div>
                      {promise.sub && <div className="text-muted-foreground max-w-[220px]">{promise.sub}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
                      {r.review_reason && (
                        <div className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                          Bloqueio: {REVIEW_LABELS[r.review_reason] ?? r.review_reason}
                        </div>
                      )}
                      {schedulingLabel && r.status !== 'sent' && (
                        <div className="text-xs text-muted-foreground">{schedulingLabel}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.connection_name ?? '—'}</div>
                      {r.connection_provider === 'meta_cloud' && (
                        <div className="text-xs text-muted-foreground">API oficial</div>
                      )}
                      {r.connection_status && (
                        <Badge variant="outline" className={r.connection_status === 'connected' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs' : 'bg-destructive/10 text-destructive border-destructive/20 text-xs'}>
                          {r.connection_status === 'connected' ? 'Conectada' : 'Indisponível'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="text-sm">
                        {r.lead_preferred_locale ?? '—'}
                        {r.lead_locale_source && (
                          <span className="text-muted-foreground"> ({LOCALE_SOURCE_LABELS[r.lead_locale_source] ?? r.lead_locale_source})</span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate max-w-[160px]" title={r.lead_preferred_timezone ?? undefined}>
                        {r.lead_preferred_timezone
                          ? `${r.lead_preferred_timezone.split('/').pop()?.replace(/_/g, ' ')} · ${TIMEZONE_SOURCE_LABELS[r.lead_timezone_source ?? ''] ?? 'incerto'}`
                          : 'Fuso desconhecido'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.payment_confirmed ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Confirmado</Badge>
                      ) : r.is_payment_claimed ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Alegado ({PAYMENT_CLAIM_LABELS[r.payment_claim_status ?? ''] ?? 'em conferência'})</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {r.sent_at && <div className="text-xs text-muted-foreground mt-1">Enviado {fmtDateTime(r.sent_at)}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <ManualChargeTriggerButton
                        dispatchId={r.dispatch_id}
                        disabled={!MANUAL_TRIGGER_ENABLED || r.review_reason !== null}
                        leadName={r.lead_name ?? '—'}
                        messagePreview={`${isVoluntary ? 'Contribuição' : 'Pagamento'}: ${promise.main}`}
                        connectionName={r.connection_name ?? undefined}
                        onTriggered={onManualTriggered}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <Pagination className="mt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink isActive={p === page} onClick={() => setPage(p)} className="cursor-pointer">
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>
    </Card>
  );
}
