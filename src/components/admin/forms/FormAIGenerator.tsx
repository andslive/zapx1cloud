import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Target, MessageSquare, UserCheck, Calendar, ThumbsUp, Loader2, Brain, FileText, HelpCircle, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FormBlock } from '@/types/forms';
import { motion, AnimatePresence } from 'framer-motion';
import { useObjections } from '@/hooks/useObjections';
import { useKnowledgeSources } from '@/hooks/useKnowledgeSources';
import { useProduct } from '@/hooks/useProducts';

interface FormAIGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  onGenerated: (blocks: FormBlock[], suggestedName: string) => Promise<void>;
}

type Objective = 'qualification' | 'diagnostic' | 'capture' | 'presale' | 'feedback';
type Tone = 'formal' | 'informal' | 'technical';

const objectives: { value: Objective; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'qualification', label: 'Qualificação', description: 'Identificar fit e maturidade', icon: UserCheck },
  { value: 'diagnostic', label: 'Diagnóstico', description: 'Mapear dores e necessidades', icon: Target },
  { value: 'capture', label: 'Captação Rápida', description: 'Contato básico e ágil', icon: MessageSquare },
  { value: 'presale', label: 'Pré-venda', description: 'Preparar para reunião', icon: Calendar },
  { value: 'feedback', label: 'Feedback', description: 'Coletar opiniões', icon: ThumbsUp },
];

const tones: { value: Tone; label: string; emoji: string }[] = [
  { value: 'formal', label: 'Formal', emoji: '👔' },
  { value: 'informal', label: 'Informal', emoji: '😊' },
  { value: 'technical', label: 'Técnico', emoji: '🔧' },
];

const TOTAL_STEPS = 4;

export function FormAIGenerator({ open, onOpenChange, productId, productName, onGenerated }: FormAIGeneratorProps) {
  const [objective, setObjective] = useState<Objective>('qualification');
  const [tone, setTone] = useState<Tone>('informal');
  const [numQuestions, setNumQuestions] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState(1);
  
  // New state for enhanced wizard
  const [userContext, setUserContext] = useState('');
  const [useBrain, setUseBrain] = useState(true);
  const [useObjectionsData, setUseObjectionsData] = useState(true);

  // Fetch product data for brain summary
  const { data: product } = useProduct(productId);
  const { data: objections } = useObjections(productId);
  const { data: knowledgeSources } = useKnowledgeSources(productId);

  // Filter active knowledge sources
  const activeKnowledgeSources = knowledgeSources?.filter(ks => ks.is_active) || [];

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setObjective('qualification');
      setTone('informal');
      setNumQuestions(5);
      setUserContext('');
      setUseBrain(true);
      setUseObjectionsData(true);
    }
  }, [open]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('form-generate-ai', {
        body: {
          product_id: productId,
          objective,
          tone,
          num_questions: numQuestions,
          user_context: userContext,
          use_brain: useBrain,
          use_objections: useObjectionsData,
        },
      });

      if (error) throw error;

      if (data.success && data.blocks) {
        toast.success('Formulário gerado com sucesso!');
        // IMPORTANT: Wait for callback to complete (saves to DB) before closing
        await onGenerated(data.blocks, data.suggested_name);
        // Dialog is closed by FormsManager after successful creation
      } else {
        throw new Error(data.error || 'Erro ao gerar formulário');
      }
    } catch (error: any) {
      console.error('Error generating form:', error);
      toast.error(error.message || 'Erro ao gerar formulário com IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!objective;
      case 2: return true; // Context is optional
      case 3: return true; // Brain options always valid
      case 4: return numQuestions >= 3;
      default: return false;
    }
  };

  const getStepIndicator = () => {
    return (
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar Formulário com IA
          </DialogTitle>
          <DialogDescription>
            A IA vai criar perguntas otimizadas baseadas no produto <strong>{productName}</strong>
          </DialogDescription>
        </DialogHeader>

        {getStepIndicator()}

        <AnimatePresence mode="wait">
          {/* Step 1: Objective */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 py-4"
            >
              <div className="space-y-3">
                <Label className="text-base font-medium">Qual o objetivo do formulário?</Label>
                <div className="grid gap-2">
                  {objectives.map((obj) => {
                    const Icon = obj.icon;
                    return (
                      <button
                        key={obj.value}
                        type="button"
                        onClick={() => setObjective(obj.value)}
                        className={`p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                          objective === obj.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${objective === obj.value ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{obj.label}</p>
                          <p className="text-xs text-muted-foreground">{obj.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: User Context (NEW) */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 py-4"
            >
              <div className="space-y-3">
                <Label className="text-base font-medium">Descreva o contexto da sua campanha</Label>
                <Textarea
                  placeholder="Ex: Quero qualificar leads da campanha de Black Friday focando em igrejas que ainda não tem app próprio e estão cansadas de pagar mensalidades altas..."
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  className="min-h-[140px] resize-none"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Quanto mais detalhes você fornecer, mais personalizadas serão as perguntas
                </p>
              </div>
            </motion.div>
          )}

          {/* Step 3: Brain Summary (NEW) */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 py-4"
            >
              <div className="space-y-4">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Conhecimento Disponível
                </Label>
                
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                  {/* ICP */}
                  <div>
                    <p className="font-medium text-foreground">Cliente Ideal (ICP)</p>
                    <p className="text-muted-foreground line-clamp-2">
                      {product?.icp || 'Não definido'}
                    </p>
                  </div>
                  
                  {/* Differentials */}
                  <div>
                    <p className="font-medium text-foreground">Diferenciais</p>
                    <p className="text-muted-foreground">
                      {product?.differentials ? 'Cadastrados' : 'Não definidos'}
                    </p>
                  </div>

                  {/* Objections */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">Objeções Mapeadas</p>
                      <p className="text-muted-foreground">
                        {objections?.length || 0} cadastradas
                      </p>
                    </div>
                    {objections && objections.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(objections.map(o => o.category))).slice(0, 3).map(cat => (
                          <span key={cat} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs capitalize">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Knowledge Sources */}
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
                    {activeKnowledgeSources.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(activeKnowledgeSources.map(ks => ks.source_type))).slice(0, 3).map(type => (
                          <span key={type} className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs">
                            {type === 'website' ? 'Sites' : type === 'file' ? 'Arquivos' : type === 'faq' ? 'FAQs' : type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Toggle options */}
                <div className="space-y-3 pt-2">
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
                  
                  <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                    <Checkbox 
                      id="useObjections" 
                      checked={useObjectionsData} 
                      onCheckedChange={(checked) => setUseObjectionsData(checked === true)}
                      disabled={!objections?.length}
                    />
                    <div className="flex-1">
                      <Label 
                        htmlFor="useObjections" 
                        className={`cursor-pointer font-medium ${!objections?.length ? 'text-muted-foreground' : ''}`}
                      >
                        Criar perguntas baseadas nas objeções
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {objections?.length 
                          ? 'Qualificar leads identificando objeções antecipadamente' 
                          : 'Nenhuma objeção cadastrada ainda'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Tone & Quantity */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Número de perguntas</Label>
                  <span className="text-lg font-bold text-primary">{numQuestions}</span>
                </div>
                <Slider
                  value={[numQuestions]}
                  onValueChange={(v) => setNumQuestions(v[0])}
                  min={3}
                  max={12}
                  step={1}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Rápido (3)</span>
                  <span>Balanceado (7)</span>
                  <span>Detalhado (12)</span>
                </div>
              </div>
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
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar Formulário
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
