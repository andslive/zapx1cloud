import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLeadTag, useUpdateLeadTag, type LeadTag } from '@/hooks/useLeadTags';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: LeadTag | null;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b',
];

export function TagFormDialog({ open, onOpenChange, tag }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const create = useCreateLeadTag();
  const update = useUpdateLeadTag();

  useEffect(() => {
    if (open) {
      setName(tag?.name ?? '');
      setColor(tag?.color ?? '#6366f1');
      setDescription(tag?.description ?? '');
    }
  }, [open, tag]);

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (tag) {
        await update.mutateAsync({ id: tag.id, name: name.trim(), color, description: description || null });
      } else {
        await create.mutateAsync({ name: name.trim(), color, description });
      }
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tag ? 'Editar etiqueta' : 'Nova etiqueta'}</DialogTitle>
          <DialogDescription>
            Etiquetas ajudam a categorizar leads. Ex.: "Quente", "Comprou Curso X", "Abandonou checkout".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Comprou Produto X" />
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-20 p-1"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para que serve esta etiqueta?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
            {tag ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
