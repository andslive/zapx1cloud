import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateProduct } from '@/hooks/useProducts';
import { toast } from 'sonner';
import { DEFAULT_PIPELINE_STAGES } from '@/hooks/usePipelineMutations';

export interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  field: string;
  type: 'text' | 'textarea' | 'list';
  placeholder?: string;
  aiOptimizable?: boolean;
  required?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'name',
    title: 'Como se chama seu produto?',
    subtitle: 'Esse será o nome que seus vendedores verão.',
    field: 'name',
    type: 'text',
    placeholder: 'Ex: Produto Pro, CRM Enterprise...',
    required: true,
  },
  {
    id: 'description',
    title: 'Descreva seu produto em uma frase',
    subtitle: 'Uma descrição clara e objetiva ajuda os vendedores a entenderem rapidamente.',
    field: 'description',
    type: 'textarea',
    placeholder: 'Ex: Plataforma de automação de vendas com IA integrada...',
    aiOptimizable: true,
    required: true,
  },
  {
    id: 'icp',
    title: 'Quem é seu cliente ideal (ICP)?',
    subtitle: 'Defina o perfil ideal de cliente para este produto.',
    field: 'icp',
    type: 'textarea',
    placeholder: 'Ex: Empresas B2B de tecnologia com 50-500 funcionários...',
    aiOptimizable: true,
    required: true,
  },
  {
    id: 'pitch15s',
    title: 'Pitch de 15 segundos',
    subtitle: 'O pitch de elevador. Direto ao ponto.',
    field: 'pitch_15s',
    type: 'textarea',
    placeholder: 'Em 15 segundos, como você apresentaria este produto?',
    aiOptimizable: true,
    required: true,
  },
  {
    id: 'pitch30s',
    title: 'Pitch de 30 segundos',
    subtitle: 'Um pouco mais de contexto e valor.',
    field: 'pitch_30s',
    type: 'textarea',
    placeholder: 'Expanda o pitch com mais detalhes sobre o valor entregue...',
    aiOptimizable: true,
  },
  {
    id: 'pitch2min',
    title: 'Pitch de 2 minutos',
    subtitle: 'A apresentação completa com problema, solução e diferencial.',
    field: 'pitch_2min',
    type: 'textarea',
    placeholder: 'Conte a história completa: problema → solução → resultados...',
    aiOptimizable: true,
  },
  {
    id: 'differentials',
    title: 'Quais são os principais diferenciais?',
    subtitle: 'Liste os pontos que destacam seu produto da concorrência.',
    field: 'differentials',
    type: 'list',
    placeholder: 'Ex: Integração nativa com WhatsApp',
  },
  {
    id: 'status',
    title: 'Qual o status inicial do produto?',
    subtitle: 'Defina se já está pronto para ser usado pelos vendedores.',
    field: 'status',
    type: 'text',
    placeholder: 'draft',
    required: true,
  },
];

export function useProductOnboarding() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({
    status: 'draft',
    differentials: [],
  });
  const [isOptimizing, setIsOptimizing] = useState(false);

  const totalSteps = ONBOARDING_STEPS.length;
  const currentStepData = ONBOARDING_STEPS[currentStep];
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const updateField = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  }, [totalSteps]);

  const canProceed = useCallback(() => {
    const step = ONBOARDING_STEPS[currentStep];
    if (!step.required) return true;
    
    const value = formData[step.field];
    if (step.type === 'list') {
      return Array.isArray(value) && value.length > 0;
    }
    return !!value && String(value).trim().length > 0;
  }, [currentStep, formData]);

  const optimizeWithAI = useCallback(async (field: string, currentValue: string) => {
    if (!currentValue.trim()) {
      toast.error('Digite algo antes de otimizar');
      return null;
    }

    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-product-field', {
        body: {
          field,
          value: currentValue,
          productContext: formData,
        },
      });

      if (error) throw error;
      return data.optimized;
    } catch (error) {
      console.error('Error optimizing field:', error);
      toast.error('Erro ao otimizar com IA');
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, [formData]);

  const completeOnboarding = useCallback(async () => {
    let orgId = profile?.organization_id;

    if (!orgId) {
      // Tenta buscar a organização do perfil logado via Supabase diretamente
      // para evitar atrasos no carregamento do hook useAuth
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        orgId = profileData?.organization_id;
      }
    }

    if (!orgId) {
      // Tenta buscar a primeira organização disponível
      const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      if (orgs && orgs.length > 0) {
        orgId = orgs[0].id;
      }
    }

    if (!orgId) {
      toast.error('Organização não encontrada. Por favor, verifique se você está vinculado a uma organização.');
      return null;
    }


    try {
      const productData = {
        name: formData.name,
        description: formData.description,
        icp: formData.icp,
        pitch_15s: formData.pitch_15s,
        pitch_30s: formData.pitch_30s,
        pitch_2min: formData.pitch_2min,
        differentials: formData.differentials,
        status: formData.status || 'draft',
        organization_id: orgId,
      };

      const product = await createProduct.mutateAsync(productData);

      // Create default pipeline stages for the new product
      if (product?.id) {
        const stages = DEFAULT_PIPELINE_STAGES.map(stage => ({
          ...stage,
          product_id: product.id,
        }));

        const { error: stagesError } = await supabase
          .from('pipeline_stages')
          .insert(stages);

        if (stagesError) {
          console.error('Error creating pipeline stages:', stagesError);
        }
      }

      toast.success('Produto criado com sucesso!');
      return product;
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Erro ao criar produto');
      return null;
    }
  }, [formData, profile, createProduct]);

  const resetOnboarding = useCallback(() => {
    setCurrentStep(0);
    setFormData({ status: 'draft', differentials: [] });
  }, []);

  return {
    currentStep,
    currentStepData,
    totalSteps,
    progress,
    formData,
    isOptimizing,
    isCreating: createProduct.isPending,
    updateField,
    nextStep,
    prevStep,
    goToStep,
    canProceed,
    optimizeWithAI,
    completeOnboarding,
    resetOnboarding,
  };
}
