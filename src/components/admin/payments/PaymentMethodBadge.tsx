import { Badge } from '@/components/ui/badge';

const METHOD_META: Record<string, { label: string; src: string }> = {
  pix: { label: 'PIX', src: '/integrations/methods/pix.svg' },
  boleto: { label: 'Boleto', src: '/integrations/methods/boleto.svg' },
  credit_card: { label: 'Cartão', src: '/integrations/methods/credit-card.svg' },
  creditcard: { label: 'Cartão', src: '/integrations/methods/credit-card.svg' },
  card: { label: 'Cartão', src: '/integrations/methods/credit-card.svg' },
};

interface Props {
  method?: string | null;
}

export function PaymentMethodBadge({ method }: Props) {
  if (!method) return <Badge variant="outline">—</Badge>;
  const key = method.toLowerCase().replace(/\s+/g, '_');
  const meta = METHOD_META[key];
  if (!meta) return <Badge variant="outline">{method}</Badge>;
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <img src={meta.src} alt={meta.label} className="h-4 w-4" />
      {meta.label}
    </Badge>
  );
}
