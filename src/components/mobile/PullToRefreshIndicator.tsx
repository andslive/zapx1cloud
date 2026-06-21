
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  canRefresh: boolean;
  progress: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  canRefresh,
  progress,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div 
      className="absolute left-0 right-0 flex justify-center overflow-hidden pointer-events-none"
      style={{ top: -60, height: pullDistance || 60 }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ 
          opacity: pullDistance > 20 || isRefreshing ? 1 : 0,
          y: isRefreshing ? 20 : Math.min(pullDistance - 40, 20),
        }}
        className="flex flex-col items-center gap-1"
      >
        <motion.div
          animate={{ 
            rotate: isRefreshing ? 360 : progress * 180,
          }}
          transition={isRefreshing ? { 
            duration: 1, 
            repeat: Infinity, 
            ease: 'linear' 
          } : { 
            duration: 0 
          }}
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center',
            canRefresh || isRefreshing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <RefreshCw size={16} />
        </motion.div>
        <span className="text-xs text-muted-foreground">
          {isRefreshing 
            ? 'Atualizando...' 
            : canRefresh 
              ? 'Solte para atualizar' 
              : 'Puxe para atualizar'
          }
        </span>
      </motion.div>
    </div>
  );
}
