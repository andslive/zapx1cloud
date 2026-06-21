import { LayoutDashboard, Users, Bot, MessageSquare, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { motion } from 'framer-motion';
import { prefetchIndexTab } from '@/lib/prefetch';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMoreClick: () => void;
  hasProduct: boolean;
}

const navItems = [
  { id: 'product-dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'inbox', label: 'Conversas', icon: MessageSquare },
  { id: 'ai', label: 'IA', icon: Bot },
  { id: 'more', label: 'Mais', icon: Menu },
];

export function MobileBottomNav({ activeTab, onTabChange, onMoreClick, hasProduct }: MobileBottomNavProps) {
  const haptics = useHaptics();

  const handleClick = (id: string) => {
    haptics.selection();
    
    if (id === 'more') {
      onMoreClick();
    } else if (hasProduct) {
      onTabChange(id);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || (item.id === 'more' && ['calendar', 'tasks', 'cadence', 'playbook', 'objections', 'materials', 'financial'].includes(activeTab));
          const isDisabled = !hasProduct && item.id !== 'more';

          return (
            <motion.button
              key={item.id}
              onClick={() => handleClick(item.id)}
              onTouchStart={() => item.id !== 'more' && prefetchIndexTab(item.id)}
              onMouseEnter={() => item.id !== 'more' && prefetchIndexTab(item.id)}
              disabled={isDisabled}
              whileTap={{ scale: 0.9 }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl transition-all duration-200 min-w-[56px]",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground",
                isDisabled && "opacity-40 pointer-events-none"
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 rounded-xl"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              
              <div className="relative z-10">
                <Icon 
                  size={22} 
                  strokeWidth={isActive ? 2.5 : 2}
                  className={cn(
                    "transition-transform duration-200",
                    isActive && "scale-110"
                  )}
                />
                
                {/* Glow effect for active */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -inset-1 bg-primary/20 rounded-full blur-md -z-10"
                  />
                )}
              </div>
              
              <span className={cn(
                "relative z-10 text-[10px] font-medium leading-none transition-all duration-200",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
