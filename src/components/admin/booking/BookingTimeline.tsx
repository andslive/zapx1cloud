import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2, MailCheck, MessageCircle, RotateCcw, XCircle,
  AlertCircle, Activity, Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props { bookingId: string }

interface Entry {
  id: string;
  ts: string;
  kind: "log" | "status";
  type: string;
  channel?: string | null;
  payload?: any;
  error?: string | null;
  status?: string;
  notes?: string | null;
}

const ICON: Record<string, any> = {
  confirmation_sent: MailCheck,
  reminder_sent: MessageCircle,
  recovery_sent: RotateCcw,
  reply_received: Inbox,
  notification_sent: Activity,
  status_changed: CheckCircle2,
  send_failed: AlertCircle,
};

const LABEL: Record<string, string> = {
  confirmation_sent: "Confirmação enviada",
  reminder_sent: "Lembrete enviado",
  recovery_sent: "Recuperação enviada",
  reply_received: "Resposta do lead",
  notification_sent: "Notificação interna",
  status_changed: "Status alterado",
  send_failed: "Falha no envio",
};

export function BookingTimeline({ bookingId }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [logsRes, histRes] = await Promise.all([
        supabase.from("booking_logs").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }),
        supabase.from("booking_status_history").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }),
      ]);
      if (!mounted) return;
      const merged: Entry[] = [
        ...(logsRes.data || []).map((l: any) => ({
          id: `l-${l.id}`, ts: l.created_at, kind: "log" as const,
          type: l.type, channel: l.channel, payload: l.payload, error: l.error,
        })),
        ...(histRes.data || []).map((h: any) => ({
          id: `h-${h.id}`, ts: h.created_at, kind: "status" as const,
          type: "status_changed", status: h.to_status, notes: h.notes,
        })),
      ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      setEntries(merged);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [bookingId]);

  if (loading) return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  if (entries.length === 0) return <div className="text-sm text-muted-foreground p-4">Sem eventos ainda.</div>;

  return (
    <ScrollArea className="max-h-96">
      <div className="space-y-3 p-1">
        {entries.map((e) => {
          const Icon = ICON[e.type] || Activity;
          const failed = e.type === "send_failed" || !!e.error;
          return (
            <div key={e.id} className="flex gap-3 items-start group">
              <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center border ${
                failed ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                       : "bg-primary/10 text-primary border-primary/20"
              }`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {LABEL[e.type] || e.type}
                  {e.kind === "status" && e.status ? <span className="text-muted-foreground font-normal"> → {e.status}</span> : null}
                  {e.channel ? <span className="ml-2 text-xs text-muted-foreground">via {e.channel}</span> : null}
                </div>
                {e.error && <div className="text-xs text-rose-400 mt-0.5">{e.error}</div>}
                {e.payload?.text && <div className="text-xs text-muted-foreground mt-0.5 truncate">"{e.payload.text}"</div>}
                <div className="text-xs text-muted-foreground/70 mt-0.5">
                  {formatDistanceToNow(new Date(e.ts), { addSuffix: true, locale: ptBR })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
