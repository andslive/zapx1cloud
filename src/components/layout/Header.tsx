import { User, Settings, LogOut, HelpCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { UserStatusIndicator } from '@/components/layout/UserStatusIndicator';
import { HeaderProductSwitcher } from '@/components/layout/HeaderProductSwitcher';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';
import { Tables } from '@/integrations/supabase/types';
import { useUnreadReleasesCount } from '@/hooks/useReleases';
import { Badge } from '@/components/ui/badge';

type DBProduct = Tables<'products'>;

interface HeaderProps {
  title: string;
  subtitle?: string;
  onSelectLead?: (leadId: string) => void;
  onSelectProduct?: (productId: string) => void;
  assignedProducts?: DBProduct[];
  selectedProduct?: DBProduct | null;
  onSelectProductObject?: (product: DBProduct) => void;
}

export function Header({
  title,
  subtitle,
  assignedProducts = [],
  selectedProduct = null,
  onSelectProductObject,
}: HeaderProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: unreadReleases = 0 } = useUnreadReleasesCount();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <WhatsAppDisconnectedBanner />
      <div className="flex items-center justify-between h-16 px-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Product Switcher (replaces global search) */}
          {assignedProducts.length > 0 && onSelectProductObject && (
            <HeaderProductSwitcher
              products={assignedProducts}
              selectedProduct={selectedProduct}
              onSelectProduct={onSelectProductObject}
            />
          )}

          {/* Help */}
          <Button variant="ghost" size="icon" onClick={() => navigate('/ajuda')} title="Central de Ajuda">
            <HelpCircle className="h-5 w-5" />
          </Button>

          {/* Updates */}
          <Button variant="ghost" size="icon" onClick={() => navigate('/novidades')} title="Novidades" className="relative">
            <Sparkles className="h-5 w-5" />
            {unreadReleases > 0 && (
              <Badge variant="default" className="absolute -top-1 -right-1 h-4 min-w-[1rem] px-1 text-[10px] flex items-center justify-center">
                {unreadReleases > 9 ? '9+' : unreadReleases}
              </Badge>
            )}
          </Button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Status */}
          <UserStatusIndicator />

          {/* Notifications */}
          <NotificationCenter />

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-xs">
                    {getInitials(profile?.full_name || 'U')}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{profile?.full_name || 'Usuário'}</span>
                  <span className="text-xs font-normal text-muted-foreground">{profile?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/perfil')}>
                <User size={16} />
                Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/configuracoes')}>
                <Settings size={16} />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut size={16} />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
