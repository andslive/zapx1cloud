import { motion } from 'framer-motion';
import { Clock, CheckCircle2, Phone, Mail, MessageSquare, Calendar, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useHaptics } from '@/hooks/useHaptics';

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  type?: string | null;
  priority?: string | null;
  leads?: { name: string; company: string | null } | null;
}

interface NextTaskProps {
  task: Task | null;
  onComplete?: (taskId: string) => void;
  onViewAll?: () => void;
  delay?: number;
  isLoading?: boolean;
}

export function NextTask({
  task,
  onComplete,
  onViewAll,
  delay = 0,
  isLoading = false,
}: NextTaskProps) {
  const haptics = useHaptics();

  const getTaskIcon = (type?: string | null) => {
    switch (type) {
      case 'call':
        return Phone;
      case 'email':
        return Mail;
      case 'meeting':
        return Calendar;
      case 'message':
        return MessageSquare;
      default:
        return Clock;
    }
  };

  const getTimeLabel = (dueDate: string | null) => {
    if (!dueDate) return 'Sem prazo';
    
    const date = new Date(dueDate);
    
    if (isPast(date) && !isToday(date)) {
      return 'Atrasada';
    }
    
    if (isToday(date)) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    }
    
    if (isTomorrow(date)) {
      return 'Amanhã';
    }
    
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  };

  const getTimeColor = (dueDate: string | null) => {
    if (!dueDate) return 'text-muted-foreground';
    
    const date = new Date(dueDate);
    
    if (isPast(date) && !isToday(date)) {
      return 'text-destructive';
    }
    
    const hoursUntil = (date.getTime() - Date.now()) / (1000 * 60 * 60);
    
    if (hoursUntil < 2) {
      return 'text-yellow-500';
    }
    
    return 'text-muted-foreground';
  };

  const handleComplete = () => {
    if (task && onComplete) {
      haptics.medium();
      onComplete(task.id);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay * 0.1 }}
      >
        <Card className="p-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (!task) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay * 0.1 }}
      >
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-primary/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-green-500" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">
                Tudo em dia! 🎉
              </h4>
              <p className="text-xs text-muted-foreground">
                Nenhuma tarefa pendente no momento
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  const TaskIcon = getTaskIcon(task.type);
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
    >
      <Card className={cn(
        "p-4 relative overflow-hidden",
        isOverdue && "border-destructive/30 bg-destructive/5"
      )}>
        {/* Urgency pulse for overdue */}
        {isOverdue && (
          <motion.div
            className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [1, 0.5, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Próxima Tarefa
            </span>
          </div>
          {onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={onViewAll}
            >
              Ver todas
              <ArrowRight size={12} className="ml-1" />
            </Button>
          )}
        </div>

        <div className="flex items-start gap-3">
          <motion.div
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
              isOverdue ? "bg-destructive/20" : "bg-primary/10"
            )}
            whileHover={{ scale: 1.05 }}
          >
            <TaskIcon size={18} className={isOverdue ? "text-destructive" : "text-primary"} />
          </motion.div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground line-clamp-1">
              {task.title}
            </h4>
            
            {task.leads && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {task.leads.name}
                {task.leads.company && ` • ${task.leads.company}`}
              </p>
            )}
            
            <p className={cn("text-xs mt-1 font-medium", getTimeColor(task.due_date))}>
              ⏰ {getTimeLabel(task.due_date)}
            </p>
          </div>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant={isOverdue ? "destructive" : "default"}
              className="h-8 px-3"
              onClick={handleComplete}
            >
              <CheckCircle2 size={14} className="mr-1" />
              Concluir
            </Button>
          </motion.div>
        </div>
      </Card>
    </motion.div>
  );
}
