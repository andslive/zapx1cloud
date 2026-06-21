import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VisitorHistoryItem {
  id: string;
  channel: string;
  status: string;
  created_at: string;
  last_message_at: string | null;
  last_message: string | null;
  last_message_metadata?: any;
  closed_at: string | null;
}

/**
 * Cross-conversation history for the same visitor (matched by lead_id OR phone).
 * Excludes the current conversation.
 */
export function useVisitorHistory(opts: {
  currentConversationId: string | null;
  leadId?: string | null;
  visitorPhone?: string | null;
}) {
  const { currentConversationId, leadId, visitorPhone } = opts;
  const enabled = !!currentConversationId && (!!leadId || !!visitorPhone);

  return useQuery({
    queryKey: ['visitor-history', currentConversationId, leadId, visitorPhone],
    enabled,
    queryFn: async (): Promise<VisitorHistoryItem[]> => {
      let query = supabase
        .from('webchat_conversations')
        .select('id, channel, status, created_at, last_message_at, closed_at')
        .neq('id', currentConversationId!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(15);

      if (leadId) {
        query = query.eq('lead_id', leadId);
      } else if (visitorPhone) {
        query = query.eq('visitor_phone', visitorPhone);
      }

      const { data, error } = await query;
      if (error) throw error;

      const conversations = data || [];
      if (!conversations.length) return [];

      // Fetch last message snippet for each (cheap)
      const ids = conversations.map(c => c.id);
      const { data: lastMessages } = await supabase
        .from('webchat_messages')
        .select('conversation_id, content, created_at, metadata')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });

      const byConv: Record<string, { content: string; metadata: any }> = {};
      for (const m of lastMessages || []) {
        const cid = (m as any).conversation_id;
        if (!byConv[cid]) {
          byConv[cid] = { content: (m as any).content, metadata: (m as any).metadata };
        }
      }

      return conversations.map(c => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        created_at: c.created_at,
        last_message_at: c.last_message_at,
        closed_at: c.closed_at,
        last_message: byConv[c.id]?.content || null,
        last_message_metadata: byConv[c.id]?.metadata || null,
      }));
    },
    staleTime: 60_000,
  });
}
