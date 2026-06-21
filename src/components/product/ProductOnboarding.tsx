import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles, Check, X, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useProductOnboarding, ONBOARDING_STEPS } from '@/hooks/useProductOnboarding';
import { AIOptimizeButton } from './AIOptimizeButton';
import { cn } from '@/lib/utils';

interface ProductOnboardingProps {
  onComplete: (productId: string) => void;
  onCancel: () => void;
}

export function ProductOnboarding({ onComplete, onCancel }: ProductOnboardingProps) {
  const navigate = useNavigate();
  const {
    currentStep,
    currentStepData,
    totalSteps,
    progress,
    formData,
    isOptimizing,
    isCreating,
    updateField,
    nextStep,
    prevStep,
    canProceed,
    optimizeWithAI,
    completeOnboarding,
  } = useProductOnboarding();

  const [listInput, setListInput] = useState('');

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && currentStepData.type !== 'textarea') {
        e.preventDefault();
        if (currentStep === totalSteps - 1) {
          handleComplete();
        } else if (canProceed()) {
          nextStep();
        }
      } else if (e.key === 'Escape') {
        if (currentStep > 0) {
          prevStep();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, canProceed, nextStep, prevStep, totalSteps]);

  const handleComplete = async () => {
    const product = await completeOnboarding();
    if (product) {
      onComplete(product.id);
    }
  };

  const handleOptimize = async () => {
    const optimized = await optimizeWithAI(currentStepData.field, formData[currentStepData.field]);
    if (optimized) {
      updateField(currentStepData.field, optimized);
    }
  };

  const addListItem = () => {
    if (listInput.trim()) {
      const currentList = formData[currentStepData.field] || [];
      updateField(currentStepData.field, [...currentList, listInput.trim()]);
      setListInput('');
    }
  };

  const removeListItem = (index: number) => {
    const currentList = formData[currentStepData.field] || [];
    updateField(currentStepData.field, currentList.filter((_: any, i: number) => i !== index));
  };

  const renderInput = () => {
    const value = formData[currentStepData.field] || '';

    switch (currentStepData.type) {
      case 'textarea':
        return (
          <div className="space-y-3">
            <Textarea
              value={value}
              onChange={(e) => updateField(currentStepData.field, e.target.value)}
              placeholder={currentStepData.placeholder}
              className="min-h-[150px] text-lg bg-background/50 border-border/50 focus:border-primary resize-none"
              autoFocus
            />
            {currentStepData.aiOptimizable && (
              <AIOptimizeButton
                onOptimize={handleOptimize}
                isOptimizing={isOptimizing}
                disabled={!value.trim()}
              />
            )}
          </div>
        );

      case 'list':
        const items = formData[currentStepData.field] || [];
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={listInput}
                onChange={(e) => setListInput(e.target.value)}
                placeholder={currentStepData.placeholder}
                className="text-lg bg-background/50 border-border/50 focus:border-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addListItem();
                  }
                }}
                autoFocus
              />
              <Button onClick={addListItem} disabled={!listInput.trim()}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((item: string, index: number) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="text-sm py-2 px-3 flex items-center gap-2"
                >
                  {item}
                  <button
                    onClick={() => removeListItem(index)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        );

      default:
        if (currentStepData.field === 'status') {
          return (
            <div className="flex gap-3">
              {['draft', 'review', 'published'].map((status) => (
                <Button
                  key={status}
                  variant={value === status ? 'default' : 'outline'}
                  onClick={() => updateField('status', status)}
                  className="flex-1"
                >
                  {status === 'draft' && 'Rascunho'}
                  {status === 'review' && 'Em Revisão'}
                  {status === 'published' && 'Publicado'}
                </Button>
              ))}
            </div>
          );
        }
        return (
          <Input
            value={value}
            onChange={(e) => updateField(currentStepData.field, e.target.value)}
            placeholder={currentStepData.placeholder}
            className="text-lg h-14 bg-background/50 border-border/50 focus:border-primary"
            autoFocus
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Package className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Novo Produto</p>
              <p className="text-xs text-muted-foreground">
                Passo {currentStep + 1} de {totalSteps}
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-4 py-2">
        <div className="max-w-3xl mx-auto">
          <Progress value={progress} className="h-1" />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-8"
            >
              {/* Step indicator */}
              <div className="flex justify-center">
                <div className="flex items-center gap-1">
                  {ONBOARDING_STEPS.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all duration-300',
                        index === currentStep
                          ? 'w-6 bg-primary'
                          : index < currentStep
                          ? 'bg-primary/50'
                          : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Question */}
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-bold">{currentStepData.title}</h1>
                <p className="text-lg text-muted-foreground">{currentStepData.subtitle}</p>
              </div>

              {/* Input */}
              <div className="py-4">{renderInput()}</div>

              {/* Navigation hint */}
              <p className="text-center text-sm text-muted-foreground">
                {currentStepData.type === 'textarea' ? (
                  'Ctrl + Enter para continuar'
                ) : (
                  'Pressione Enter para continuar'
                )}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="border-t border-border/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>

          {currentStep === totalSteps - 1 ? (
            <Button
              onClick={handleComplete}
              disabled={!canProceed() || isCreating}
              className="min-w-[140px]"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Criar Produto
                </>
              )}
            </Button>
          ) : (
            <Button onClick={nextStep} disabled={!canProceed()}>
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
