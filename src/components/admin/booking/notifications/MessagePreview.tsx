import { renderTemplate } from '@/hooks/useBookingNotifications';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';

interface Props {
  template: string;
  whatsappNumber?: string | null;
}

const SAMPLE = {
  nome_lead: 'Guilherme',
  nome_vendedor: 'Endrix Keison',
  email_lead: 'guilherme@exemplo.com',
  telefone_lead: '(61) 99999-9999',
  data: '13/05/2026',
  hora: '16:00',
  modalidade: 'online',
  nome_evento: 'Reunião comercial',
  link_reuniao: 'https://meet.google.com/abc-defg-hij',
  empresa: 'X1ZAP',
};

export function MessagePreview({ template, whatsappNumber }: Props) {
  const rendered = renderTemplate(template || '', SAMPLE);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Preview da mensagem</h4>
        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
          <MessageCircle className="h-3 w-3 mr-1" />
          WhatsApp
        </Badge>
      </div>

      <div className="rounded-2xl bg-[#0b1418] border border-emerald-900/40 p-4 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="relative bg-[#005c4b]/20 border border-emerald-900/30 rounded-lg rounded-tl-none px-3 py-2 text-sm whitespace-pre-wrap text-foreground/90 font-medium leading-relaxed">
          {rendered || (
            <span className="text-muted-foreground italic">
              A mensagem aparecerá aqui...
            </span>
          )}
          <div className="text-[10px] text-muted-foreground/70 text-right mt-1">11:15</div>
        </div>
      </div>

      {whatsappNumber && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
          A mensagem será enviada via WhatsApp para o número{' '}
          <span className="text-foreground font-medium">{whatsappNumber}</span> do lead.
        </div>
      )}
    </div>
  );
}
