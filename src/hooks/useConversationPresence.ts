import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Realtime presence + typing for a single conversation.
 *
 * Channel layout: `conversation:{conversationId}`
 *  - presence track: { actor: 'agent' | 'visitor', name?: string, user_id?: string, at: number }
 *  - broadcast 'typing': { sender_type: 'agent' | 'visitor', name?: string }
 *  - broadcast 'new_message': handled elsewhere (SellerInbox subscribes the same channel)
 *
 * IMPORTANT: To avoid duplicate channels, this hook owns its OWN channel instance
 * for presence/typing only. The existing `new_message` listener in SellerInbox
 * lives on a separate channel name (`conversation:${id}`) — Supabase allows
 * multiple subscriptions to the same logical channel as different client instances.
 */

export interface PresencePayload {
  actor: 'agent' | 'visitor';
  name?: string;
  user_id?: string;
  at: number;
}

interface UseConversationPresenceOptions {
  conversationId: string | null | undefined;
  /** Identity of the local participant (the agent in the panel) */
  selfActor: 'agent' | 'visitor';
  selfName?: string;
  selfUserId?: string;
  /** Whether to actually connect (e.g. only when a conversation is selected) */
  enabled?: boolean;
}

export interface UseConversationPresenceReturn {
  /** True when at least one peer of the OPPOSITE actor type is present. */
  peerOnline: boolean;
  /** True when the peer (opposite actor) is currently typing. */
  peerTyping: boolean;
  /** Last time a peer was seen online (ms epoch). */
  peerLastSeen: number | null;
  /** Broadcast a typing event from the local user. */
  sendTyping: () => void;
}

const TYPING_TTL_MS = 3500;

export function useConversationPresence({
  conversationId,
  selfActor,
  selfName,
  selfUserId,
  enabled = true,
}: UseConversationPresenceOptions): UseConversationPresenceReturn {
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState<number | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const peerActor: 'agent' | 'visitor' = selfActor === 'agent' ? 'visitor' : 'agent';

  useEffect(() => {
    if (!enabled || !conversationId) {
      setPeerOnline(false);
      setPeerTyping(false);
      return;
    }

    const channelName = `presence:conversation:${conversationId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: selfUserId || `${selfActor}-${Math.random().toString(36).slice(2, 9)}` },
        broadcast: { self: false },
      },
    });

    const computePeerOnline = () => {
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      let online = false;
      let lastSeen: number | null = null;
      for (const key of Object.keys(state)) {
        const entries = state[key] || [];
        for (const e of entries) {
          if (e.actor === peerActor) {
            online = true;
            if (!lastSeen || (e.at && e.at > lastSeen)) lastSeen = e.at;
          }
        }
      }
      setPeerOnline(online);
      if (lastSeen) setPeerLastSeen(lastSeen);
    };

    channel
      .on('presence', { event: 'sync' }, computePeerOnline)
      .on('presence', { event: 'join' }, computePeerOnline)
      .on('presence', { event: 'leave' }, computePeerOnline)
      .on('broadcast', { event: 'typing' }, (msg) => {
        const payload = (msg.payload || {}) as { sender_type?: string };
        if (payload.sender_type === peerActor) {
          setPeerTyping(true);
          if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
          peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), TYPING_TTL_MS);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            actor: selfActor,
            name: selfName,
            user_id: selfUserId,
            at: Date.now(),
          } as PresencePayload);
        }
      });

    channelRef.current = channel;

    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      try {
        channel.untrack();
      } catch {
        // ignore
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPeerOnline(false);
      setPeerTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, enabled, selfActor, selfUserId]);

  const sendTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    // Throttle to avoid flooding (max once per 1.5s)
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_type: selfActor, name: selfName },
    });
  }, [selfActor, selfName]);

  return { peerOnline, peerTyping, peerLastSeen, sendTyping };
}
