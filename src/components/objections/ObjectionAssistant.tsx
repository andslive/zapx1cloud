import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Send, Copy, Save, RotateCcw, Loader2 } from 'lucide-react';
import { useHandleObjection, useSaveSingleObjection } from '@/hooks/useObjectionAI';
import { toast } from 'sonner';

interface ObjectionAssistantProps {
  productId: string;
  productName?: string;
}

export function ObjectionAssistant({ productId, productName }: ObjectionAssistantProps) {
  const [objection, setObjection] = useState('');
  const { handleObjection, isLoading, response, reset } = useHandleObjection();
  const saveObjection = useSaveSingleObjection();

  const handleSubmit = async () => {
    if (!objection.trim()) {
      toast.error('Digite a objeção do cliente');
      return;
    }

    try {
      await handleObjection(objection, productId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar objeção');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    toast.success('Resposta copiada!');
  };

  const handleSave = async () => {
    // Parse the response to extract sections
    const whatTheyMeanMatch = response.match(/\*\*O QUE ELE QUER DIZER:\*\*\s*([\s\S]*?)(?=\*\*RESPOSTA SUGERIDA:\*\*|$)/i);
    const responseMatch = response.match(/\*\*RESPOSTA SUGERIDA:\*\*\s*([\s\S]*?)(?=\*\*PERGUNTA DE RETORNO:\*\*|$)/i);
    const questionMatch = response.match(/\*\*PERGUNTA DE RETORNO:\*\*\s*([\s\S]*?)$/i);

    const parsedObjection = {
      category: 'thinking', // Default category
      what_they_say: objection.trim(),
      what_they_mean: whatTheyMeanMatch?.[1]?.trim() || '',
      suggested_response: responseMatch?.[1]?.trim() || '',
      follow_up_question: questionMatch?.[1]?.trim() || '',
    };

    try {
      await saveObjection.mutateAsync({
        productId,
        objection: parsedObjection,
      });
      toast.success('Objeção salva na base!');
      handleReset();
    } catch (error) {
      toast.error('Erro ao salvar objeção');
    }
  };

  const handleReset = () => {
    setObjection('');
    reset();
  };

  const formatResponse = (text: string) => {
    return text
      .replace(/\*\*O QUE ELE QUER DIZER:\*\*/gi, '<div class="mt-4 mb-2"><span class="text-xs font-semibold text-primary uppercase tracking-wide">💭 O que ele quer dizer:</span></div>')
      .replace(/\*\*RESPOSTA SUGERIDA:\*\*/gi, '<div class="mt-4 mb-2"><span class="text-xs font-semibold text-primary uppercase tracking-wide">💬 Resposta sugerida:</span></div>')
      .replace(/\*\*PERGUNTA DE RETORNO:\*\*/gi, '<div class="mt-4 mb-2"><span class="text-xs font-semibold text-primary uppercase tracking-wide">❓ Pergunta de retorno:</span></div>');
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Assistente de Objeções</CardTitle>
              {productName && (
                <p className="text-xs text-muted-foreground">
                  Contexto: {productName}
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            IA Especialista
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Qual a objeção do cliente?
          </label>
          <div className="flex gap-2">
            <Textarea
              placeholder='Ex: "Está muito caro para o meu orçamento atual"'
              value={objection}
              onChange={(e) => setObjection(e.target.value)}
              className="min-h-[80px] resize-none bg-background"
              disabled={isLoading}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !objection.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Gerar Resposta Estratégica
                </>
              )}
            </Button>
            {response && (
              <Button variant="outline" size="icon" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {(response || isLoading) && (
          <div className="rounded-lg border bg-background p-4 space-y-3">
            {isLoading && !response && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analisando contexto do produto e gerando resposta estratégica...</span>
              </div>
            )}
            
            {response && (
              <>
                <div 
                  className="text-sm leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatResponse(response) }}
                />
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-2 h-3 w-3" />
                    Copiar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSave}
                    disabled={saveObjection.isPending}
                  >
                    {saveObjection.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3 w-3" />
                    )}
                    Salvar na Base
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
