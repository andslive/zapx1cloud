import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

interface PollComposerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: { question: string; options: string[] }) => void;
}

export function PollComposerDialog({ open, onOpenChange, onConfirm }: PollComposerDialogProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const updateOption = (idx: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const addOption = () => {
    if (options.length < 12) setOptions((prev) => [...prev, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const valid = question.trim().length > 0 && options.filter((o) => o.trim().length > 0).length >= 2;

  const handleSubmit = () => {
    if (!valid) return;
    onConfirm({
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
    });
    setQuestion('');
    setOptions(['', '']);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar enquete</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="poll-q">Pergunta</Label>
            <Input
              id="poll-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex.: Qual horário é melhor para você?"
            />
          </div>
          <div className="space-y-2">
            <Label>Opções</Label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Opção ${idx + 1}`}
                />
                {options.length > 2 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeOption(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button variant="outline" size="sm" onClick={addOption} className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar opção
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!valid}>Enviar enquete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
