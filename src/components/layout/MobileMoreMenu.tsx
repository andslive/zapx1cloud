import { 
  CheckSquare, 
  Calendar, 
  BookOpen, 
  MessageSquare, 
  FileText, 
  DollarSign,
  Shield,
  LogOut,
  Smartphone,
  Phone,
  Mail,
  BarChart3,
  Target,
  User,
  ChevronRight,
  CalendarCheck,
  Settings
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useHaptics } from '@/hooks/useHaptics';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface MobileMoreMenuProps {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasProduct: boolean;
}

const quickActions = [
  { icon: Phone, label: 'Ligar', color: 'bg-green-500/20 text-green-500', action: 'call' },
  { icon: Mail, label: 'Email', color: 'bg-blue-500/20 text-blue-500', action: 'email' },
  { icon: BarChart3, label: 'Stats', color: 'bg-purple-500/20 text-purple-500', action: 'financial' },
  { icon: Target, label: 'Meta', color: 'bg-orange-500/20 text-orange-500', action: 'goals' },
];

const menuItems = [
  { id: 'bookings', label: 'Agendamentos', icon: CalendarCheck, color: 'text-pink-400' },
  { id: 'tasks', label: 'Tarefas', icon: CheckSquare, color: 'text-blue-400', badge: null },
  { id: 'cadence', label: 'Cadência', icon: Calendar, color: 'text-cyan-400' },
  { id: 'playbook', label: 'Playbook', icon: BookOpen, color: 'text-green-400' },
  { id: 'objections', label: 'Objeções', icon: MessageSquare, color: 'text-yellow-400' },
  { id: 'materials', label: 'Materiais', icon: FileText, color: 'text-purple-400' },
  { id: 'financial', label: 'Financeiro', icon: DollarSign, color: 'text-emerald-400' },
];

export function MobileMoreMenu({ open, onClose, activeTab, onTabChange, hasProduct }: MobileMoreMenuProps) {
  const { signOut, isAdmin, isManager, isSuperAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const haptics = useHaptics();

  const handleItemClick = (id: string) => {
    haptics.light();
    onTabChange(id);
    onClose();
  };

  const handleQuickAction = (action: string) => {
    haptics.medium();
    
    switch (action) {
      case 'call':
        // Open phone dialer
        window.location.href = 'tel:';
        toast.info('Selecione um lead para ligar', { description: 'Acesse a lista de leads primeiro' });
        break;
      case 'email':
        // Open email app
        window.location.href = 'mailto:';
        toast.info('Selecione um lead para enviar email', { description: 'Acesse a lista de leads primeiro' });
        break;
      case 'financial':
        onTabChange('financial');
        onClose();
        break;
      case 'goals':
        onTabChange('goals');
        onClose();
        break;
      default:
        break;
    }
  };

  const handleAdminClick = () => {
    haptics.medium();
    navigate('/admin-panel');
    onClose();
  };

  const handleInstallClick = () => {
    haptics.light();
    navigate('/install');
    onClose();
  };

  const handleLogout = async () => {
    haptics.heavy();
    await signOut();
    onClose();
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className="h-auto max-h-[85vh] rounded-t-3xl border-t-0 px-0 flex flex-col"
      >
        {/* Drag handle - Fixed at top */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <SheetHeader className="px-6 pb-4">
            {/* User info */}
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <User size={24} className="text-primary-foreground" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground">{profile?.full_name || 'Usuário'}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
          </SheetHeader>

          {/* Quick actions */}
          <div className="px-6 pb-4">
            <div className="grid grid-cols-4 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.action)}
                    className={cn(
                      'flex flex-col items-center gap-2 py-3 px-2 rounded-2xl transition-all pressable active:scale-95',
                      action.color,
                      'bg-opacity-100'
                    )}
                  >
                    <Icon size={22} />
                    <span className="text-xs font-medium">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="mx-6" />

          {/* Menu items */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={open ? "visible" : "hidden"}
            className="py-3 px-3"
          >
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isDisabled = !hasProduct;

              return (
                <motion.button
                  key={item.id}
                  variants={itemVariants}
                  onClick={() => handleItemClick(item.id)}
                  disabled={isDisabled}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all pressable-sm",
                    isActive 
                      ? "bg-primary/10" 
                      : "hover:bg-muted/50",
                    isDisabled && "opacity-40 pointer-events-none"
                  )}
                >
                  <div className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center',
                    isActive ? 'bg-primary/20' : 'bg-muted'
                  )}>
                    <Icon size={20} className={cn(isActive ? 'text-primary' : item.color)} />
                  </div>
                  <span className={cn(
                    "flex-1 text-left font-medium",
                    isActive ? "text-primary" : "text-foreground"
                  )}>
                    {item.label}
                  </span>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </motion.button>
              );
            })}
          </motion.div>

          <Separator className="mx-6" />

          {/* Settings section */}
          <div className="py-3 px-3 space-y-1">
            <button
              onClick={() => { haptics.light(); navigate('/perfil'); onClose(); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-foreground hover:bg-muted/50 transition-all pressable-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <User size={20} className="text-blue-400" />
              </div>
              <span className="flex-1 text-left font-medium">Meu Perfil</span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>

            <button
              onClick={() => { haptics.light(); navigate('/configuracoes'); onClose(); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-foreground hover:bg-muted/50 transition-all pressable-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Settings size={20} className="text-gray-400" />
              </div>
              <span className="flex-1 text-left font-medium">Configurações</span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>

            <button
              onClick={handleInstallClick}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-foreground hover:bg-muted/50 transition-all pressable-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Smartphone size={20} className="text-cyan-400" />
              </div>
              <span className="flex-1 text-left font-medium">Instalar App</span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>

            {(isAdmin() || isManager()) && (
              <button
                onClick={handleAdminClick}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-foreground hover:bg-muted/50 transition-all pressable-sm"
              >
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <Shield size={20} className="text-amber-400" />
                </div>
                <span className="flex-1 text-left font-medium">Painel Admin</span>
                <ChevronRight size={18} className="text-muted-foreground" />
              </button>
            )}

            {isSuperAdmin() && (
              <button
                onClick={() => { haptics.medium(); navigate('/super-admin'); onClose(); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-foreground hover:bg-muted/50 transition-all pressable-sm"
              >
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <Shield size={20} className="text-violet-400" />
                </div>
                <span className="flex-1 text-left font-medium">Super Admin</span>
                <ChevronRight size={18} className="text-muted-foreground" />
              </button>
            )}

            <Separator className="my-2" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all pressable-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <LogOut size={20} />
              </div>
              <span className="flex-1 text-left font-medium">Sair</span>
            </button>
          </div>
        </div>

        {/* Safe area padding - Fixed at bottom */}
        <div className="h-6 flex-shrink-0 safe-area-bottom" />
      </SheetContent>
    </Sheet>
  );
}
