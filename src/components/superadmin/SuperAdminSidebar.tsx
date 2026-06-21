import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  CreditCard, 
  FileText,
  Palette,
  Mail,
  ScrollText,
  Activity,
  ArrowLeft,
  LogOut,
  Moon,
  Sun,
  Megaphone,
  Smartphone,
  Layers,
  Banknote,
  HelpCircle,
  Sparkles,
  Menu,
  X,
  LifeBuoy,
  Wrench,
  BarChart3,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

interface SuperAdminSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'organizations', label: 'Empresas', icon: Building2 },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'plans', label: 'Planos', icon: Layers },
  { id: 'subscriptions', label: 'Assinaturas', icon: CreditCard },
  { id: 'billing', label: 'Faturamento', icon: FileText },
  { id: 'payments', label: 'Pagamentos (Cakto)', icon: Banknote },
  { id: 'whatsapp', label: 'Conexões', icon: Smartphone },
  { id: 'sales-leads', label: 'Leads Comerciais', icon: Megaphone },
  { id: 'help', label: 'Central de Ajuda', icon: HelpCircle },
  { id: 'support', label: 'Suporte', icon: LifeBuoy },
  { id: 'agent-tools', label: 'Ações dos Agentes', icon: Wrench },
  { id: 'ai-quality', label: 'Qualidade da IA', icon: BarChart3 },
  { id: 'releases', label: 'Atualizações', icon: Sparkles },
];

const settingsItems = [
  { id: 'branding', label: 'Identidade Visual', icon: Palette },
  { id: 'email', label: 'E-mail', icon: Mail },
  { id: 'audit', label: 'Logs de Auditoria', icon: ScrollText },
  { id: 'health', label: 'Saúde do Sistema', icon: Activity },
];

interface SidebarContentProps extends SuperAdminSidebarProps {
  onNavigate?: () => void;
}

function SidebarContent({ activeSection, onSectionChange, onNavigate }: SidebarContentProps) {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      onNavigate?.();
      navigate('/login', { replace: true });
    }
  };

  const handleSelect = (id: string) => {
    onSectionChange(id);
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Logo size="md" />
          <div className="min-w-0">
            <h1 className="font-bold text-foreground text-sm truncate">Super Admin</h1>
            <p className="text-xs text-muted-foreground truncate">Painel da Plataforma</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="pt-4 pb-2">
          <div className="border-t border-border" />
          <p className="text-xs text-muted-foreground mt-3 mb-2 px-3 uppercase tracking-wider">
            Configurações
          </p>
        </div>

        <div className="space-y-1">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <Link
          to="/"
          onClick={() => {
            try { sessionStorage.setItem('skip_super_admin_redirect', '1'); } catch {}
            onNavigate?.();
          }}
        >
          <Button variant="ghost" className="w-full justify-start gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao App
          </Button>
        </Link>

        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
        
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">v1.0</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SuperAdminSidebar({ activeSection, onSectionChange }: SuperAdminSidebarProps) {
  const [open, setOpen] = useState(false);
  const activeLabel =
    [...menuItems, ...settingsItems].find((i) => i.id === activeSection)?.label || 'Super Admin';

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-card border-b border-border flex items-center px-3 gap-2 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))]">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
            <SidebarContent
              activeSection={activeSection}
              onSectionChange={onSectionChange}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 min-w-0">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-foreground truncate">{activeLabel}</span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-card border-r border-border flex-col h-screen sticky top-0">
        <SidebarContent activeSection={activeSection} onSectionChange={onSectionChange} />
      </aside>
    </>
  );
}
