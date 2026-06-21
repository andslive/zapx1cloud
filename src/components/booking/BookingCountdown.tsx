import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BookingCountdownProps {
  targetDate: Date;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface TimeUnit {
  value: number;
  label: string;
}

export function BookingCountdown({ targetDate, className, size = 'md' }: BookingCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeUnit[]>([]);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference <= 0) {
        setIsExpired(true);
        return [
          { value: 0, label: 'DIAS' },
          { value: 0, label: 'HORAS' },
          { value: 0, label: 'MIN' },
          { value: 0, label: 'SEG' },
        ];
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      return [
        { value: days, label: 'DIAS' },
        { value: hours, label: 'HORAS' },
        { value: minutes, label: 'MIN' },
        { value: seconds, label: 'SEG' },
      ];
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const sizeClasses = {
    sm: {
      container: 'gap-1 sm:gap-2',
      box: 'w-11 h-11 sm:w-14 sm:h-14',
      value: 'text-base sm:text-xl',
      label: 'text-[8px] sm:text-[10px]',
    },
    md: {
      container: 'gap-1.5 sm:gap-3',
      box: 'w-14 h-14 sm:w-20 sm:h-20',
      value: 'text-xl sm:text-3xl',
      label: 'text-[9px] sm:text-xs',
    },
    lg: {
      container: 'gap-2 sm:gap-4',
      box: 'w-16 h-16 sm:w-24 sm:h-24',
      value: 'text-2xl sm:text-4xl',
      label: 'text-[10px] sm:text-sm',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={cn('flex justify-center', sizes.container, className)}>
      {timeLeft.map((unit, index) => (
        <div key={unit.label} className="flex items-center gap-2">
          <motion.div
            className={cn(
              'flex flex-col items-center justify-center rounded-xl bg-card border shadow-sm',
              sizes.box
            )}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={unit.value}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('font-bold tabular-nums', sizes.value)}
              >
                {String(unit.value).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
            <span className={cn('text-muted-foreground font-medium', sizes.label)}>
              {unit.label}
            </span>
          </motion.div>
          {index < timeLeft.length - 1 && (
            <span className="text-2xl text-muted-foreground font-bold hidden sm:block">:</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CountdownProgress({ 
  targetDate, 
  createdAt,
  className 
}: { 
  targetDate: Date; 
  createdAt?: Date;
  className?: string;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date();
      const start = createdAt || new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Default: 7 days before
      const total = targetDate.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      return Math.min(100, Math.max(0, (elapsed / total) * 100));
    };

    setProgress(calculateProgress());
    const timer = setInterval(() => {
      setProgress(calculateProgress());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, createdAt]);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">Progresso até a reunião</span>
        <span className="font-medium text-primary">{Math.round(progress)}% concluído</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
