import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Loader2, Brain, FileText, HelpCircle, ChevronRight, ChevronLeft, Check, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FunnelBlock } from '@/types/funnel';
import { motion, AnimatePresence } from 'framer-motion';
import { useKnowledgeSources } from '@/hooks/useKnowledgeSources';
import { useProduct } from '@/hooks/useProducts';

interface FunnelAIGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  onGenerated: (blocks: FunnelBlock[], startBlockId: string, suggestedName: string) => Promise<void>;
}

type Tone = 'formal' | 'informal' | 'technical';

const tones: { value: Tone; label: string; emoji: string }[] = [
  { value: 'formal', label: 'Formal', emoji: '👔' },
  { value: 'informal', label: 'Informal', emoji: '😊' },
  { value: 'technical', label: 'Técnico', emoji: '🔧' },
];

const TOTAL_STEPS = 3;

const PLACEHOLDER_PROMPT = `Ex: Quero captar nome e WhatsApp em um evento. 

O objetivo é entender se a pessoa quer:
• Se tornar parceiro White Label
• Controlar suas finanças pelo WhatsApp

Se for parceiro, oferecer demo, material de vendas ou vídeo da proposta.
Se for controle financeiro, mostrar um vídeo e apresentar os planos mensal e anual.

Copies curtas, experiência rápida e mobile-first.`;

export function FunnelAIGenerator({ open, onOpenChange, productId, productName, onGenerated }: FunnelAIGeneratorProps) {
  const [tone, setTone] = useState<Tone>('informal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [useBrain, setUseBrain] = useState(true);

  const { data: product } = useProduct(productId);
  const { data: knowledgeSources } = useKnowledgeSources(productId);
  const activeKnowledgeSources = knowledgeSources?.filter(ks => ks.is_active) || [];

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTone('informal');
      setPrompt('');
      setUseBrain(true);
    }
  }, [open]);

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('funnel-generate-ai', {
        body: {
          product_id: productId,
          prompt,
          tone,
          use_brain: useBrain,
        },
      });

      if (error) throw error;

      if (data.success && data.flow_blocks) {
        toast.success('Funil gerado com sucesso!');
        await onGenerated(data.flow_blocks, data.start_block_id, data.suggested_name);
      } else {
        throw new Error(data.error || 'Erro ao gerar funil');
      }
    } catch (error: any) {
      console.error('Error generating funnel:', error);
      if (error.message?.includes('429') || error.status === 429) {
        toast.error('Limite de requisições excedido. Tente novamente em alguns segundos.');
      } else if (error.message?.includes('402') || error.status === 402) {
        toast.error('Créditos insuficientes. Adicione créditos ao workspace.');
      } else {
        toast.error(error.message || 'Erro ao gerar funil com IA');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return prompt.trim().length >= 20;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  const getStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-4">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-all ${
            i + 1 < step
              ? 'bg-primary text-primary-foreground'
              : i + 1 === step
              ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {i + 1 < step ? <Check className="h-4 w-4" /> : i + 1}
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Gerar Funil com IA
          </DialogTitle>
          <DialogDescription>
            Descreva o funil que você quer e a IA vai criar todos os blocos para o produto <strong>{productName}</strong>
          </DialogDescription>
        </DialogHeader>

        {getStepIndicator()}

        <AnimatePresence mode="wait">
          {/* Step 1: Prompt */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 py-4"
            >
              <div className="space-y-3">
                <Label className="text-base font-medium">Descreva o funil que você quer criar</Label>
                <Textarea
                  placeholder={PLACEHOLDER_PROMPT}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[200px] resize-none"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Descreva o cenário, objetivo, opções e o que acontece em cada caminho. Quanto mais detalhe, melhor o resultado.
                </p>
                {prompt.trim().length > 0 && prompt.trim().length < 20 && (
                  <p className="text-xs text-destructive">Mínimo de 20 caracteres para uma boa geração</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 2: Brain + Tone */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
              {/* Tone */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Tom de comunicação</Label>
                <div className="grid grid-cols-3 gap-2">
                  {tones.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTone(t.value)}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${
                        tone === t.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="text-2xl mb-1 block">{t.emoji}</span>
                      <span className="text-sm font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brain */}
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Conhecimento Disponível
                </Label>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">Cliente Ideal (ICP)</p>
                    <p className="text-muted-foreground line-clamp-2">
                      {product?.icp || 'Não definido'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Diferenciais</p>
                    <p className="text-muted-foreground">
                      {product?.differentials ? 'Cadastrados' : 'Não definidos'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Fontes do Cérebro
                      </p>
                      <p className="text-muted-foreground">
                        {activeKnowledgeSources.length} processadas
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id="useBrain"
                    checked={useBrain}
                    onCheckedChange={(checked) => setUseBrain(checked === true)}
                  />
                  <div className="flex-1">
                    <Label htmlFor="useBrain" className="cursor-pointer font-medium">
                      Usar conhecimento do Cérebro
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      ICP, diferenciais e fontes processadas
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Generate */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
              <div className="bg-muted/50 rounded-lg p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Resumo da Geração
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Produto</span>
                    <span className="font-medium text-foreground">{productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tom</span>
                    <span className="font-medium text-foreground">
                      {tones.find(t => t.value === tone)?.emoji} {tones.find(t => t.value === tone)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cérebro</span>
                    <span className="font-medium text-foreground">{useBrain ? 'Ativado' : 'Desativado'}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Sua descrição:</p>
                  <p className="text-sm text-foreground line-clamp-4">{prompt}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                A IA vai gerar os blocos do funil. Depois, você pode editar tudo no Builder visual.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={isGenerating}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}

          {step < TOTAL_STEPS ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              Continuar
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={isGenerating || !canProceed()}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando funil...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar Funil com IA
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
