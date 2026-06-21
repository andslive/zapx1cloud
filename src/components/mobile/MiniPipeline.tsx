import { motion } from 'framer-motion';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/hooks/useAnimatedNumber';

interface PipelineStage {
  name: string;
  count: number;
  color: string;
  value?: number;
}

interface MiniPipelineProps {
  stages: PipelineStage[];
  totalValue?: number;
  onViewFull?: () => void;
  delay?: number;
  isLoading?: boolean;
}

export function MiniPipeline({
  stages,
  totalValue,
  onViewFull,
  delay = 0,
  isLoading = false,
}: MiniPipelineProps) {
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay * 0.1 }}
      >
        <Card className="p-4 bg-card">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-20 h-3 bg-muted rounded animate-pulse" />
                <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
                <div className="w-8 h-3 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    );
  }

  if (!stages || stages.length === 0) {
    return null;
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
            <TrendingUp size={16} className="text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Pipeline Atual</h3>
          </div>
          {onViewFull && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onViewFull}
            >
              Ver Kanban
              <ArrowRight size={12} className="ml-1" />
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {stages.slice(0, 5).map((stage, index) => {
            const percentage = (stage.count / maxCount) * 100;
            
            return (
              <motion.div
                key={stage.name}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay * 0.1 + index * 0.05 }}
              >
                <span className="text-xs text-muted-foreground w-20 truncate">
                  {stage.name}
                </span>
                
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: stage.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ 
                      duration: 0.6, 
                      delay: delay * 0.1 + index * 0.08,
                      ease: "easeOut"
                    }}
                  />
                </div>
                
                <span className="text-xs font-semibold text-foreground w-8 text-right">
                  {stage.count}
                </span>
              </motion.div>
            );
          })}
        </div>

        {totalValue !== undefined && totalValue > 0 && (
          <motion.div
            className="mt-4 pt-3 border-t border-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay * 0.1 + 0.4 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Valor Total no Pipeline
              </span>
              <span className="text-sm font-bold text-primary">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}
