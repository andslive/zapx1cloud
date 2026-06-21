import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type ReminderChannel = 'whatsapp' | 'email' | 'both';
export type OffsetUnit = 'minutes' | 'hours' | 'days';
export type InternalChannel = 'whatsapp' | 'email' | 'both';

export interface BookingNotificationSettings {
  id: string;
  organization_id: string;
  event_type_id: string;
  send_email: boolean;
  send_whatsapp: boolean;
  whatsapp_instance_id: string | null;
  confirmation_message_whatsapp: string | null;
  confirmation_subject_email: string | null;
  confirmation_html_email: string | null;
  notify_seller_on_new: boolean;
  notify_seller_on_confirm: boolean;
  notify_seller_on_reschedule: boolean;
  notify_seller_on_cancel: boolean;
  internal_channel: InternalChannel;
  internal_message_template: string | null;
  recovery_enabled: boolean;
  recovery_offset_value: number;
  recovery_offset_unit: OffsetUnit;
  recovery_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingReminder {
  id: string;
  organization_id: string;
  event_type_id: string;
  offset_value: number;
  offset_unit: OffsetUnit;
  channel: ReminderChannel;
  message_template: string;
  email_subject: string | null;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CONFIRMATION_WHATSAPP = `Olá, {{nome_lead}}! ✅

Seu agendamento com {{nome_vendedor}} foi confirmado.

🗓 Data: {{data}}
⏰ Horário: {{hora}}
💻 Modalidade: {{modalidade}}

Para confirmar sua presença, responda:
1️⃣ Confirmar
2️⃣ Reagendar
3️⃣ Cancelar`;

export const DEFAULT_RECOVERY = `Olá, {{nome_lead}}!
Ainda não recebemos sua confirmação para a reunião com {{nome_vendedor}}.

Você conseguirá participar?

1️⃣ Sim
2️⃣ Reagendar
3️⃣ Cancelar`;

export const DEFAULT_INTERNAL = `✅ {{nome_lead}} confirmou a reunião.

🗓 {{data}} às {{hora}}
📞 {{telefone_lead}}
🔗 {{link_reuniao}}`;

export function buildDefaultSettings(orgId: string, eventTypeId: string): Partial<BookingNotificationSettings> {
  return {
    organization_id: orgId,
    event_type_id: eventTypeId,
    send_email: true,
    send_whatsapp: false,
    whatsapp_instance_id: null,
    confirmation_message_whatsapp: DEFAULT_CONFIRMATION_WHATSAPP,
    confirmation_subject_email: 'Sua reunião foi confirmada',
    confirmation_html_email: null,
    notify_seller_on_new: true,
    notify_seller_on_confirm: true,
    notify_seller_on_reschedule: true,
    notify_seller_on_cancel: true,
    internal_channel: 'both' as InternalChannel,
    internal_message_template: DEFAULT_INTERNAL,
    recovery_enabled: false,
    recovery_offset_value: 3,
    recovery_offset_unit: 'hours' as OffsetUnit,
    recovery_message: DEFAULT_RECOVERY,
  };
}

export function useBookingNotifications(eventTypeId: string | null | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['booking-notification-settings', eventTypeId],
    queryFn: async (): Promise<BookingNotificationSettings | null> => {
      if (!eventTypeId) return null;
      const { data, error } = await supabase
        .from('booking_notification_settings' as any)
        .select('*')
        .eq('event_type_id', eventTypeId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    enabled: !!eventTypeId,
  });

  const reminders = useQuery({
    queryKey: ['booking-reminders', eventTypeId],
    queryFn: async (): Promise<BookingReminder[]> => {
      if (!eventTypeId) return [];
      const { data, error } = await supabase
        .from('booking_reminders' as any)
        .select('*')
        .eq('event_type_id', eventTypeId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return ((data as any) || []) as BookingReminder[];
    },
    enabled: !!eventTypeId,
  });

  const upsertSettings = useMutation({
    mutationFn: async (input: Partial<BookingNotificationSettings>) => {
      if (!eventTypeId || !profile?.organization_id) throw new Error('Missing event or org');
      const payload = {
        ...buildDefaultSettings(profile.organization_id, eventTypeId),
        ...input,
        organization_id: profile.organization_id,
        event_type_id: eventTypeId,
      };
      const { data, error } = await supabase
        .from('booking_notification_settings' as any)
        .upsert(payload as any, { onConflict: 'event_type_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-notification-settings', eventTypeId] });
      toast.success('Notificações salvas');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar'),
  });

  const createReminder = useMutation({
    mutationFn: async (input: Partial<BookingReminder>) => {
      if (!eventTypeId || !profile?.organization_id) throw new Error('Missing');
      const payload = {
        organization_id: profile.organization_id,
        event_type_id: eventTypeId,
        offset_value: input.offset_value ?? 1,
        offset_unit: (input.offset_unit ?? 'hours') as OffsetUnit,
        channel: (input.channel ?? 'whatsapp') as ReminderChannel,
        message_template: input.message_template ?? `Olá, {{nome_lead}}! Lembrete: sua reunião com {{nome_vendedor}} é em breve.\n\n🗓 {{data}}\n⏰ {{hora}}\n{{link_reuniao}}`,
        email_subject: input.email_subject ?? 'Lembrete da sua reunião',
        is_active: input.is_active ?? true,
        order_index: input.order_index ?? (reminders.data?.length ?? 0),
      };
      const { data, error } = await supabase.from('booking_reminders' as any).insert(payload as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking-reminders', eventTypeId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateReminder = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<BookingReminder> & { id: string }) => {
      const { data, error } = await supabase
        .from('booking_reminders' as any)
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking-reminders', eventTypeId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_reminders' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking-reminders', eventTypeId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return {
    settings: settings.data,
    isLoading: settings.isLoading || reminders.isLoading,
    reminders: reminders.data || [],
    upsertSettings,
    createReminder,
    updateReminder,
    deleteReminder,
  };
}

export const TEMPLATE_VARIABLES = [
  { key: '{{nome_lead}}', label: 'Nome do lead' },
  { key: '{{nome_vendedor}}', label: 'Vendedor' },
  { key: '{{email_lead}}', label: 'Email' },
  { key: '{{telefone_lead}}', label: 'Telefone' },
  { key: '{{data}}', label: 'Data' },
  { key: '{{hora}}', label: 'Hora' },
  { key: '{{modalidade}}', label: 'Modalidade' },
  { key: '{{nome_evento}}', label: 'Evento' },
  { key: '{{link_reuniao}}', label: 'Link reunião' },
  { key: '{{empresa}}', label: 'Empresa' },
] as const;

export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
