import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AdminNotification {
  id: string;
  organization_id: string;
  created_by: string | null;
  type: 'system' | 'urgency' | 'opportunity' | 'cadence' | 'audit';
  title: string;
  message: string | null;
  action_url: string | null;
  scope: 'all' | 'product' | 'squad' | 'custom';
  scope_filters: {
    productIds?: string[];
    squadIds?: string[];
    userIds?: string[];
  };
  send_app: boolean;
  send_email: boolean;
  recipients_count: number;
  emails_sent: number;
  emails_failed: number;
  created_at: string;
  sent_at: string | null;
  created_by_profile?: {
    full_name: string;
  };
}

export interface CreateNotificationData {
  type: 'system' | 'urgency' | 'opportunity' | 'cadence' | 'audit';
  title: string;
  message: string;
  action_url?: string;
  scope: 'all' | 'product' | 'squad' | 'custom';
  scope_filters: {
    productIds?: string[];
    squadIds?: string[];
    userIds?: string[];
  };
  send_app: boolean;
  send_email: boolean;
}

// Fetch notification history
export function useAdminNotificationHistory() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['admin-notifications', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      
      const { data, error } = await supabase
        .from('admin_notifications')
        .select(`
          *,
          created_by_profile:profiles!admin_notifications_created_by_fkey(full_name)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as AdminNotification[];
    },
    enabled: !!profile?.organization_id,
  });
}

// Resolve recipients based on scope
async function resolveRecipients(
  organizationId: string,
  scope: string,
  scopeFilters: CreateNotificationData['scope_filters']
): Promise<Array<{ id: string; email: string; full_name: string }>> {
  let query = supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  
  if (scope === 'custom' && scopeFilters.userIds?.length) {
    query = query.in('id', scopeFilters.userIds);
  }
  
  const { data: profiles, error } = await query;
  if (error) throw error;
  
  let recipients = profiles || [];
  
  // Filter by product assignments
  if (scope === 'product' && scopeFilters.productIds?.length) {
    const { data: assignments } = await supabase
      .from('user_product_assignments')
      .select('user_id')
      .in('product_id', scopeFilters.productIds);
    
    const assignedUserIds = new Set(assignments?.map(a => a.user_id) || []);
    recipients = recipients.filter(r => assignedUserIds.has(r.id));
  }
  
  // Filter by squad membership
  if (scope === 'squad' && scopeFilters.squadIds?.length) {
    const { data: members } = await supabase
      .from('squad_members')
      .select('user_id')
      .in('squad_id', scopeFilters.squadIds);
    
    const squadUserIds = new Set(members?.map(m => m.user_id) || []);
    recipients = recipients.filter(r => squadUserIds.has(r.id));
  }
  
  return recipients;
}

// Create and send notification
export function useCreateAdminNotification() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateNotificationData) => {
      if (!profile?.organization_id || !user?.id) {
        throw new Error('Usuário não autenticado');
      }
      
      // 1. Resolve recipients based on scope
      const recipients = await resolveRecipients(
        profile.organization_id,
        data.scope,
        data.scope_filters
      );
      
      if (recipients.length === 0) {
        throw new Error('Nenhum destinatário encontrado para o escopo selecionado');
      }
      
      // 2. Create admin notification record
      const { data: adminNotification, error: adminError } = await supabase
        .from('admin_notifications')
        .insert({
          organization_id: profile.organization_id,
          created_by: user.id,
          type: data.type,
          title: data.title,
          message: data.message,
          action_url: data.action_url || null,
          scope: data.scope,
          scope_filters: data.scope_filters,
          send_app: data.send_app,
          send_email: data.send_email,
          recipients_count: recipients.length,
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (adminError) throw adminError;
      
      // 3. Create individual notifications if send_app is true
      if (data.send_app) {
        const notifications = recipients.map(recipient => ({
          user_id: recipient.id,
          type: data.type,
          title: data.title,
          message: data.message,
          action_url: data.action_url || null,
          admin_notification_id: adminNotification.id,
          is_read: false,
        }));
        
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifications);
        
        if (notifError) {
          console.error('Error creating notifications:', notifError);
        }
      }
      
      // 4. Send emails if enabled
      if (data.send_email) {
        try {
          const response = await supabase.functions.invoke('send-notification-email', {
            body: {
              adminNotificationId: adminNotification.id,
              recipients: recipients.map(r => ({
                email: r.email,
                name: r.full_name,
              })),
              title: data.title,
              message: data.message,
              actionUrl: data.action_url,
              type: data.type,
            },
          });
          
          if (response.error) {
            console.error('Error sending emails:', response.error);
          }
        } catch (emailError) {
          console.error('Error invoking email function:', emailError);
        }
      }
      
      return { adminNotification, recipientsCount: recipients.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      toast.success(`Notificação enviada para ${result.recipientsCount} destinatário(s)`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao enviar notificação');
    },
  });
}

// Get recipient count preview
export function useRecipientCount(
  organizationId: string | undefined,
  scope: string,
  scopeFilters: CreateNotificationData['scope_filters']
) {
  return useQuery({
    queryKey: ['recipient-count', organizationId, scope, scopeFilters],
    queryFn: async () => {
      if (!organizationId) return 0;
      const recipients = await resolveRecipients(organizationId, scope, scopeFilters);
      return recipients.length;
    },
    enabled: !!organizationId,
    staleTime: 10000,
  });
}
