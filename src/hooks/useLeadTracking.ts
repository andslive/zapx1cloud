import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadTrackingData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  lead_origin: string | null;
  lead_channel: string | null;
  referrer_url: string | null;
  landing_page: string | null;
  ctwa_clid?: string | null;
  ad_id?: string | null;
  campaign_id?: string | null;
  fbclid?: string | null;
  raw_payload?: any | null;
  referral?: any | null;
  source?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  landing_url?: string | null;
}

export function useLeadTracking(leadId: string) {
  return useQuery({
    queryKey: ['lead-tracking', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          lead_origin,
          lead_channel,
          referrer_url,
          landing_page,
          created_at
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as LeadTrackingData & { created_at: string };
    },
    enabled: !!leadId
  });
}

export function useDetailedLeadTracking(leadId: string) {
  return useQuery({
    queryKey: ['lead-tracking-detailed', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tracking')
        .select(`
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          ctwa_clid:referral_ctwa_clid,
          ad_id:ad_id,
          campaign_id:campaign_id,
          fbclid,
          raw_payload,
          referral,
          source,
          source_type:referral_type,
          source_url:referral_source,
          landing_url,
          created_at,
          ad_headline,
          ad_body,
          ad_source_app,
          ad_source_url,
          entry_point_conversion_source,
          raw_ctwa_payload,
          ctwa_payload,
          conversion_data
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as any;
    },
    enabled: !!leadId
  });
}

export function useLeadsByOrigin(productId?: string) {
  return useQuery({
    queryKey: ['leads-by-origin', productId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('lead_origin, utm_source, id');

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by origin
      const grouped = data.reduce((acc, lead) => {
        const origin = lead.lead_origin || 'Não informado';
        acc[origin] = (acc[origin] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return grouped;
    }
  });
}

export function useLeadsByCampaign(productId?: string) {
  return useQuery({
    queryKey: ['leads-by-campaign', productId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('utm_campaign, utm_source, id');

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by campaign
      const grouped = data.reduce((acc, lead) => {
        const campaign = lead.utm_campaign || 'Sem campanha';
        acc[campaign] = (acc[campaign] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return grouped;
    }
  });
}

export const LEAD_ORIGINS = [
  { value: 'website', label: 'Website' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'evento', label: 'Evento' },
  { value: 'importacao', label: 'Importação' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'redes_sociais', label: 'Redes Sociais' },
  { value: 'parceiro', label: 'Parceiro' },
  { value: 'outro', label: 'Outro' }
];

export const LEAD_CHANNELS = [
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'form', label: 'Formulário' },
  { value: 'chat', label: 'Chat' },
  { value: 'manual', label: 'Cadastro Manual' },
  { value: 'api', label: 'API/Integração' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' }
];
