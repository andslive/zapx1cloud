import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CadenceAIGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  dayNumber: number;
  blockType: string;
  onGenerated: (content: string) => void;
}

export function CadenceAIGenerator({
  open,
  onOpenChange,
  productId,
  dayNumber,
  blockType,
  onGenerated,
}: CadenceAIGeneratorProps) {
  const [context, setContext] = useState('');
  const [variant, setVariant] = useState<'short' | 'medium' | 'long'>('medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedContent('');

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-copilot`;
      
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Gere uma mensagem de ${blockType} para o Dia ${dayNumber} da cadência de vendas.
          
Variante: ${variant === 'short' ? 'Curta (2-3 linhas)' : variant === 'medium' ? 'Média (4-5 linhas)' : 'Longa (6-8 linhas)'}

Contexto adicional: ${context || 'Nenhum contexto adicional'}

REGRAS:
- Formato otimizado para WhatsApp
- Use emojis estratégicos (✅ 💡 🎯 ⏰)
- Quebre linhas para facilitar leitura
- Tom conversacional e direto
- Inclua variável {nome} para personalização
- Retorne APENAS a mensagem pronta, sem explicações`
            }
          ],
          productId,
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error('Falha ao gerar conteúdo');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              setGeneratedContent(content);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error generating content:', error);
      toast.error('Erro ao gerar conteúdo');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    toast.success('Copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUse = () => {
    onGenerated(generatedContent);
    onOpenChange(false);
    setGeneratedContent('');
    setContext('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar com IA
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tamanho da mensagem</Label>
            <Select value={variant} onValueChange={(v) => setVariant(v as typeof variant)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Curta (2-3 linhas)</SelectItem>
                <SelectItem value="medium">Média (4-5 linhas)</SelectItem>
                <SelectItem value="long">Longa (6-8 linhas)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Contexto adicional (opcional)</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ex: Foco em urgência, mencionar promoção, etc."
              className="min-h-[80px]"
            />
          </div>

          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Mensagem
              </>
            )}
          </Button>

          {generatedContent && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label>Resultado</Label>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 whitespace-pre-wrap text-sm">
                {generatedContent}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleGenerate()}>
                  Gerar novamente
                </Button>
                <Button className="flex-1" onClick={handleUse}>
                  Usar esta mensagem
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
