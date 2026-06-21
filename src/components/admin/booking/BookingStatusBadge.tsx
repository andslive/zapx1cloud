import { Badge } from "@/components/ui/badge";
import {
  Calendar, CheckCircle2, Clock, MailCheck, MessageCircle,
  RotateCcw, XCircle, AlertCircle, Award,
} from "lucide-react";

export type BookingStatus =
  | "pending" | "confirmed" | "cancelled" | "completed"
  | "agendado" | "confirmacao_enviada" | "confirmado"
  | "lembrete_enviado" | "reagendamento_solicitado"
  | "cancelado" | "no_show" | "concluido";

const MAP: Record<BookingStatus, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending:                  { label: "Pendente",          cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Clock },
  agendado:                 { label: "Agendado",          cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",     Icon: Calendar },
  confirmed:                { label: "Confirmado",        cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  confirmacao_enviada:      { label: "Confirmação enviada", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",       Icon: MailCheck },
  confirmado:               { label: "Confirmado pelo lead", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  lembrete_enviado:         { label: "Lembrete enviado",  cls: "bg-violet-500/15 text-violet-400 border-violet-500/30", Icon: MessageCircle },
  reagendamento_solicitado: { label: "Reagendar",         cls: "bg-orange-500/15 text-orange-400 border-orange-500/30", Icon: RotateCcw },
  cancelled:                { label: "Cancelado",         cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",     Icon: XCircle },
  cancelado:                { label: "Cancelado",         cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",     Icon: XCircle },
  no_show:                  { label: "No-show",           cls: "bg-red-500/15 text-red-400 border-red-500/30",        Icon: AlertCircle },
  completed:                { label: "Realizado",         cls: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30", Icon: Award },
  concluido:                { label: "Realizado",         cls: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30", Icon: Award },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as BookingStatus] || MAP.pending;
  const { label, cls, Icon } = cfg;
  return (
    <Badge variant="outline" className={`gap-1 ${cls} font-medium`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
