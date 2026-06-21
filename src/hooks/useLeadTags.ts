import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface LeadTag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  description: string | null;
  is_automatic: boolean;
  is_lifecycle_status?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadTagWithCount extends LeadTag {
  leads_count?: number;
}

export interface LeadTagAssignment {
  lead_id: string;
  tag_id: string;
  applied_by: string | null;
  source: 'manual' | 'flow' | 'ai_agent' | 'automation' | 'webhook';
  applied_at: string;
  tag?: LeadTag;
}

export function useLeadTags() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['lead-tags', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<LeadTagWithCount[]> => {
      const { data: tags, error } = await supabase
        .from('lead_tags')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw error;

      // Counts per tag
      const tagIds = (tags ?? []).map((t) => t.id);
      if (tagIds.length === 0) return [];

      const { data: assignments } = await supabase
        .from('lead_tag_assignments')
        .select('tag_id')
        .in('tag_id', tagIds);

      const counts = new Map<string, number>();
      (assignments ?? []).forEach((a) => {
        counts.set(a.tag_id, (counts.get(a.tag_id) ?? 0) + 1);
      });

      return (tags ?? []).map((t) => ({
        ...t,
        leads_count: counts.get(t.id) ?? 0,
      }));
    },
  });
}

export function useLeadTagsForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-tag-assignments', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<(LeadTagAssignment & { tag: LeadTag })[]> => {
      const { data, error } = await supabase
        .from('lead_tag_assignments')
        .select('*, tag:lead_tags(*)')
        .eq('lead_id', leadId!);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateLeadTag() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; color: string; description?: string; is_automatic?: boolean }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { data, error } = await supabase
        .from('lead_tags')
        .insert({
          organization_id: profile.organization_id,
          name: input.name.trim(),
          color: input.color,
          description: input.description ?? null,
          is_automatic: input.is_automatic ?? false,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      toast({ title: 'Etiqueta criada' });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar etiqueta', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadTag> & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      toast({ title: 'Etiqueta atualizada' });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      qc.invalidateQueries({ queryKey: ['lead-tag-assignments'] });
      toast({ title: 'Etiqueta removida' });
    },
    onError: (e: any) => toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' }),
  });
}

export function useAssignLeadTag() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ leadId, tagId, source = 'manual' }: { leadId: string; tagId: string; source?: LeadTagAssignment['source'] }) => {
      const { error } = await supabase
        .from('lead_tag_assignments')
        .insert({ lead_id: leadId, tag_id: tagId, applied_by: user?.id ?? null, source });
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-tag-assignments', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao aplicar etiqueta', description: e.message, variant: 'destructive' }),
  });
}

export function useRemoveLeadTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      const { error } = await supabase
        .from('lead_tag_assignments')
        .delete()
        .eq('lead_id', leadId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-tag-assignments', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
    },
  });
}

// ============ Automações ============

export interface TagAutomation {
  id: string;
  organization_id: string;
  product_id: string | null;
  event_type: 'compra_aprovada' | 'pix_gerado' | 'boleto_gerado' | 'checkout_abandonado' | 'reembolso' | 'chargeback' | 'assinatura_cancelada';
  tag_id_to_add: string;
  tag_id_to_remove: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const TAG_EVENT_LABELS: Record<TagAutomation['event_type'], string> = {
  compra_aprovada: 'Compra aprovada',
  pix_gerado: 'PIX gerado',
  boleto_gerado: 'Boleto gerado',
  checkout_abandonado: 'Checkout abandonado',
  reembolso: 'Reembolso',
  chargeback: 'Chargeback',
  assinatura_cancelada: 'Assinatura cancelada',
};

export function useTagAutomations() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['tag-automations', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<TagAutomation[]> => {
      const { data, error } = await supabase
        .from('tag_automations')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TagAutomation[];
    },
  });
}

export function useUpsertTagAutomation() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<TagAutomation> & { event_type: TagAutomation['event_type']; tag_id_to_add: string }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const payload = {
        organization_id: profile.organization_id,
        product_id: input.product_id ?? null,
        event_type: input.event_type,
        tag_id_to_add: input.tag_id_to_add,
        tag_id_to_remove: input.tag_id_to_remove ?? null,
        is_active: input.is_active ?? true,
        created_by: user?.id ?? null,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from('tag_automations')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('tag_automations')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-automations'] });
      toast({ title: 'Automação salva' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteTagAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tag_automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-automations'] });
      toast({ title: 'Automação removida' });
    },
  });
}
