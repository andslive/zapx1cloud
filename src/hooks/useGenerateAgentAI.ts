import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AgentType } from '@/types/agents';

interface GeneratedAgent {
  name: string;
  description: string;
  primary_objective: string;
  additional_prompt?: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  end_conversation_triggers?: string[];
  tone_style: 'formal' | 'consultive' | 'friendly' | 'technical';
  message_style: 'short' | 'balanced' | 'detailed';
  required_phrases?: string[];
  prohibited_phrases?: string[];
  humanization?: any;
}

interface OptimizeResult {
  field: string;
  optimized: string | string[];
  reasoning: string;
}

export function useGenerateAgentAI() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAgent, setGeneratedAgent] = useState<GeneratedAgent | null>(null);

  const generateAgent = useCallback(async (
    productId: string | null,
    agentType: AgentType,
    customContext?: string
  ): Promise<GeneratedAgent | null> => {
    setIsGenerating(true);
    setGeneratedAgent(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-ai', {
        body: {
          product_id: productId,
          agent_type: agentType,
          custom_context: customContext,
          scope: productId ? 'product' : 'organization',
        },
      });

      if (error) throw error;

      if (data?.agent) {
        setGeneratedAgent(data.agent);
        toast.success('Agente gerado com sucesso!');
        return data.agent;
      }

      throw new Error('Failed to generate agent');
    } catch (error) {
      console.error('Error generating agent:', error);
      toast.error('Erro ao gerar agente com IA');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const optimizeField = useCallback(async (
    productId: string,
    agentType: AgentType,
    field: string,
    currentValue: string | string[]
  ): Promise<OptimizeResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-ai', {
        body: {
          product_id: productId,
          agent_type: agentType,
          optimize_field: field,
          current_value: Array.isArray(currentValue) ? currentValue.join('\n') : currentValue,
        },
      });

      if (error) throw error;

      if (data?.optimized) {
        return data as OptimizeResult;
      }

      throw new Error('Failed to optimize field');
    } catch (error) {
      console.error('Error optimizing field:', error);
      toast.error('Erro ao otimizar com IA');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setGeneratedAgent(null);
    setIsGenerating(false);
  }, []);

  return {
    isGenerating,
    generatedAgent,
    generateAgent,
    optimizeField,
    reset,
  };
}
