
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, UserPlus, MessageSquare, Filter, Sparkles } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import { cn } from '@/lib/utils';

interface FABAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
}

interface FloatingActionButtonProps {
  activeTab: string;
  onAddLead?: () => void;
  onOpenAI?: () => void;
  onOpenFilters?: () => void;
  className?: string;
}

export function FloatingActionButton({
  activeTab,
  onAddLead,
  onOpenAI,
  onOpenFilters,
  className,
}: FloatingActionButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const haptics = useHaptics();

  const toggleExpanded = () => {
    haptics.medium();
    setIsExpanded(prev => !prev);
  };

  const handleAction = (action: () => void | undefined) => {
    if (action) {
      haptics.light();
      action();
      setIsExpanded(false);
    }
  };

  // Context-aware actions based on active tab
  const getActions = (): FABAction[] => {
    switch (activeTab) {
      case 'leads':
        return [
          {
            icon: <UserPlus size={20} />,
            label: 'Novo Lead',
            onClick: () => handleAction(onAddLead),
            color: 'bg-green-500',
          },
          {
            icon: <Filter size={20} />,
            label: 'Filtrar',
            onClick: () => handleAction(onOpenFilters),
            color: 'bg-blue-500',
          },
        ];
      case 'ai':
        return [
          {
            icon: <MessageSquare size={20} />,
            label: 'Nova Conversa',
            onClick: () => handleAction(onOpenAI),
            color: 'bg-purple-500',
          },
        ];
      case 'product-dashboard':
        return [
          {
            icon: <UserPlus size={20} />,
            label: 'Novo Lead',
            onClick: () => handleAction(onAddLead),
            color: 'bg-green-500',
          },
          {
            icon: <Sparkles size={20} />,
            label: 'IA Copiloto',
            onClick: () => handleAction(onOpenAI),
            color: 'bg-purple-500',
          },
        ];
      default:
        return [
          {
            icon: <UserPlus size={20} />,
            label: 'Novo Lead',
            onClick: () => handleAction(onAddLead),
            color: 'bg-green-500',
          },
        ];
    }
  };

  const actions = getActions();
  
  // Don't show FAB on certain tabs
  if (['goals', 'tasks', 'playbook', 'objections', 'materials', 'cadence', 'financial'].includes(activeTab)) {
    return null;
  }

  return (
    <div className={cn('fixed bottom-20 right-4 z-40', className)}>
      {/* Backdrop */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsExpanded(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 flex flex-col gap-3 items-end z-40"
          >
            {actions.map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  transition: { delay: index * 0.05 }
                }}
                exit={{ opacity: 0, x: 20 }}
                whileTap={{ scale: 0.95 }}
                onClick={action.onClick}
                className="flex items-center gap-3 group"
              >
                <span className="bg-card border border-border px-3 py-2 rounded-lg text-sm font-medium text-foreground shadow-lg">
                  {action.label}
                </span>
                <div className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg',
                  action.color || 'bg-primary'
                )}>
                  {action.icon}
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB */}
      <motion.button
        onClick={toggleExpanded}
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: isExpanded ? 45 : 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'relative z-50 h-14 w-14 rounded-full flex items-center justify-center shadow-lg',
          'bg-gradient-to-br from-primary to-primary/80',
          isExpanded && 'shadow-glow'
        )}
      >
        {isExpanded ? (
          <X size={24} className="text-primary-foreground" />
        ) : (
          <Plus size={24} className="text-primary-foreground" />
        )}
      </motion.button>
    </div>
  );
}
