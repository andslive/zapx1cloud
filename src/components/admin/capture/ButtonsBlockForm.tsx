import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { FunnelBlock, FunnelBlockOption, generateBlockId } from '@/types/funnel';

const MAX_OPTIONS = 10;

interface Props {
  block: FunnelBlock;
  updateData: (key: string, value: unknown) => void;
}

/** Botões / Menu: o lead escolhe uma opção (número ou texto) e o valor é salvo numa variável do funil. */
export function ButtonsBlockForm({ block, updateData }: Props) {
  const options: FunnelBlockOption[] = block.data.options ?? [];
  const setOptions = (next: FunnelBlockOption[]) => updateData('options', next);
  const patch = (i: number, p: Partial<FunnelBlockOption>) => setOptions(options.map((o, k) => (k === i ? { ...o, ...p } : o)));
  const remove = (i: number) => setOptions(options.filter((_, k) => k !== i));
  const add = () => setOptions([...options, { id: generateBlockId(), label: `Opção ${options.length + 1}` }]);
  const variable = (block.data.variable_name ?? '').replace(/[{}]/g, '').trim();

  return (
    <div className="space-y-4" data-testid="buttons-block-form">
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Mensagem do menu</Label>
        <Textarea
          className="text-xs"
          rows={3}
          value={block.data.content ?? ''}
          onChange={(e) => updateData('content', e.target.value)}
          placeholder="Ex.: Escolha o valor:"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Opções</Label>
        {options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <span className="w-4 text-[10px] text-muted-foreground">{i + 1}</span>
            <Input
              className="h-8 text-xs"
              value={o.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="Texto da opção"
              aria-label={`Texto da opção ${i + 1}`}
            />
            <Input
              className="h-8 w-24 text-xs"
              value={o.value ?? ''}
              onChange={(e) => patch(i, { value: e.target.value })}
              placeholder="Valor"
              aria-label={`Valor salvo da opção ${i + 1}`}
            />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)} disabled={options.length <= 1} aria-label={`Remover opção ${i + 1}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={options.length >= MAX_OPTIONS}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar opção
        </Button>
        <p className="text-[10px] text-muted-foreground">
          No WhatsApp o menu vai numerado (1, 2, 3…). O lead responde com o número ou com o texto da opção. Sem “Valor”, salva o texto da opção.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Salvar escolha na variável</Label>
        <Input
          className="h-8 text-xs"
          value={block.data.variable_name ?? ''}
          onChange={(e) => updateData('variable_name', e.target.value)}
          placeholder="valor"
        />
        <p className="text-[10px] text-muted-foreground">
          {variable
            ? <>Use <code>{`{{${variable}}}`}</code> nos blocos seguintes (ex.: no valor do bloco Cobrança).</>
            : 'Sem nome, a escolha fica em {{resposta}}.'}
        </p>
      </div>

      <p className="rounded border border-dashed p-2 text-[10px] text-muted-foreground">
        Saídas: ligue cada opção a um bloco no canvas. Opção sem ligação segue o “Próximo bloco”. Resposta fora das opções repete o menu.
      </p>
    </div>
  );
}
