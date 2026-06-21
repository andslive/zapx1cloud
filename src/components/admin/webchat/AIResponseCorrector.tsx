import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreateAIFeedback } from '@/hooks/useAIFeedback';
import { toast } from 'sonner';
import { Loader2, Wand2 } from 'lucide-react';

interface AIResponseCorrectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  conversationId: string;
  originalResponse: string;
}

export function AIResponseCorrector({
  open,
  onOpenChange,
  messageId,
  conversationId,
  originalResponse,
}: AIResponseCorrectorProps) {
  const [suggestedResponse, setSuggestedResponse] = useState('');
  const [feedbackType, setFeedbackType] = useState<'correction' | 'tone' | 'accuracy' | 'content'>('correction');
  
  const createFeedback = useCreateAIFeedback();

  const handleSubmit = async () => {
    if (!suggestedResponse.trim()) {
      toast.error('Digite a resposta sugerida');
      return;
    }

    try {
      await createFeedback.mutateAsync({
        messageId,
        conversationId,
        originalResponse,
        suggestedResponse: suggestedResponse.trim(),
        feedbackType,
      });
      
      toast.success('Correção salva! A IA aprenderá com este feedback.');
      setSuggestedResponse('');
      setFeedbackType('correction');
      onOpenChange(false);
    } catch (error) {
      toast.error('Erro ao salvar correção');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Corrigir Resposta da IA
          </DialogTitle>
          <DialogDescription>
            Sugira uma resposta melhor para ensinar a IA
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Resposta Original (IA)</Label>
            <div className="p-3 bg-muted rounded-lg text-sm">
              {originalResponse}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggested">Resposta Sugerida</Label>
            <Textarea
              id="suggested"
              value={suggestedResponse}
              onChange={(e) => setSuggestedResponse(e.target.value)}
              placeholder="Digite como a IA deveria ter respondido..."
              className="min-h-[120px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de Correção</Label>
            <RadioGroup
              value={feedbackType}
              onValueChange={(v) => setFeedbackType(v as typeof feedbackType)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="correction" id="correction" />
                <Label htmlFor="correction" className="text-sm cursor-pointer">
                  Conteúdo incorreto
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tone" id="tone" />
                <Label htmlFor="tone" className="text-sm cursor-pointer">
                  Tom inadequado
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="accuracy" id="accuracy" />
                <Label htmlFor="accuracy" className="text-sm cursor-pointer">
                  Imprecisão
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="content" id="content" />
                <Label htmlFor="content" className="text-sm cursor-pointer">
                  Poderia ser melhor
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createFeedback.isPending}>
            {createFeedback.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
