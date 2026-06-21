import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AcceptArgs {
  conversation_id: string;
  sector_id: string;
  /** Force takeover even if conversation is assigned to someone else (admin only). */
  force?: boolean;
}

export function useAcceptConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversation_id, sector_id, force }: AcceptArgs) => {
      const { data, error } = await supabase.functions.invoke('webchat-inbox', {
        body: { action: 'accept', conversation_id, sector_id, force: !!force },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onMutate: async (vars) => {
      // Update otimista: marca a conversa como aceita pelo usuário e bumpa para o topo
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          snapshots: [] as Array<{ key: any; data: any }>,
          detailKey: null as any,
          previousDetail: null as any,
        };
      }

      // Cancela queries pendentes (lista + detalhe)
      await queryClient.cancelQueries({ queryKey: ['webchat-conversations'] });
      const detailKey = ['webchat-conversation', vars.conversation_id];
      await queryClient.cancelQueries({ queryKey: detailKey });

      // Snapshot de TODAS as queries com prefixo webchat-conversations
      const queries = queryClient.getQueriesData<any>({ queryKey: ['webchat-conversations'] });
      const snapshots = queries.map(([key, data]) => ({ key, data }));

      const nowIso = new Date().toISOString();
      for (const [key, data] of queries) {
        if (!Array.isArray(data)) continue;
        const updated = data.map((conv: any) =>
          conv?.id === vars.conversation_id
            ? {
                ...conv,
                assigned_user_id: user.id,
                sector_id: vars.sector_id,
                status: 'human_active',
                accepted_at: nowIso,
                accepted_by: user.id,
                current_agent_id: null,
                last_message_at: nowIso,
              }
            : conv
        );
        // Reordena por last_message_at desc
        updated.sort((a: any, b: any) => {
          const ta = new Date(a?.last_message_at || 0).getTime();
          const tb = new Date(b?.last_message_at || 0).getTime();
          return tb - ta;
        });
        queryClient.setQueryData(key, updated);
      }

      // Patch otimista do cache de DETALHE — desbloqueia o composer imediatamente
      // (viewerMode/needsAccept dependem de conversationDetail.conversation).
      const previousDetail = queryClient.getQueryData<any>(detailKey);
      if (previousDetail?.conversation) {
        queryClient.setQueryData(detailKey, {
          ...previousDetail,
          conversation: {
            ...previousDetail.conversation,
            assigned_user_id: user.id,
            sector_id: vars.sector_id,
            status: 'human_active',
            accepted_at: nowIso,
            accepted_by: user.id,
            current_agent_id: null,
            last_message_at: nowIso,
          },
        });
      }

      return { snapshots, detailKey, previousDetail };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback lista
      if (ctx?.snapshots) {
        for (const { key, data } of ctx.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      // Rollback detalhe
      if (ctx?.detailKey && ctx.previousDetail !== undefined) {
        queryClient.setQueryData(ctx.detailKey, ctx.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      // refetchType: 'active' força a query aberta a refazer mesmo dentro do staleTime
      queryClient.invalidateQueries({
        queryKey: ['webchat-conversation', vars.conversation_id],
        refetchType: 'active',
      });
    },
  });
}
