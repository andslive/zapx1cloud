import { useState, useEffect } from 'react';
import { useTodaysTasks, useCompleteTask, useUncompleteTask, useTasks, useCreateTask } from '@/hooks/useTasks';
import { useTaskStats, useMarkTasksOverdue } from '@/hooks/useTaskAutomation';
import { useLeads } from '@/hooks/useLeads';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertTriangle,
  User,
  Calendar,
  Loader2,
  ListTodo,
  Zap,
  TrendingUp,
  Bell,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isPast, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TaskGenerationWidget } from '@/components/tasks/TaskGenerationWidget';

interface TaskCenterProps {
  userId: string;
  productId?: string;
  productName?: string;
  compact?: boolean;
}

export function TaskCenter({ userId, productId, productName, compact = false }: TaskCenterProps) {
  const [filter, setFilter] = useState<'today' | 'all' | 'overdue'>('today');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    lead_id: ''
  });
  
  const { profile } = useAuth();
  const { data: todaysTasks, isLoading: loadingToday } = useTodaysTasks(userId);
  const { data: allTasks, isLoading: loadingAll } = useTasks(userId, productId);
  const { data: stats } = useTaskStats(userId);
  const { data: leads } = useLeads(productId);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const createTask = useCreateTask();
  const markOverdue = useMarkTasksOverdue();

  // Mark overdue tasks on mount
  useEffect(() => {
    markOverdue.mutate();
  }, []);

  const isLoading = loadingToday || loadingAll;

  const tasks = filter === 'today' 
    ? todaysTasks 
    : filter === 'overdue'
      ? allTasks?.filter(t => t.status === 'overdue')
      : allTasks;

  const handleToggleComplete = async (taskId: string, currentStatus: string | null) => {
    try {
      if (currentStatus === 'completed') {
        await uncompleteTask.mutateAsync(taskId);
        toast.success('Tarefa reaberta!');
      } else {
        await completeTask.mutateAsync(taskId);
        toast.success('Tarefa concluída! 🎉');
      }
    } catch (error) {
      toast.error('Erro ao atualizar tarefa');
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    try {
      await createTask.mutateAsync({
        title: newTask.title,
        description: newTask.description || null,
        priority: newTask.priority,
        due_date: new Date(newTask.due_date).toISOString(),
        lead_id: newTask.lead_id || null,
        product_id: productId || null,
        user_id: userId,
        status: 'pending',
        type: 'manual'
      });
      toast.success('Tarefa criada com sucesso!');
      setIsCreateModalOpen(false);
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        due_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        lead_id: ''
      });
    } catch (error) {
      toast.error('Erro ao criar tarefa');
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'high': return 'bg-warning/10 text-warning border-warning/20';
      case 'medium': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityLabel = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return 'Urgente';
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      default: return 'Baixa';
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={18} className="text-success" />;
      case 'overdue': return <AlertTriangle size={18} className="text-destructive" />;
      case 'in_progress': return <Clock size={18} className="text-primary" />;
      default: return <Circle size={18} className="text-muted-foreground" />;
    }
  };

  // Stats from hook
  const completedToday = stats?.completedToday || 0;
  const totalToday = stats?.totalToday || 0;
  const overdueCount = stats?.overdueCount || 0;
  const completionRate = stats?.completionRate || 0;

  // Filter overdue from allTasks
  const overdueTasks = allTasks?.filter(t => 
    t.status === 'overdue' || (t.status === 'pending' && t.due_date && isPast(new Date(t.due_date)))
  );

  const getTimeLabel = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    return formatDistanceToNow(date, { locale: ptBR, addSuffix: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-4">
        <TaskGenerationWidget productId={productId} productName={productName} />
        
        <div className="space-y-3">
          {tasks?.slice(0, 5).map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                task.status === 'overdue' 
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <button
                onClick={() => handleToggleComplete(task.id, task.status)}
                className="transition-transform hover:scale-110"
                disabled={completeTask.isPending || uncompleteTask.isPending}
              >
                {getStatusIcon(task.status)}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium truncate",
                  task.status === 'completed' && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {task.due_date && getTimeLabel(task.due_date)}
                </p>
              </div>
              <Badge variant="outline" className={cn("text-xs shrink-0", getPriorityColor(task.priority))}>
                {getPriorityLabel(task.priority)}
              </Badge>
            </div>
          ))}
          
          {(!tasks || tasks.length === 0) && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhuma tarefa para hoje 🎉
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Central de Tarefas</h2>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
            </Badge>
          )}
          
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus size={18} className="mr-2" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Ligar para lead, Enviar proposta..."
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    placeholder="Detalhes adicionais da tarefa..."
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select
                      value={newTask.priority}
                      onValueChange={(v) => setNewTask({ ...newTask, priority: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="due_date">Data e Hora</Label>
                    <Input
                      id="due_date"
                      type="datetime-local"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    />
                  </div>
                </div>
                
                {leads && leads.length > 0 && (
                  <div className="space-y-2">
                    <Label>Vincular a um Lead (opcional)</Label>
                    <Select
                      value={newTask.lead_id || "none"}
                      onValueChange={(v) => setNewTask({ ...newTask, lead_id: v === "none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {leads.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {lead.name} {lead.company && `- ${lead.company}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <Button 
                  className="w-full" 
                  onClick={handleCreateTask}
                  disabled={createTask.isPending}
                >
                  {createTask.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Criar Tarefa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Task List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ListTodo size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{completedToday}/{totalToday}</p>
                  <p className="text-xs text-muted-foreground">Hoje</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <TrendingUp size={20} className="text-success" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{completionRate}%</p>
                  <p className="text-xs text-muted-foreground">Taxa conclusão</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  overdueCount > 0 ? "bg-destructive/10" : "bg-muted"
                )}>
                  <AlertTriangle size={20} className={overdueCount > 0 ? "text-destructive" : "text-muted-foreground"} />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{overdueCount}</p>
                  <p className="text-xs text-muted-foreground">Atrasadas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="today">Hoje</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="overdue" className={overdueCount > 0 ? "text-destructive" : ""}>
                Atrasadas {overdueCount > 0 && `(${overdueCount})`}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Task List */}
          <div className="space-y-3">
            {tasks?.map((task, index) => (
              <div
                key={task.id}
                className={cn(
                  "p-4 rounded-xl border bg-card transition-all duration-200",
                  "hover:border-primary/30 hover:shadow-md",
                  task.status === 'completed' && "opacity-60",
                  task.status === 'overdue' && "border-destructive/30 bg-destructive/5",
                  "animate-slide-up"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleToggleComplete(task.id, task.status)}
                    className="mt-1 transition-transform hover:scale-110"
                    disabled={completeTask.isPending || uncompleteTask.isPending}
                  >
                    {getStatusIcon(task.status)}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={cn(
                        "font-medium text-foreground",
                        task.status === 'completed' && "line-through text-muted-foreground"
                      )}>
                        {task.title}
                      </h4>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getPriorityColor(task.priority))}
                      >
                        {getPriorityLabel(task.priority)}
                      </Badge>
                      {task.status === 'overdue' && (
                        <Badge variant="destructive" className="text-xs">
                          Atrasada
                        </Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {task.leads && (
                        <div className="flex items-center gap-1">
                          <User size={12} />
                          <span>{(task.leads as any).name}</span>
                        </div>
                      )}
                      {task.products && (
                        <div className="flex items-center gap-1">
                          <span className="text-primary">•</span>
                          <span>{(task.products as any).name}</span>
                        </div>
                      )}
                      {task.due_date && (
                        <div className={cn(
                          "flex items-center gap-1",
                          task.status === 'overdue' && "text-destructive"
                        )}>
                          <Calendar size={12} />
                          <span>{getTimeLabel(task.due_date)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {task.status !== 'completed' && (
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => handleToggleComplete(task.id, task.status)}
                      disabled={completeTask.isPending || uncompleteTask.isPending}
                    >
                      Concluir
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {(!tasks || tasks.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {filter === 'today' ? 'Nenhuma tarefa para hoje!' : 'Nenhuma tarefa encontrada'}
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {filter === 'today' 
                    ? 'Aproveite para revisar seus leads ou explorar o playbook.'
                    : 'Suas tarefas aparecerão aqui conforme você avançar com os leads.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Task Generation */}
        <div className="space-y-4">
          <TaskGenerationWidget productId={productId} productName={productName} />
        </div>
      </div>
    </div>
  );
}
