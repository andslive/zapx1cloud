import { useState, useEffect } from 'react';
import { User, ChevronLeft, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { cn } from '@/lib/utils';
import { UserStatusIndicator } from '@/components/layout/UserStatusIndicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  /** Lista de produtos disponíveis para troca rápida */
  products?: DBProduct[];
  selectedProduct?: DBProduct | null;
  onSelectProduct?: (product: DBProduct) => void;
}

export function MobileHeader({
  title,
  subtitle,
  showBack,
  onBack,
  products = [],
  selectedProduct,
  onSelectProduct,
}: MobileHeaderProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsCollapsed(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const canSwitchProduct = !!onSelectProduct && products.length > 1;

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md',
        'transition-[padding] duration-200'
      )}
      style={{
        // Garante que o conteúdo fique abaixo da status bar do iOS / notch.
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        className={cn(
          'flex items-center justify-between px-3 transition-all duration-200',
          isCollapsed ? 'h-12' : 'h-14'
        )}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onBack}
              aria-label="Voltar"
            >
              <ChevronLeft size={20} />
            </Button>
          )}

          {canSwitchProduct ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 min-w-0 max-w-full text-left px-2 py-1 rounded-lg active:bg-muted/50 transition-colors"
                  aria-label="Trocar produto"
                >
                  <div className="min-w-0">
                    <h1
                      className={cn(
                        'font-semibold text-foreground truncate transition-all duration-200',
                        isCollapsed ? 'text-sm' : 'text-base'
                      )}
                    >
                      {title}
                    </h1>
                    {subtitle && !isCollapsed && (
                      <p className="text-xs text-muted-foreground truncate">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-64 max-h-[60vh] overflow-y-auto"
              >
                <DropdownMenuLabel>Trocar produto</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {products.map((p) => {
                  const isActive = selectedProduct?.id === p.id;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => onSelectProduct?.(p)}
                      className="flex items-start gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        {p.description && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.description}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <Check size={16} className="text-primary shrink-0 mt-0.5" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="min-w-0 px-1">
              <h1
                className={cn(
                  'font-semibold text-foreground truncate transition-all duration-200',
                  isCollapsed ? 'text-sm' : 'text-base'
                )}
              >
                {title}
              </h1>
              {subtitle && !isCollapsed && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <ThemeToggle />
          <UserStatusIndicator />
          <NotificationCenter />
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Perfil">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <User size={14} className="text-primary-foreground" />
            </div>
          </Button>
        </div>
      </div>
    </header>
  );
}
