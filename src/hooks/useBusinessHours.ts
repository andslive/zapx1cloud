import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
};

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface ScheduleBlock {
  start: string; // HH:MM
  end: string;
}

export type WeekSchedule = Record<DayKey, ScheduleBlock[]>;

export interface BusinessHours {
  id: string;
  organization_id: string;
  timezone: string;
  schedule: WeekSchedule;
  out_of_hours_message: string;
  out_of_hours_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessHoliday {
  id: string;
  organization_id: string;
  date: string;
  description: string | null;
  created_at: string;
}

const DEFAULT_SCHEDULE: WeekSchedule = {
  mon: [{ start: '09:00', end: '18:00' }],
  tue: [{ start: '09:00', end: '18:00' }],
  wed: [{ start: '09:00', end: '18:00' }],
  thu: [{ start: '09:00', end: '18:00' }],
  fri: [{ start: '09:00', end: '18:00' }],
  sat: [],
  sun: [],
};

export function useBusinessHours() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['business-hours', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<BusinessHours | null> => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useUpsertBusinessHours() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<BusinessHours>) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const payload = {
        organization_id: profile.organization_id,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        schedule: (input.schedule ?? DEFAULT_SCHEDULE) as any,
        out_of_hours_message: input.out_of_hours_message ?? '',
        out_of_hours_enabled: input.out_of_hours_enabled ?? false,
      };
      const { data, error } = await supabase
        .from('business_hours')
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-hours'] });
      toast({ title: 'Horários salvos' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useBusinessHolidays() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['business-holidays', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<BusinessHoliday[]> => {
      const { data, error } = await supabase
        .from('business_holidays')
        .select('*')
        .eq('organization_id', orgId!)
        .order('date');
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useAddHoliday() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { date: string; description?: string }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { error } = await supabase
        .from('business_holidays')
        .insert({
          organization_id: profile.organization_id,
          date: input.date,
          description: input.description ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-holidays'] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('business_holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-holidays'] }),
  });
}

export function isWithinBusinessHoursLocal(
  bh: BusinessHours | null,
  holidays: BusinessHoliday[],
  now: Date = new Date()
): boolean {
  if (!bh) return true;
  // Build local time string in tz
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: bh.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(now);
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
    const wk = get('weekday').toLowerCase();
    const dayMap: Record<string, DayKey> = {
      mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
    };
    const day = dayMap[wk];
    const isoDate = `${get('year')}-${get('month')}-${get('day')}`;
    if (holidays.some((h) => h.date === isoDate)) return false;
    const blocks = bh.schedule?.[day] ?? [];
    if (blocks.length === 0) return false;
    const time = `${get('hour')}:${get('minute')}`;
    return blocks.some((b) => time >= b.start && time < b.end);
  } catch {
    return true;
  }
}
