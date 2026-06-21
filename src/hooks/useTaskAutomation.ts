import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateTask } from './useTasks';

interface CadenceTask {
  leadId: string;
  leadName: string;
  productId: string;
  productName: string;
  cadenceDay: number;
  cadenceTitle: string;
  userId: string;
}

export function useOverdueTasks(userId?: string) {
  return useQuery({
    queryKey: ['tasks', 'overdue', userId],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      let query = supabase
        .from('tasks')
        .select(`
          *,
          leads (name, company),
          products (name)
        `)
        .eq('status', 'pending')
        .lt('due_date', now)
        .order('due_date', { ascending: true });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userId
  });
}

export function useUpcomingTasks(userId?: string, hours: number = 24) {
  return useQuery({
    queryKey: ['tasks', 'upcoming', userId, hours],
    queryFn: async () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
      
      let query = supabase
        .from('tasks')
        .select(`
          *,
          leads (name, company),
          products (name)
        `)
        .eq('status', 'pending')
        .gte('due_date', now.toISOString())
        .lte('due_date', futureTime.toISOString())
        .order('due_date', { ascending: true });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userId
  });
}

export function useLeadsNeedingTasks(userId?: string, productId?: string) {
  return useQuery({
    queryKey: ['leads-needing-tasks', userId, productId],
    queryFn: async () => {
      // Get leads that are assigned and have cadence day set
      let leadsQuery = supabase
        .from('leads')
        .select(`
          id,
          name,
          company,
          cadence_day,
          product_id,
          assigned_to,
          products (name)
        `)
        .not('cadence_day', 'is', null);
      
      if (userId) {
        leadsQuery = leadsQuery.eq('assigned_to', userId);
      }
      if (productId) {
        leadsQuery = leadsQuery.eq('product_id', productId);
      }
      
      const { data: leads, error: leadsError } = await leadsQuery;
      if (leadsError) throw leadsError;
      
      if (!leads || leads.length === 0) return [];
      
      // Get existing pending tasks for these leads
      const leadIds = leads.map(l => l.id);
      const { data: existingTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('lead_id, type')
        .in('lead_id', leadIds)
        .in('status', ['pending', 'in_progress']);
      
      if (tasksError) throw tasksError;
      
      const leadsWithPendingTasks = new Set(existingTasks?.map(t => t.lead_id) || []);
      
      // Filter leads that don't have pending cadence tasks
      return leads.filter(lead => !leadsWithPendingTasks.has(lead.id));
    },
    enabled: !!userId
  });
}

export function useGenerateCadenceTasks() {
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  
  return useMutation({
    mutationFn: async (tasks: CadenceTask[]) => {
      const results = [];
      
      for (const task of tasks) {
        const dueDate = new Date();
        dueDate.setHours(dueDate.getHours() + 2); // Default due in 2 hours
        
        const result = await createTask.mutateAsync({
          title: `Dia ${task.cadenceDay}: ${task.cadenceTitle || 'Follow-up'} - ${task.leadName}`,
          description: `Executar ação do dia ${task.cadenceDay} da cadência para ${task.leadName}`,
          type: 'cadence',
          priority: task.cadenceDay <= 2 ? 'high' : 'medium',
          lead_id: task.leadId,
          product_id: task.productId,
          user_id: task.userId,
          due_date: dueDate.toISOString(),
          status: 'pending'
        });
        
        results.push(result);
      }
      
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['leads-needing-tasks'] });
    }
  });
}

export function useMarkTasksOverdue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('tasks')
        .update({ status: 'overdue' })
        .eq('status', 'pending')
        .lt('due_date', now)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}

export function useTaskStats(userId?: string) {
  return useQuery({
    queryKey: ['task-stats', userId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      let query = supabase.from('tasks').select('status, due_date, completed_at');
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const todayStr = today.toISOString();
      const tomorrowStr = tomorrow.toISOString();
      
      const todayTasks = data?.filter(t => 
        t.due_date && t.due_date >= todayStr && t.due_date < tomorrowStr
      ) || [];
      
      const completedToday = todayTasks.filter(t => t.status === 'completed').length;
      const pendingToday = todayTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
      const overdueCount = data?.filter(t => t.status === 'overdue').length || 0;
      const totalCompleted = data?.filter(t => t.status === 'completed').length || 0;
      
      return {
        completedToday,
        pendingToday,
        totalToday: todayTasks.length,
        overdueCount,
        totalCompleted,
        completionRate: data?.length ? Math.round((totalCompleted / data.length) * 100) : 0
      };
    },
    enabled: !!userId
  });
}
