import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface GeneratedObjection {
  category: 'price' | 'trust' | 'timing' | 'thinking' | 'partner' | 'competitor';
  what_they_say: string;
  what_they_mean: string;
  suggested_response: string;
  follow_up_question: string;
}

interface HandleObjectionResponse {
  whatTheyMean: string;
  suggestedResponse: string;
  followUpQuestion: string;
}

export function useHandleObjection() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string>('');

  const handleObjection = async (
    objection: string,
    productId: string,
    onDelta?: (text: string) => void
  ) => {
    setIsLoading(true);
    setResponse('');

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-objection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ objection, productId }),
        }
      );

      if (!resp.ok || !resp.body) {
        const error = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to get response');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullResponse = '';

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
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullResponse += content;
              setResponse(fullResponse);
              onDelta?.(content);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      return fullResponse;
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResponse('');
  };

  return { handleObjection, isLoading, response, reset };
}

export function useGenerateObjections() {
  return useMutation({
    mutationFn: async (productId: string): Promise<GeneratedObjection[]> => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-objections`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ productId }),
        }
      );

      if (!resp.ok) {
        const error = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to generate objections');
      }

      const data = await resp.json();
      return data.objections;
    },
  });
}

export function useSaveGeneratedObjections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      objections,
    }: {
      productId: string;
      objections: GeneratedObjection[];
    }) => {
      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const objectionsToInsert = objections.map((obj) => ({
        product_id: productId,
        organization_id: profile.organization_id,
        category: obj.category,
        what_they_say: obj.what_they_say,
        what_they_mean: obj.what_they_mean,
        suggested_response: obj.suggested_response,
        follow_up_question: obj.follow_up_question,
      }));

      const { error } = await supabase
        .from('objections')
        .insert(objectionsToInsert);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objections'] });
    },
  });
}

export function useSaveSingleObjection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      objection,
    }: {
      productId: string;
      objection: {
        category: string;
        what_they_say: string;
        what_they_mean: string;
        suggested_response: string;
        follow_up_question: string;
      };
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const { error } = await supabase.from('objections').insert({
        product_id: productId,
        organization_id: profile.organization_id,
        ...objection,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objections'] });
    },
  });
}
