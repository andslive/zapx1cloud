import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FileAndMediaUpload } from '@/components/ui/file-and-media-upload';
import type { FunnelBlock } from '@/types/funnel';
import { VariableField, funnelVariableGroups } from './VariableField';

interface Props {
  block: FunnelBlock;
  blocks: FunnelBlock[];
  updateData: (key: string, value: unknown) => void;
}

/** Botão Copiar: imagem (opcional) → texto/legenda (opcional) → botão que copia o valor resolvido. */
export function CopyButtonBlockForm({ block, blocks, updateData }: Props) {
  const groups = funnelVariableGroups(blocks);
  return (
    <div className="space-y-4" data-testid="copy-button-block-form">
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Imagem (opcional)</Label>
        <FileAndMediaUpload value={block.data.image_url} onChange={(url) => updateData('image_url', url)} type="image" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Texto / legenda (opcional)</Label>
        <VariableField multiline rows={3} testId="copy-caption" groups={groups}
          value={block.data.copy_caption ?? ''} onChange={(v) => updateData('copy_caption', v)}
          placeholder="Ex.: Paga en OXXO con la referencia {{gateway.payment_code}}" />
        <p className="text-[10px] text-muted-foreground">Aparece acima do botão. Aceita texto fixo, variáveis ou os dois juntos.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Rótulo do botão</Label>
        <Input value={block.data.copy_label ?? ''} onChange={(e) => updateData('copy_label', e.target.value)}
          placeholder="Ex: Copiar llave Bre-B" className="h-8 text-xs" />
        <p className="text-[10px] text-muted-foreground">É o texto que aparece no botão.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Valor a copiar</Label>
        <VariableField testId="copy-value" groups={groups} className="h-8 text-xs font-mono"
          value={block.data.copy_value ?? ''} onChange={(v) => updateData('copy_value', v)}
          placeholder="Texto que será copiado ao tocar no botão" />
      </div>
    </div>
  );
}
