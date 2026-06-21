import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Form, FormBlock, FormTheme, SelectOption, ScaleOptions } from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (slug) {
      loadForm();
    }
  }, [slug]);

  const loadForm = async () => {
    try {
      setLoading(true);
      
      // Fetch form by slug
      const { data: formData, error: formError } = await supabase
        .from('forms')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (formError || !formData) {
        setError('Formulário não encontrado ou inativo.');
        return;
      }

      // Parse JSONB fields with proper typing
      const theme = formData.theme as unknown as FormTheme | null;
      const settings = formData.settings as unknown as Partial<Form['settings']> | null;
      const roundRobinConfig = formData.round_robin_config as unknown as { users: string[]; current_index: number } | null;
      const customScripts = formData.custom_scripts as unknown as { header: string; footer: string } | null;

      const parsedForm: Form = {
        ...formData,
        status: formData.status as Form['status'],
        distribution_rule: formData.distribution_rule as Form['distribution_rule'],
        default_temperature: formData.default_temperature || 'warm',
        theme: theme || {
          primary_color: '#3B82F6',
          secondary_color: '#1E40AF',
          background_color: '#0F172A',
          text_color: '#FFFFFF',
          font_family: 'Inter',
          border_radius: '8px',
          button_style: 'filled',
          logo_url: null,
          show_progress: true,
          redirect_url: null,
        },
        settings: {
          show_branding: settings?.show_branding ?? true,
          allow_multiple_submissions: settings?.allow_multiple_submissions ?? false,
          notify_on_submission: settings?.notify_on_submission ?? true,
          auto_create_lead: settings?.auto_create_lead ?? true,
        },
        round_robin_config: roundRobinConfig || { users: [], current_index: 0 },
        custom_scripts: customScripts || { header: '', footer: '' },
        views_count: formData.views_count || 0,
        submissions_count: formData.submissions_count || 0,
      };

      setForm(parsedForm);

      // Fetch blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from('form_blocks')
        .select('*')
        .eq('form_id', formData.id)
        .order('order_index');

      if (blocksError) throw blocksError;

      const parsedBlocks = (blocksData || []).map(block => ({
        ...block,
        block_type: block.block_type as FormBlock['block_type'],
        options: (block.options as unknown as SelectOption[] | ScaleOptions) || [],
        logic_rules: (block.logic_rules as unknown as FormBlock['logic_rules']) || [],
        score_rules: (block.score_rules as unknown as FormBlock['score_rules']) || [],
        apply_tags: block.apply_tags || [],
        validation: (block.validation as unknown as Record<string, unknown>) || {},
        block_settings: (block.block_settings as unknown as Record<string, unknown>) || {},
      })) as FormBlock[];

      setBlocks(parsedBlocks);

      // Increment view count
      await supabase.rpc('increment_form_views', { p_form_id: formData.id });

    } catch (err: any) {
      console.error('Error loading form:', err);
      setError('Erro ao carregar formulário.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    // Max step is handled by the button visibility (isLastQuestionStep shows Submit instead)
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleResponse = (blockId: string, value: unknown) => {
    setResponses(prev => ({ ...prev, [blockId]: value }));
  };

  const handleSubmit = async () => {
    if (!form) return;

    try {
      setSubmitting(true);

      // Capture UTM params from URL
      const urlParams = new URLSearchParams(window.location.search);
      const tracking = {
        utm_source: urlParams.get('utm_source') || undefined,
        utm_medium: urlParams.get('utm_medium') || undefined,
        utm_campaign: urlParams.get('utm_campaign') || undefined,
        utm_term: urlParams.get('utm_term') || undefined,
        utm_content: urlParams.get('utm_content') || undefined,
        referrer_url: document.referrer || undefined,
        landing_page: window.location.href,
        user_agent: navigator.userAgent,
      };

      const { data, error } = await supabase.functions.invoke('form-submit', {
        body: {
          form_id: form.id,
          responses,
          tracking,
        },
      });

      if (error) throw error;

      if (data.success) {
        setSubmitted(true);
        if (form.theme.redirect_url) {
          setTimeout(() => {
            window.location.href = form.theme.redirect_url!;
          }, 2000);
        }
      } else {
        throw new Error(data.error || 'Erro ao enviar formulário');
      }
    } catch (err: any) {
      console.error('Error submitting form:', err);
      toast.error(err.message || 'Erro ao enviar formulário');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBlock = (block: FormBlock) => {
    const value = responses[block.id];

    switch (block.block_type) {
      case 'welcome_screen':
        return (
          <div className="text-center space-y-6">
            <h1 className="text-3xl md:text-4xl font-bold">{block.label}</h1>
            {block.description && (
              <p className="text-lg text-muted-foreground">{block.description}</p>
            )}
            <Button size="lg" onClick={handleNext} className="gap-2">
              Começar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        );

      case 'end_screen':
        return (
          <div className="text-center space-y-6">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <h1 className="text-3xl md:text-4xl font-bold">{block.label}</h1>
            {block.description && (
              <p className="text-lg text-muted-foreground">{block.description}</p>
            )}
          </div>
        );

      case 'text':
      case 'email':
      case 'phone':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Input
              type={block.block_type === 'email' ? 'email' : block.block_type === 'phone' ? 'tel' : 'text'}
              placeholder={block.placeholder}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg py-6"
            />
          </div>
        );

      case 'number':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Input
              type="number"
              placeholder={block.placeholder}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg py-6"
            />
          </div>
        );

      case 'textarea':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Textarea
              placeholder={block.placeholder}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg min-h-[120px]"
            />
          </div>
        );

      case 'select':
        const selectOptions = block.options as SelectOption[];
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(v) => handleResponse(block.id, v)}
              className="space-y-3"
            >
              {selectOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleResponse(block.id, option.value)}
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="cursor-pointer flex-1">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 'multi_select':
        const multiOptions = block.options as SelectOption[];
        const selectedValues = (value as string[]) || [];
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="space-y-3">
              {multiOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => {
                    const newValues = selectedValues.includes(option.value)
                      ? selectedValues.filter(v => v !== option.value)
                      : [...selectedValues, option.value];
                    handleResponse(block.id, newValues);
                  }}
                >
                  <Checkbox checked={selectedValues.includes(option.value)} />
                  <Label className="cursor-pointer flex-1">{option.label}</Label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="flex gap-4">
              <Button
                variant={value === true ? 'default' : 'outline'}
                size="lg"
                className="flex-1"
                onClick={() => handleResponse(block.id, true)}
              >
                Sim
              </Button>
              <Button
                variant={value === false ? 'default' : 'outline'}
                size="lg"
                className="flex-1"
                onClick={() => handleResponse(block.id, false)}
              >
                Não
              </Button>
            </div>
          </div>
        );

      case 'scale':
        const scaleOptions = block.options as ScaleOptions;
        const sliderValue = (value as number) || scaleOptions.min;
        return (
          <div className="space-y-6">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="space-y-4">
              <div className="text-center text-4xl font-bold">{sliderValue}</div>
              <Slider
                value={[sliderValue]}
                onValueChange={([v]) => handleResponse(block.id, v)}
                min={scaleOptions.min}
                max={scaleOptions.max}
                step={1}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{scaleOptions.min_label || scaleOptions.min}</span>
                <span>{scaleOptions.max_label || scaleOptions.max}</span>
              </div>
            </div>
          </div>
        );

      case 'ai_question':
      case 'ai_followup':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <Label className="text-xl font-medium">
                {block.label}
                {block.required && <span className="text-destructive ml-1">*</span>}
              </Label>
            </div>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Textarea
              placeholder={block.placeholder || 'Digite sua resposta...'}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg min-h-[120px]"
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Filter visible blocks (exclude hidden_field, conditional, score, tag)
  const visibleBlocks = blocks.filter(b => 
    !['hidden_field', 'conditional', 'score', 'tag'].includes(b.block_type)
  );
  
  // Separate question blocks from end_screen - end_screen should show AFTER submission
  const questionBlocks = visibleBlocks.filter(b => b.block_type !== 'end_screen');
  const hasEndScreen = visibleBlocks.some(b => b.block_type === 'end_screen');

  const currentBlock = questionBlocks[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastQuestionStep = currentStep === questionBlocks.length - 1;
  const isWelcome = currentBlock?.block_type === 'welcome_screen';
  const progress = questionBlocks.length > 0 ? ((currentStep + 1) / questionBlocks.length) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Formulário não encontrado</h2>
            <p className="text-muted-foreground">{error || 'O formulário que você está procurando não existe ou está inativo.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    const endBlock = blocks.find(b => b.block_type === 'end_screen');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <CheckCircle className="h-20 w-20 mx-auto text-green-500" />
          <h1 className="text-3xl md:text-4xl font-bold">
            {endBlock?.label || 'Obrigado!'}
          </h1>
          <p className="text-lg text-muted-foreground">
            {endBlock?.description || 'Suas respostas foram enviadas com sucesso.'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Progress bar */}
      {form.theme.show_progress && !isWelcome && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <Progress value={progress} className="h-1 rounded-none" />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentBlock && renderBlock(currentBlock)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      {!isWelcome && currentBlock && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={isFirstStep}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>

            <span className="text-sm text-muted-foreground">
              {currentStep + 1} / {questionBlocks.length}
            </span>

            {isLastQuestionStep ? (
              <Button 
                onClick={handleSubmit} 
                disabled={submitting}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Enviar
              </Button>
            ) : (
              <Button onClick={handleNext} className="gap-2">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Branding */}
      {form.settings.show_branding !== false && (
        <div className="fixed bottom-20 left-0 right-0 text-center py-2">
          <span className="text-xs text-muted-foreground">
            Powered by <strong>{form.organization_id ? 'Plataforma' : 'Plataforma'}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
