import { ProductCard } from './ProductCard';
import { Button } from '@/components/ui/button';
import { Plus, TrendingUp, Users, Target, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { useTodaysTasks } from '@/hooks/useTasks';
import { useTaskStats } from '@/hooks/useTaskAutomation';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { UpcomingEvents } from '@/components/calendar/UpcomingEvents';
import { useNavigate } from 'react-router-dom';

type DBProduct = Tables<'products'>;

interface DashboardProps {
  products: DBProduct[];
  onSelectProduct: (product: DBProduct) => void;
}

export function Dashboard({ products, onSelectProduct }: DashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: todaysTasks } = useTodaysTasks(user?.id || '');
  const { data: taskStats } = useTaskStats(user?.id);

  const pendingTasks = todaysTasks?.filter(t => t.status === 'pending' || t.status === 'in_progress') || [];
  const overdueCount = taskStats?.overdueCount || 0;

  const handleViewAgenda = () => {
    navigate('/admin');
    // Note: This navigates to admin, ideally we'd have a seller calendar view
  };

  const stats = [
    { label: 'Leads Ativos', value: '127', change: '+12%', icon: Users, trend: 'up' },
    { label: 'Taxa Conversão', value: '32%', change: '+5%', icon: TrendingUp, trend: 'up' },
    { label: 'Meta do Mês', value: '68%', change: 'R$ 45k restante', icon: Target, trend: 'neutral' },
    { label: 'Tempo Resposta', value: '4min', change: '-2min', icon: Clock, trend: 'up' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Bom dia, Vendedor! 👋</h2>
          <p className="text-muted-foreground mt-1">
            Você tem <span className="text-primary font-medium">{pendingTasks.length} tarefa{pendingTasks.length !== 1 ? 's' : ''}</span> pendente{pendingTasks.length !== 1 ? 's' : ''} hoje
            {overdueCount > 0 && (
              <span className="text-destructive font-medium ml-2">
                • {overdueCount} atrasada{overdueCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <Button variant="soft">
          <Plus size={18} className="mr-2" />
          Novo Produto
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.label}
              className="p-5 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon size={20} className="text-primary" />
                </div>
                <span className={`text-xs font-medium ${
                  stat.trend === 'up' ? 'text-success' : 'text-muted-foreground'
                }`}>
                  {stat.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Products Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Seus Produtos</h3>
            <p className="text-sm text-muted-foreground">Selecione um produto para começar a vender</p>
          </div>
          <Button variant="ghost" className="text-primary">
            Ver todos
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product, index) => (
            <div 
              key={product.id}
              className="animate-slide-up"
              style={{ animationDelay: `${(index + 4) * 50}ms` }}
            >
              <ProductCard product={product} onSelect={onSelectProduct} />
            </div>
          ))}
        </div>
      </div>

      {/* Today's Work and Upcoming Events Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Today's Tasks Preview - Real Data */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Trabalho de Hoje</h3>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle size={14} />
                {overdueCount} atrasada{overdueCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {pendingTasks.slice(0, 5).map((task) => (
              <div 
                key={task.id}
                className={cn(
                  "flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer",
                  task.status === 'overdue' 
                    ? "bg-destructive/10 hover:bg-destructive/15 border border-destructive/20"
                    : "bg-secondary/50 hover:bg-secondary"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    task.status === 'overdue' ? "bg-destructive/20" : "bg-primary/10"
                  )}>
                    <span className={cn(
                      "text-sm font-medium",
                      task.status === 'overdue' ? "text-destructive" : "text-primary"
                    )}>
                      {(task.leads as any)?.name?.split(' ').map((n: string) => n[0]).join('') || 'T'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {(task.products as any)?.name || 'Produto'} • {task.due_date && format(new Date(task.due_date), 'HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-medium",
                    task.status === 'overdue' ? "text-destructive" : "text-primary"
                  )}>
                    {task.type === 'cadence' ? 'Cadência' : 'Follow-up'}
                  </span>
                </div>
              </div>
            ))}
            
            {pendingTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center mb-3">
                  <CheckCircle2 size={24} className="text-success" />
                </div>
                <p className="text-muted-foreground">Nenhuma tarefa pendente para hoje! 🎉</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events Widget */}
        <div className="lg:col-span-1">
          <UpcomingEvents onViewAll={handleViewAgenda} maxEvents={4} />
        </div>
      </div>
    </div>
  );
}
