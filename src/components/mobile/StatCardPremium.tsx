import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAnimatedNumber, formatCurrency, formatPercentage } from '@/hooks/useAnimatedNumber';
import { Sparkline } from '@/components/charts/Sparkline';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardPremiumProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  format?: 'currency' | 'percentage' | 'number';
  trend?: number; // percentage change
  sparklineData?: number[];
  delay?: number;
  isLoading?: boolean;
  subtitle?: string;
}

export function StatCardPremium({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  format = 'number',
  trend,
  sparklineData,
  delay = 0,
  isLoading = false,
  subtitle,
}: StatCardPremiumProps) {
  const { value: animatedValue } = useAnimatedNumber(value, {
    duration: 1200,
    delay: delay * 100,
    decimals: format === 'percentage' ? 0 : 0,
    enabled: !isLoading,
  });

  const formattedValue = (() => {
    switch (format) {
      case 'currency':
        return formatCurrency(animatedValue);
      case 'percentage':
        return formatPercentage(animatedValue);
      default:
        return Math.round(animatedValue).toString();
    }
  })();

  const trendDirection = trend && trend > 0 ? 'up' : trend && trend < 0 ? 'down' : 'neutral';
  const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;

  if (isLoading) {
    return (
      <Card className="p-4 bg-card">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-6 w-12" />
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.4, 
        delay: delay * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
    >
      <Card className="p-4 bg-card overflow-hidden relative group">
        {/* Background gradient on hover */}
        <motion.div 
          className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            bgColor
          )}
          style={{ opacity: 0.05 }}
        />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-2">
            <motion.div 
              className={cn("h-9 w-9 rounded-xl flex items-center justify-center", bgColor)}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Icon size={18} className={color} />
            </motion.div>
            
            {sparklineData && sparklineData.length > 1 && (
              <Sparkline 
                data={sparklineData} 
                width={50} 
                height={24}
              />
            )}
          </div>
          
          <div className="space-y-1">
            <motion.p 
              className="text-xl font-bold text-foreground tracking-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay * 0.1 + 0.2 }}
            >
              {formattedValue}
            </motion.p>
            
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              
              {trend !== undefined && trend !== 0 && (
                <motion.div 
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    trendDirection === 'up' && "bg-green-500/10 text-green-600",
                    trendDirection === 'down' && "bg-red-500/10 text-red-600"
                  )}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: delay * 0.1 + 0.4 }}
                >
                  <TrendIcon size={10} />
                  <span>{Math.abs(trend)}%</span>
                </motion.div>
              )}
            </div>
            
            {subtitle && (
              <motion.p 
                className="text-[10px] text-muted-foreground/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: delay * 0.1 + 0.5 }}
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
