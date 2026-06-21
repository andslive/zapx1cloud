import { CheckCircle2, Circle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTasks, useCompleteTask } from '@/hooks/useTasks';
import { format, isToday, isPast, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MobileTaskListProps {
  userId: string;
  productId: string;
}

export function MobileTaskList({ userId, productId }: MobileTaskListProps) {
  const { data: tasksData, isLoading } = useTasks(userId, productId);
  const completeTaskMutation = useCompleteTask();

  const tasks = tasksData || [];

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return 'text-red-500 bg-red-500/10';
      case 'high': return 'text-orange-500 bg-orange-500/10';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10';
      case 'low': return 'text-green-500 bg-green-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getPriorityLabel = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return 'Urgente';
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return 'Normal';
    }
  };

  const getDateLabel = (dueDate: string | null) => {
    if (!dueDate) return null;
    
    const date = new Date(dueDate);
    
    if (isToday(date)) return { label: 'Hoje', color: 'text-primary' };
    if (isTomorrow(date)) return { label: 'Amanhã', color: 'text-yellow-500' };
    if (isPast(date)) return { label: 'Atrasada', color: 'text-destructive' };
    
    return { 
      label: format(date, 'dd/MM', { locale: ptBR }), 
      color: 'text-muted-foreground' 
    };
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={20} className="text-green-500" />;
      case 'overdue': return <AlertTriangle size={20} className="text-destructive" />;
      case 'in_progress': return <Clock size={20} className="text-primary" />;
      default: return <Circle size={20} className="text-muted-foreground" />;
    }
  };

  const handleComplete = (taskId: string) => {
    completeTaskMutation.mutate(taskId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter to show only pending tasks
  const pendingTasks = tasks.filter(t => t.status !== 'completed');

  if (pendingTasks.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <CheckCircle2 size={48} className="mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Nenhuma tarefa pendente</p>
        <p className="text-sm text-muted-foreground/70">Suas tarefas aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingTasks.map((task) => {
        const dateInfo = getDateLabel(task.due_date);
        const isCompleted = task.status === 'completed';

        return (
          <Card 
            key={task.id}
            className={cn(
              "p-4 bg-card border-border transition-all",
              isCompleted && "opacity-60"
            )}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => {
                  if (!isCompleted) handleComplete(task.id);
                }}
                className="mt-0.5 touch-target"
              >
                {getStatusIcon(task.status)}
              </button>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-medium text-foreground",
                  isCompleted && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </p>
                
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {task.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <Badge 
                    variant="secondary" 
                    className={cn("text-[10px] h-5", getPriorityColor(task.priority))}
                  >
                    {getPriorityLabel(task.priority)}
                  </Badge>
                  
                  {dateInfo && (
                    <span className={cn("text-xs font-medium", dateInfo.color)}>
                      {dateInfo.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
