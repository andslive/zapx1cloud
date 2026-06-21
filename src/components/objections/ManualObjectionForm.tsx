import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Sparkles, PenLine } from 'lucide-react';
import { useSaveSingleObjection, useHandleObjection } from '@/hooks/useObjectionAI';
import { toast } from 'sonner';

interface ManualObjectionFormProps {
  productId: string;
  productName?: string;
  onSuccess?: () => void;
}

const categories = [
  { value: 'price', label: 'Preço' },
  { value: 'timing', label: 'Timing' },
  { value: 'trust', label: 'Confiança' },
  { value: 'thinking', label: 'Vou Pensar' },
  { value: 'partner', label: 'Sócio/Diretor' },
  { value: 'competitor', label: 'Concorrência' },
];

export function ManualObjectionForm({ productId, productName, onSuccess }: ManualObjectionFormProps) {
  const [category, setCategory] = useState<string>('thinking');
  const [whatTheySay, setWhatTheySay] = useState('');
  const [whatTheyMean, setWhatTheyMean] = useState('');
  const [suggestedResponse, setSuggestedResponse] = useState('');
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [refiningField, setRefiningField] = useState<string | null>(null);

  const saveObjection = useSaveSingleObjection();
  const { handleObjection, isLoading: isRefining } = useHandleObjection();

  const handleRefineWithAI = async (field: 'whatTheyMean' | 'suggestedResponse' | 'followUpQuestion') => {
    if (!whatTheySay.trim()) {
      toast.error('Digite a objeção do cliente primeiro');
      return;
    }

    setRefiningField(field);

    try {
      const response = await handleObjection(whatTheySay, productId);
      
      if (response) {
        // Parse the AI response
        const whatTheyMeanMatch = response.match(/\*\*O QUE ELE QUER DIZER:\*\*\s*([\s\S]*?)(?=\*\*RESPOSTA SUGERIDA:\*\*|$)/i);
        const responseMatch = response.match(/\*\*RESPOSTA SUGERIDA:\*\*\s*([\s\S]*?)(?=\*\*PERGUNTA DE RETORNO:\*\*|$)/i);
        const questionMatch = response.match(/\*\*PERGUNTA DE RETORNO:\*\*\s*([\s\S]*?)$/i);

        if (field === 'whatTheyMean' && whatTheyMeanMatch?.[1]) {
          setWhatTheyMean(whatTheyMeanMatch[1].trim());
        } else if (field === 'suggestedResponse' && responseMatch?.[1]) {
          setSuggestedResponse(responseMatch[1].trim());
        } else if (field === 'followUpQuestion' && questionMatch?.[1]) {
          setFollowUpQuestion(questionMatch[1].trim());
        }
        
        toast.success('Campo refinado com IA!');
      }
    } catch (error) {
      toast.error('Erro ao refinar com IA');
    } finally {
      setRefiningField(null);
    }
  };

  const handleRefineAll = async () => {
    if (!whatTheySay.trim()) {
      toast.error('Digite a objeção do cliente primeiro');
      return;
    }

    setRefiningField('all');

    try {
      const response = await handleObjection(whatTheySay, productId);
      
      if (response) {
        const whatTheyMeanMatch = response.match(/\*\*O QUE ELE QUER DIZER:\*\*\s*([\s\S]*?)(?=\*\*RESPOSTA SUGERIDA:\*\*|$)/i);
        const responseMatch = response.match(/\*\*RESPOSTA SUGERIDA:\*\*\s*([\s\S]*?)(?=\*\*PERGUNTA DE RETORNO:\*\*|$)/i);
        const questionMatch = response.match(/\*\*PERGUNTA DE RETORNO:\*\*\s*([\s\S]*?)$/i);

        if (whatTheyMeanMatch?.[1]) setWhatTheyMean(whatTheyMeanMatch[1].trim());
        if (responseMatch?.[1]) setSuggestedResponse(responseMatch[1].trim());
        if (questionMatch?.[1]) setFollowUpQuestion(questionMatch[1].trim());
        
        toast.success('Todos os campos gerados com IA!');
      }
    } catch (error) {
      toast.error('Erro ao gerar com IA');
    } finally {
      setRefiningField(null);
    }
  };

  const handleSave = async () => {
    if (!whatTheySay.trim()) {
      toast.error('Digite a objeção do cliente');
      return;
    }
    if (!suggestedResponse.trim()) {
      toast.error('Digite a resposta sugerida');
      return;
    }

    try {
      await saveObjection.mutateAsync({
        productId,
        objection: {
          category,
          what_they_say: whatTheySay.trim(),
          what_they_mean: whatTheyMean.trim(),
          suggested_response: suggestedResponse.trim(),
          follow_up_question: followUpQuestion.trim(),
        },
      });
      
      toast.success('Objeção salva com sucesso!');
      
      // Reset form
      setWhatTheySay('');
      setWhatTheyMean('');
      setSuggestedResponse('');
      setFollowUpQuestion('');
      setCategory('thinking');
      
      onSuccess?.();
    } catch (error) {
      toast.error('Erro ao salvar objeção');
    }
  };

  const isFormValid = whatTheySay.trim() && suggestedResponse.trim();

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <PenLine className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Adicionar Objeção Manual</CardTitle>
              {productName && (
                <p className="text-xs text-muted-foreground">
                  Produto: {productName}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Category Selection */}
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* What They Say */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>O que o cliente diz *</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefineAll}
              disabled={!whatTheySay.trim() || refiningField !== null}
              className="gap-1 text-xs h-7"
            >
              {refiningField === 'all' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Gerar Tudo com IA
            </Button>
          </div>
          <Textarea
            placeholder='Ex: "Está muito caro para o meu orçamento"'
            value={whatTheySay}
            onChange={(e) => setWhatTheySay(e.target.value)}
            className="min-h-[60px] resize-none"
          />
        </div>

        {/* What They Mean */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>O que ele quer dizer</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefineWithAI('whatTheyMean')}
              disabled={!whatTheySay.trim() || refiningField !== null}
              className="gap-1 text-xs h-7"
            >
              {refiningField === 'whatTheyMean' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Refinar com IA
            </Button>
          </div>
          <Textarea
            placeholder="O medo ou dúvida real por trás da objeção"
            value={whatTheyMean}
            onChange={(e) => setWhatTheyMean(e.target.value)}
            className="min-h-[60px] resize-none"
          />
        </div>

        {/* Suggested Response */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Resposta sugerida *</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefineWithAI('suggestedResponse')}
              disabled={!whatTheySay.trim() || refiningField !== null}
              className="gap-1 text-xs h-7"
            >
              {refiningField === 'suggestedResponse' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Refinar com IA
            </Button>
          </div>
          <Textarea
            placeholder="A resposta estratégica para contornar essa objeção"
            value={suggestedResponse}
            onChange={(e) => setSuggestedResponse(e.target.value)}
            className="min-h-[80px] resize-none"
          />
        </div>

        {/* Follow-up Question */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Pergunta de retorno</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefineWithAI('followUpQuestion')}
              disabled={!whatTheySay.trim() || refiningField !== null}
              className="gap-1 text-xs h-7"
            >
              {refiningField === 'followUpQuestion' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Refinar com IA
            </Button>
          </div>
          <Textarea
            placeholder="Pergunta para engajar e avançar a conversa"
            value={followUpQuestion}
            onChange={(e) => setFollowUpQuestion(e.target.value)}
            className="min-h-[60px] resize-none"
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={!isFormValid || saveObjection.isPending}
          className="w-full"
        >
          {saveObjection.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Objeção
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
