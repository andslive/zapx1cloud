import { useRef, useState } from 'react';
import { Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FunnelBlock } from '@/types/funnel';

export interface VariableOption { key: string; description: string }
export interface VariableGroup { label: string; vars: VariableOption[] }

const LEAD_VARS: VariableOption[] = [
  { key: 'contact_name', description: 'Nome do contato no WhatsApp' },
  { key: 'lead_name', description: 'Nome do lead' },
];

const GATEWAY_VARS: VariableOption[] = [
  { key: 'gateway.payment_code', description: 'CLABE (SPEI) ou referência (OXXO)' },
  { key: 'gateway.payment_qrcode', description: 'URL da imagem do código de barras (OXXO)' },
  { key: 'gateway.payment_link', description: 'Link de pagamento ou voucher' },
  { key: 'gateway.value', description: 'Valor da cobrança' },
  { key: 'gateway.expires_at', description: 'Prazo para pagar' },
  { key: 'gateway.bank_name', description: 'Banco destinatário' },
  { key: 'gateway.beneficiary', description: 'Beneficiário' },
];

/** Variáveis disponíveis ao editar um bloco: as salvas pelos outros blocos do funil, as do lead e, havendo Cobrança, as do gateway. */
export function funnelVariableGroups(blocks: FunnelBlock[]): VariableGroup[] {
  const saved = Array.from(new Set(
    blocks.map((b) => String(b.data?.variable_name ?? '').replace(/[{}]/g, '').trim()).filter(Boolean),
  )).map((key) => ({ key, description: 'Salva por um bloco do funil' }));
  const groups: VariableGroup[] = [];
  if (saved.length) groups.push({ label: 'Variáveis do funil', vars: saved });
  groups.push({ label: 'Lead', vars: LEAD_VARS });
  if (blocks.some((b) => b.type === 'charge')) groups.push({ label: 'Cobrança', vars: GATEWAY_VARS });
  return groups;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  groups: VariableGroup[];
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  testId?: string;
}

/** Campo de texto com a mesma sintaxe {{variável}} do funil e seletor que insere na posição do cursor. */
export function VariableField({ value, onChange, groups, multiline, rows = 3, placeholder, className, testId }: Props) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);

  const insert = (key: string) => {
    const token = `{{${key}}}`;
    setOpen(false);
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(start + token.length, start + token.length); } catch { /* ignore */ }
    });
  };

  return (
    <div className="space-y-1.5">
      {multiline ? (
        <Textarea ref={ref} data-testid={testId} className={className ?? 'text-xs'} rows={rows} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input ref={ref} data-testid={testId} className={className ?? 'h-8 text-xs'} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
            <Braces className="h-3 w-3" /> Variáveis
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="border-b px-3 py-2">
            <p className="text-sm font-medium">Inserir variável</p>
            <p className="text-xs text-muted-foreground">Insere na posição do cursor.</p>
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto p-2">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {g.vars.map((v) => (
                  <button key={v.key} type="button" onClick={() => insert(v.key)}
                    className="w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-accent">
                    <code className="font-mono text-xs text-primary">{`{{${v.key}}}`}</code>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{v.description}</p>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
