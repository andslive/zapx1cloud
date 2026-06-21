import { useEffect } from 'react';
import { useOverdueTasks, useUpcomingTasks, useMarkTasksOverdue } from '@/hooks/useTaskAutomation';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Bell } from 'lucide-react';

export function TaskAlerts() {
  const { user } = useAuth();
  const { data: overdueTasks } = useOverdueTasks(user?.id);
  const { data: upcomingTasks } = useUpcomingTasks(user?.id, 2); // Next 2 hours
  const markOverdue = useMarkTasksOverdue();

  // Check and mark overdue tasks periodically
  useEffect(() => {
    if (!user?.id) return;
    
    // Mark overdue tasks on mount
    markOverdue.mutate();
    
    // Check every 5 minutes
    const interval = setInterval(() => {
      markOverdue.mutate();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user?.id]);

  // Show alerts for overdue tasks
  useEffect(() => {
    if (overdueTasks && overdueTasks.length > 0) {
      const count = overdueTasks.length;
      toast.warning(
        `Você tem ${count} tarefa${count > 1 ? 's' : ''} atrasada${count > 1 ? 's' : ''}!`,
        {
          id: 'overdue-tasks-alert',
          duration: 10000,
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          action: {
            label: 'Ver tarefas',
            onClick: () => {
              // Could navigate to task center
              window.dispatchEvent(new CustomEvent('open-task-center'));
            }
          }
        }
      );
    }
  }, [overdueTasks?.length]);

  // Show notification for upcoming tasks
  useEffect(() => {
    if (upcomingTasks && upcomingTasks.length > 0) {
      upcomingTasks.forEach(task => {
        const dueDate = new Date(task.due_date!);
        const now = new Date();
        const minutesUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / 60000);
        
        if (minutesUntilDue <= 30 && minutesUntilDue > 0) {
          toast.info(
            `"${task.title}" vence em ${minutesUntilDue} minutos`,
            {
              id: `upcoming-task-${task.id}`,
              duration: 8000,
              icon: <Clock className="h-5 w-5 text-warning" />
            }
          );
        }
      });
    }
  }, [upcomingTasks]);

  return null; // This component only handles side effects
}
