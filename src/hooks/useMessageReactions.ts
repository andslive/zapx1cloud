import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface MessageReaction {
  id: string;
  message_id: string;
  emoji: string;
  user_id: string | null;
  visitor_id: string | null;
  reactor_type: 'agent' | 'visitor';
  created_at: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  byMe: boolean;
  reactors: string[]; // user_ids ou visitor_ids
}

/**
 * Gerencia reações de uma conversa: carrega snapshot inicial e escuta realtime.
 * Retorna um Map<message_id, ReactionSummary[]> e funções para reagir / remover.
 */
export function useMessageReactions(conversationId: string | null | undefined) {
  const { user } = useAuth();
  const [reactionsByMessage, setReactionsByMessage] = useState<Map<string, MessageReaction[]>>(new Map());
  const reactionsRef = useRef(reactionsByMessage);
  reactionsRef.current = reactionsByMessage;

  // Snapshot inicial
  useEffect(() => {
    if (!conversationId) {
      setReactionsByMessage(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('conversation_id', conversationId);
      if (cancelled || error || !data) return;
      const map = new Map<string, MessageReaction[]>();
      for (const r of data as MessageReaction[]) {
        const arr = map.get(r.message_id) ?? [];
        arr.push(r);
        map.set(r.message_id, arr);
      }
      setReactionsByMessage(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setReactionsByMessage((prev) => {
            const next = new Map(prev);
            if (payload.eventType === 'INSERT') {
              const r = payload.new as MessageReaction;
              const arr = next.get(r.message_id) ?? [];
              if (!arr.find((x) => x.id === r.id)) {
                next.set(r.message_id, [...arr, r]);
              }
            } else if (payload.eventType === 'DELETE') {
              const r = payload.old as MessageReaction;
              const arr = next.get(r.message_id) ?? [];
              const filtered = arr.filter((x) => x.id !== r.id);
              if (filtered.length) next.set(r.message_id, filtered);
              else next.delete(r.message_id);
            } else if (payload.eventType === 'UPDATE') {
              const r = payload.new as MessageReaction;
              const arr = next.get(r.message_id) ?? [];
              next.set(
                r.message_id,
                arr.map((x) => (x.id === r.id ? r : x))
              );
            }
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const summarize = useCallback(
    (messageId: string): ReactionSummary[] => {
      const list = reactionsByMessage.get(messageId);
      if (!list || !list.length) return [];
      const grouped = new Map<string, ReactionSummary>();
      for (const r of list) {
        const reactorKey = r.user_id ?? r.visitor_id ?? '';
        const isMe = r.reactor_type === 'agent' && r.user_id === user?.id;
        const existing = grouped.get(r.emoji);
        if (existing) {
          existing.count += 1;
          if (isMe) existing.byMe = true;
          existing.reactors.push(reactorKey);
        } else {
          grouped.set(r.emoji, { emoji: r.emoji, count: 1, byMe: isMe, reactors: [reactorKey] });
        }
      }
      return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    },
    [reactionsByMessage, user?.id]
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversationId) return;
      // Verifica reação atual minha nessa mensagem
      const list = reactionsRef.current.get(messageId) ?? [];
      const mine = list.find((r) => r.reactor_type === 'agent' && r.user_id === user.id);

      // Toggle: se clicou no mesmo emoji, remove
      if (mine && mine.emoji === emoji) {
        setReactionsByMessage((prev) => {
          const next = new Map(prev);
          const arr = (next.get(messageId) ?? []).filter((r) => r.id !== mine.id);
          if (arr.length) next.set(messageId, arr);
          else next.delete(messageId);
          return next;
        });
        await supabase.from('message_reactions').delete().eq('id', mine.id);
        return;
      }

      // Se já tinha outra, remove a antiga primeiro
      if (mine) {
        await supabase.from('message_reactions').delete().eq('id', mine.id);
      }

      const optimistic: MessageReaction = {
        id: `optimistic-${Date.now()}`,
        message_id: messageId,
        emoji,
        user_id: user.id,
        visitor_id: null,
        reactor_type: 'agent',
        created_at: new Date().toISOString(),
      };
      setReactionsByMessage((prev) => {
        const next = new Map(prev);
        const arr = (next.get(messageId) ?? []).filter((r) => !(r.reactor_type === 'agent' && r.user_id === user.id));
        next.set(messageId, [...arr, optimistic]);
        return next;
      });

      const { error } = await supabase.from('message_reactions').insert({
        message_id: messageId,
        conversation_id: conversationId,
        emoji,
        user_id: user.id,
        reactor_type: 'agent',
      });

      if (error) {
        // Reverte otimismo
        setReactionsByMessage((prev) => {
          const next = new Map(prev);
          const arr = (next.get(messageId) ?? []).filter((r) => r.id !== optimistic.id);
          if (arr.length) next.set(messageId, arr);
          else next.delete(messageId);
          return next;
        });
      }
    },
    [user?.id, conversationId]
  );

  return { summarize, react };
}
