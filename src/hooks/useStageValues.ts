import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StageValue {
  id: string;
  stage_id: string;
  product_id: string;
  expected_value: number;
  probability_percent: number;
  created_at: string;
  updated_at: string;
  pipeline_stages?: {
    id: string;
    name: string;
    color: string | null;
    order_index: number;
    is_won: boolean | null;
    is_lost: boolean | null;
  } | null;
}

export function useStageValues(productId: string) {
  return useQuery({
    queryKey: ['stage-values', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_values')
        .select(`
          *,
          pipeline_stages (id, name, color, order_index, is_won, is_lost)
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as StageValue[];
    },
    enabled: !!productId
  });
}

export function useUpsertStageValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stageValue: Omit<StageValue, 'id' | 'created_at' | 'updated_at' | 'pipeline_stages'> & { id?: string }) => {
      const { data, error } = await supabase
        .from('stage_values')
        .upsert(stageValue, { onConflict: 'stage_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-values', variables.product_id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-financial-summary'] });
    }
  });
}

export function usePipelineFinancialSummary(productId: string, sellerId?: string) {
  return useQuery({
    queryKey: ['pipeline-financial-summary', productId, sellerId],
    queryFn: async () => {
      // Buscar stages com valores
      const { data: stageValues, error: stageError } = await supabase
        .from('stage_values')
        .select(`
          *,
          pipeline_stages (id, name, color, order_index, is_won, is_lost)
        `)
        .eq('product_id', productId);

      if (stageError) throw stageError;

      // Buscar leads por stage
      let leadsQuery = supabase
        .from('leads')
        .select('id, current_stage_id')
        .eq('product_id', productId);

      if (sellerId) {
        leadsQuery = leadsQuery.eq('assigned_to', sellerId);
      }

      const { data: leads, error: leadsError } = await leadsQuery;
      if (leadsError) throw leadsError;

      // Calcular resumo por etapa
      const stageMap = new Map<string, {
        stageId: string;
        stageName: string;
        stageColor: string;
        orderIndex: number;
        leadsCount: number;
        expectedValue: number;
        probability: number;
        weightedValue: number;
        isWon: boolean;
        isLost: boolean;
      }>();

      stageValues?.forEach(sv => {
        if (sv.pipeline_stages) {
          stageMap.set(sv.stage_id, {
            stageId: sv.stage_id,
            stageName: sv.pipeline_stages.name,
            stageColor: sv.pipeline_stages.color || '#6B7280',
            orderIndex: sv.pipeline_stages.order_index,
            leadsCount: 0,
            expectedValue: Number(sv.expected_value),
            probability: Number(sv.probability_percent),
            weightedValue: 0,
            isWon: sv.pipeline_stages.is_won || false,
            isLost: sv.pipeline_stages.is_lost || false
          });
        }
      });

      // Contar leads por stage e calcular valores
      leads?.forEach(lead => {
        if (lead.current_stage_id) {
          const stage = stageMap.get(lead.current_stage_id);
          if (stage) {
            stage.leadsCount++;
            stage.weightedValue = stage.leadsCount * stage.expectedValue * (stage.probability / 100);
          }
        }
      });

      // Ordenar por order_index
      const stages = Array.from(stageMap.values())
        .filter(s => !s.isWon && !s.isLost)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const totalPipelineValue = stages.reduce((sum, s) => sum + (s.leadsCount * s.expectedValue), 0);
      const totalWeightedValue = stages.reduce((sum, s) => sum + s.weightedValue, 0);

      return {
        stages,
        totalPipelineValue,
        totalWeightedValue,
        totalLeads: leads?.length || 0
      };
    },
    enabled: !!productId
  });
}
