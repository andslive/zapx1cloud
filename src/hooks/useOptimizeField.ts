import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OptimizeResult {
  original: string;
  optimized: string;
  improvements: string[];
}

export function useOptimizeField() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const optimize = useCallback(async (
    field: string,
    value: string,
    productContext?: Record<string, any>
  ): Promise<OptimizeResult | null> => {
    if (!value.trim()) {
      toast.error('Digite algo antes de otimizar');
      return null;
    }

    setIsOptimizing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('optimize-product-field', {
        body: {
          field,
          value,
          productContext,
        },
      });

      if (error) throw error;

      const optimizeResult: OptimizeResult = {
        original: value,
        optimized: data.optimized,
        improvements: data.improvements || [],
      };

      setResult(optimizeResult);
      return optimizeResult;
    } catch (error) {
      console.error('Error optimizing field:', error);
      toast.error('Erro ao otimizar com IA');
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setIsOptimizing(false);
  }, []);

  return {
    isOptimizing,
    result,
    optimize,
    reset,
  };
}
