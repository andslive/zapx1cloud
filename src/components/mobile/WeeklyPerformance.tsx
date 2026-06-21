import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/hooks/useAnimatedNumber';
import { startOfWeek, addDays, format, isToday, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DayData {
  day: string;
  shortDay: string;
  deals: number;
  value: number;
  isFuture: boolean;
  isToday: boolean;
}

interface WeeklyPerformanceProps {
  weeklyData?: { date: string; deals: number; value: number }[];
  totalDeals?: number;
  totalValue?: number;
  comparedToLastWeek?: number; // percentage
  delay?: number;
  isLoading?: boolean;
}

export function WeeklyPerformance({
  weeklyData,
  totalDeals = 0,
  totalValue = 0,
  comparedToLastWeek,
  delay = 0,
  isLoading = false,
}: WeeklyPerformanceProps) {
  // Generate week days
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday
  
  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayData = weeklyData?.find(d => d.date === format(date, 'yyyy-MM-dd'));
    
    days.push({
      day: format(date, 'EEE', { locale: ptBR }),
      shortDay: format(date, 'EEEEE', { locale: ptBR }).toUpperCase(),
      deals: dayData?.deals || 0,
      value: dayData?.value || 0,
      isFuture: isFuture(date),
      isToday: isToday(date),
    });
  }

  const maxDeals = Math.max(...days.map(d => d.deals), 1);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay * 0.1 }}
      >
        <Card className="p-4 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex items-end justify-between gap-2 h-16">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-muted rounded animate-pulse" 
                  style={{ height: `${Math.random() * 50 + 20}%` }}
                />
                <div className="h-3 w-4 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
    >
      <Card className="p-4 bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Sua Semana</h3>
          </div>
          
          {comparedToLastWeek !== undefined && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              comparedToLastWeek >= 0 
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            )}>
              {comparedToLastWeek >= 0 ? (
                <TrendingUp size={12} />
              ) : (
                <TrendingDown size={12} />
              )}
              {Math.abs(comparedToLastWeek)}%
            </div>
          )}
        </div>

        {/* Bar chart */}
        <div className="flex items-end justify-between gap-2 h-20 mb-3">
          {days.map((day, index) => {
            const height = day.isFuture ? 0 : (day.deals / maxDeals) * 100;
            
            return (
              <motion.div
                key={day.day}
                className="flex-1 flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: delay * 0.1 + index * 0.05 }}
              >
                <div className="relative w-full flex items-end justify-center" style={{ height: '100%' }}>
                  {day.isFuture ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                    </div>
                  ) : (
                    <motion.div
                      className={cn(
                        "w-full rounded-t-sm min-h-[4px]",
                        day.isToday 
                          ? "bg-primary" 
                          : day.deals > 0 
                            ? "bg-primary/60" 
                            : "bg-muted"
                      )}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(height, 5)}%` }}
                      transition={{ 
                        duration: 0.5, 
                        delay: delay * 0.1 + index * 0.08,
                        ease: "easeOut"
                      }}
                    />
                  )}
                  
                  {/* Deal count on top */}
                  {!day.isFuture && day.deals > 0 && (
                    <motion.span
                      className="absolute -top-4 text-[10px] font-bold text-foreground"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: delay * 0.1 + index * 0.08 + 0.3 }}
                    >
                      {day.deals}
                    </motion.span>
                  )}
                </div>
                
                <span className={cn(
                  "text-[10px] font-medium",
                  day.isToday 
                    ? "text-primary font-bold" 
                    : day.isFuture 
                      ? "text-muted-foreground/40" 
                      : "text-muted-foreground"
                )}>
                  {day.shortDay}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Summary */}
        <motion.div
          className="pt-3 border-t border-border flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay * 0.1 + 0.5 }}
        >
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalDeals} vendas</span>
          </span>
          <span className="text-sm font-bold text-primary">
            {formatCurrency(totalValue)}
          </span>
        </motion.div>
      </Card>
    </motion.div>
  );
}
