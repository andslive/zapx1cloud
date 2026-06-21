import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { 
  LayoutDashboard, 
  Calendar, 
  BookOpen, 
  MessageSquareWarning, 
  FolderOpen, 
  Bot, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Package,
  Users,
  CheckSquare,
  ArrowLeft,
  DollarSign,
  Shield,
  MessageSquare,
  CalendarCheck,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import { Tables } from '@/integrations/supabase/types';
import { prefetchIndexTab } from '@/lib/prefetch';

type DBProduct = Tables<'products'>;

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedProduct?: DBProduct | null;
  hasMultipleProducts?: boolean;
  onBackToProducts?: () => void;
  assignedProducts?: DBProduct[];
  onSelectProduct?: (product: DBProduct) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

// Menu quando tem produto selecionado
const productNavItems = [
  { id: 'product-dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'leads', label: 'Pipeline', icon: Users },
  { id: 'inbox', label: 'Conversas', icon: MessageSquare },
  { id: 'tasks', label: 'Tarefas', icon: CheckSquare },
  { id: 'bookings', label: 'Agendamentos', icon: CalendarCheck },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'cadence', label: 'Cadência', icon: Calendar },
  { id: 'playbook', label: 'Playbook', icon: BookOpen },
  { id: 'objections', label: 'Objeções', icon: MessageSquareWarning },
  { id: 'materials', label: 'Materiais', icon: FolderOpen },
  { id: 'ai', label: 'IA Copiloto', icon: Bot },
];

export function Sidebar({ 
  activeTab, 
  onTabChange, 
  selectedProduct, 
  hasMultipleProducts,
  onBackToProducts,
  assignedProducts = [],
  onSelectProduct,
  onCollapsedChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin, isManager, isSuperAdmin } = useAuth();
  const showAdminLink = isAdmin() || isManager();
  const showSuperAdminLink = isSuperAdmin();

  const navItems = selectedProduct ? productNavItems : [];

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out",
        "bg-sidebar border-r border-sidebar-border flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && <Logo size="md" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Product badge removido — troca de produto agora é feita pelo dropdown no header */}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              onMouseEnter={() => prefetchIndexTab(item.id)}
              onTouchStart={() => prefetchIndexTab(item.id)}
              onFocus={() => prefetchIndexTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                "text-sidebar-foreground hover:bg-sidebar-accent",
                isActive && "bg-primary/10 text-primary"
              )}
            >
              <Icon size={20} className={cn(isActive && "text-primary")} />
              {!collapsed && (
                <span className={cn(
                  "text-sm font-medium",
                  isActive && "text-primary"
                )}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}

        {/* Lista de produtos atribuídos quando nenhum está selecionado */}
        {!selectedProduct && !collapsed && (
          <div className="px-1 py-2">
            {assignedProducts.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhum produto atribuído
                </p>
              </div>
            ) : (
              <>
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Meus Produtos
                </p>
                <div className="space-y-1">
                  {assignedProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => onSelectProduct?.(product)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left",
                        "text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <Package size={16} className="text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{product.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {/* Super Admin Link */}
        {showSuperAdminLink && (
          <Link
            to="/super-admin"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Shield size={20} className="text-violet-400" />
            {!collapsed && <span className="text-sm">Super Admin</span>}
          </Link>
        )}
        {/* Admin Link */}
        {showAdminLink && (
          <Link
            to="/admin?tab=capture"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Zap size={20} className="text-primary" />
            {!collapsed && <span className="text-sm">Funil</span>}
          </Link>
        )}
        <Link
          to="/configuracoes"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings size={20} />
          {!collapsed && <span className="text-sm">Configurações</span>}
        </Link>
      </div>
    </aside>
  );
}
