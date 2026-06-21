import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { 
  startOfDay, 
  endOfDay, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  format,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameHour,
  isSameDay,
  parseISO
} from 'date-fns';

export type DashboardPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export interface DashboardFilters {
  period: DashboardPeriod;
  offerId: string | null;
  connectionId: string | null;
  source: string | null;
  startDate?: Date;
  endDate?: Date;
}

export function useAdminDashboardData(filters: DashboardFilters) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['admin-dashboard-performance', orgId, JSON.stringify(filters)],
    queryFn: async () => {
      if (!orgId) return null;

      let startDate: Date;
      let endDate: Date = new Date();

      const getSaoPauloDayBoundaries = (date: Date) => {
        const spDateStr = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const [day, month, year] = spDateStr.split('/').map(Number);
        const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        const end = new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
        return { start, end };
      };

      const now = new Date();
      const { start: todayStart, end: todayEnd } = getSaoPauloDayBoundaries(now);

      switch (filters.period) {
        case 'today':
          startDate = todayStart;
          endDate = todayEnd;
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const { start: yStart, end: yEnd } = getSaoPauloDayBoundaries(yesterday);
          startDate = yStart;
          endDate = yEnd;
          break;
        case '7d':
          startDate = new Date(todayStart);
          startDate.setDate(startDate.getDate() - 6);
          endDate = todayEnd;
          break;
        case '30d':
          startDate = new Date(todayStart);
          startDate.setDate(startDate.getDate() - 29);
          endDate = todayEnd;
          break;
        case 'month':
          const spMonthStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'numeric', year: 'numeric' });
          const [spMonth, spYear] = spMonthStr.split('/').map(Number);
          startDate = new Date(Date.UTC(spYear, spMonth - 1, 1, 3, 0, 0));
          const nextMonth = new Date(Date.UTC(spYear, spMonth, 1, 2, 59, 59, 999));
          endDate = nextMonth;
          break;
        case 'custom':
          startDate = filters.startDate ? getSaoPauloDayBoundaries(filters.startDate).start : todayStart;
          endDate = filters.endDate ? getSaoPauloDayBoundaries(filters.endDate).end : todayEnd;
          break;
        default:
          startDate = todayStart;
          endDate = todayEnd;
      }

      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Utilizar raw supabase para evitar erros de tipagem profunda
      const client = supabase as any;

      const { data: leadsDataRaw } = await client
        .from('leads')
        .select('id, created_at, source, temperature, product_id, connection_id')
        .eq('organization_id', orgId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);

      let leadsData = (leadsDataRaw || []) as any[];

      if (filters.offerId) leadsData = leadsData.filter(l => l.product_id === filters.offerId);
      if (filters.connectionId) leadsData = leadsData.filter(l => l.connection_id === filters.connectionId);
      if (filters.source && filters.source !== 'all') {
         leadsData = leadsData.filter(l => (l.source || '').toLowerCase().includes(filters.source!.toLowerCase()));
      }

      const { data: allPurchasesRaw } = await client
        .from('purchase_audit')
        .select('*')
        .eq('purchase_status', 'success')
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      
      let allPurchases = (allPurchasesRaw || []) as any[];
      if (filters.offerId) {
         const { data: funnel } = await client.from('capture_funnels').select('name').eq('product_id', filters.offerId).maybeSingle();
         if (funnel) allPurchases = allPurchases.filter((p: any) => p.funnel_name === funnel.name);
      }

      const uniquePurchasesMap = new Map<string, any>();
      allPurchases.forEach(p => {
        // Ignorar TECHNICAL_LOG se não houver identificador forte
        if (!p.fbtrace_id && !p.event_id) return;
        
        const key = p.fbtrace_id && p.fbtrace_id !== 'N/A' ? p.fbtrace_id : (p.event_id && p.event_id !== 'N/A' ? p.event_id : p.id);
        
        if (!uniquePurchasesMap.has(key)) {
          uniquePurchasesMap.set(key, p);
        } else {
          // Priorizar registros com fbtrace_id (CAPI confirmada)
          const existing = uniquePurchasesMap.get(key);
          if (p.fbtrace_id && p.fbtrace_id !== 'N/A' && (!existing.fbtrace_id || existing.fbtrace_id === 'N/A')) {
            uniquePurchasesMap.set(key, p);
          }
        }
      });
      const uniquePurchases = Array.from(uniquePurchasesMap.values());

      const { count: activeConversations } = await client
        .from('whatsapp_active_chats')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId);

      const hotLeadsCount = leadsData.filter(l => l.temperature === 'hot').length;

      const { count: activeConnections } = await client
        .from('evolution_instances')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'connected');

      const totalLeads = leadsData.length;
      const totalRevenue = uniquePurchases.reduce((acc, p) => acc + Number(p.purchase_value || 0), 0);
      const totalSales = uniquePurchases.length;
      const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
      const conversionRate = totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0;

      const revByOffer: Record<string, number> = {};
      const revByConnection: Record<string, number> = {};
      const revByFunnel: Record<string, number> = {};

      uniquePurchases.forEach(p => {
        const offer = p.offer_name || 'Sem Oferta';
        const connection = p.connection_name || 'Conexão Direta';
        const funnel = p.funnel_name || 'Sem Funil';
        
        revByOffer[offer] = (revByOffer[offer] || 0) + Number(p.purchase_value || 0);
        revByConnection[connection] = (revByConnection[connection] || 0) + Number(p.purchase_value || 0);
        revByFunnel[funnel] = (revByFunnel[funnel] || 0) + Number(p.purchase_value || 0);
      });

      let chartData: any[] = [];
      if (filters.period === 'today' || filters.period === 'yesterday') {
        const hours = eachHourOfInterval({ start: startDate, end: endDate });
        chartData = hours.map(hour => {
          const hourRevenue = uniquePurchases
            .filter(p => isSameHour(parseISO(p.created_at), hour))
            .reduce((acc, p) => acc + Number(p.purchase_value || 0), 0);
          return { label: format(hour, 'HH:mm'), revenue: hourRevenue };
        });
      } else {
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        chartData = days.map(day => {
          const dayRevenue = uniquePurchases
            .filter(p => isSameDay(parseISO(p.created_at), day))
            .reduce((acc, p) => acc + Number(p.purchase_value || 0), 0);
          return { label: format(day, 'dd/MM'), revenue: dayRevenue };
        });
      }

      // Funil de Auditoria
      const { data: auditMeta } = await client.from('purchase_audit').select('id').eq('organization_id', orgId).gte('created_at', startIso).lte('created_at', endIso);
      const { count: auditWebhook } = await client.from('webhook_health').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', startIso).lte('created_at', endIso).eq('message_type', 'message');
      const { count: auditLeads } = await client.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', startIso).lte('created_at', endIso);
      const { count: auditAttribution } = await client.from('lead_tracking').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', startIso).lte('created_at', endIso).not('campaign_id', 'is', null);

      return {
        cards: {
          newLeads: totalLeads,
          revenue: totalRevenue,
          avgTicket,
          sales: totalSales,
          conversionRate,
          activeConversations: activeConversations || 0,
          hotLeads: hotLeadsCount,
          activeConnections: activeConnections || 0
        },
        performance: {
          revenueByOffer: Object.entries(revByOffer).map(([name, value]) => ({ name, value })),
          revenueByConnection: Object.entries(revByConnection).map(([name, value]) => ({ name, value })),
          revenueByFunnel: Object.entries(revByFunnel).map(([name, value]) => ({ name, value })),
          topOffers: Object.entries(revByOffer)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
        },
        auditFunnel: {
          metaAccepted: auditMeta?.length || 0,
          webhookReceived: auditWebhook || 0,
          leadCreated: auditLeads || 0,
          enriched: auditAttribution || 0,
          confirmed: totalSales
        },
        chartData
      };

    },
    enabled: !!orgId,
  });
}
