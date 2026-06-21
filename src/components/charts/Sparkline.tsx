import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  showDot?: boolean;
  animated?: boolean;
}

export function Sparkline({ 
  data, 
  width = 60, 
  height = 24, 
  className,
  showDot = true,
  animated = true 
}: SparklineProps) {
  const { path, dotPosition, trend, minY, maxY } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', dotPosition: { x: 0, y: 0 }, trend: 'neutral' as const, minY: 0, maxY: 0 };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return { x, y };
    });

    const pathD = points.reduce((acc, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      
      // Smooth curve
      const prev = points[index - 1];
      const cpx = (prev.x + point.x) / 2;
      return `${acc} Q ${cpx} ${prev.y} ${point.x} ${point.y}`;
    }, '');

    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    
    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (data[data.length - 1] > data[0]) trend = 'up';
    else if (data[data.length - 1] < data[0]) trend = 'down';

    return {
      path: pathD,
      dotPosition: lastPoint,
      trend,
      minY: min,
      maxY: max,
    };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return null;
  }

  const strokeColor = trend === 'up' 
    ? 'hsl(var(--primary))' 
    : trend === 'down' 
      ? 'hsl(var(--destructive))' 
      : 'hsl(var(--muted-foreground))';

  return (
    <svg 
      width={width} 
      height={height} 
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
    >
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`sparkline-gradient-${trend}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <motion.path
        d={`${path} L ${dotPosition.x} ${height} L ${2} ${height} Z`}
        fill={`url(#sparkline-gradient-${trend})`}
        initial={animated ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
      
      {/* Line */}
      <motion.path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      
      {/* End dot */}
      {showDot && (
        <motion.circle
          cx={dotPosition.x}
          cy={dotPosition.y}
          r="2.5"
          fill={strokeColor}
          initial={animated ? { scale: 0, opacity: 0 } : undefined}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        />
      )}
    </svg>
  );
}

// Generate mock sparkline data for demos
export function generateSparklineData(length: number = 7, trend: 'up' | 'down' | 'neutral' = 'neutral'): number[] {
  const data: number[] = [];
  let value = 50 + Math.random() * 50;
  
  for (let i = 0; i < length; i++) {
    const change = (Math.random() - 0.5) * 20;
    const trendBias = trend === 'up' ? 3 : trend === 'down' ? -3 : 0;
    value = Math.max(10, Math.min(100, value + change + trendBias));
    data.push(Math.round(value));
  }
  
  return data;
}
