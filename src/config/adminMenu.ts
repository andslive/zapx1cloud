import {
  LayoutDashboard,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Settings,
  Bell,
  LayoutGrid,
  MessageSquare,
  BarChart3,
  CalendarDays,
  Zap,
  Webhook,
  FileText,
  Bot,
  Building2,
  Plug,
  Tag,
  Clock,
  CreditCard,
  LifeBuoy,
  Sparkles,
  SlidersHorizontal,
  Briefcase,
  Banknote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AdminMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  plusAction?: string; // Query param 'action' value for triggering a creation dialog
}

export interface AdminMenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminMenuItem[];
}

// Itens fixos (sempre visíveis, sem accordion)
export const fixedItems: AdminMenuItem[] = [
  { id: 'dashboard', label: 'Painel Comercial', icon: LayoutDashboard },
  { id: 'capture', label: 'Funil', icon: Zap, plusAction: 'new' },
  { id: 'inbox', label: 'Atendimentos', icon: MessageSquare },
  { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'connections', label: 'Conexões', icon: Plug, plusAction: 'new' },
  { id: 'integrations', label: 'Integrações', icon: Settings },
];

// Grupos em accordion
export const menuGroups: AdminMenuGroup[] = [
  {
    id: 'automation',
    label: 'Automação & IA',
    icon: Sparkles,
    items: [
      { id: 'agents', label: 'Agentes IA', icon: Bot },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    id: 'management',
    label: 'Gestão',
    icon: Briefcase,
    items: [
      { id: 'products', label: 'Produtos', icon: Package },
      { id: 'sectors', label: 'Setores', icon: SlidersHorizontal },
      { id: 'team', label: 'Equipes', icon: Users },
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
      { id: 'financial', label: 'Financeiro', icon: DollarSign },
      { id: 'payments', label: 'Pagamentos', icon: Banknote },
    ],
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    items: [
      { id: 'quick-replies', label: 'Respostas Rápidas', icon: MessageSquare },
      { id: 'custom-fields', label: 'Campos personalizados', icon: FileText },
      { id: 'tags', label: 'Etiquetas', icon: Tag },
      { id: 'notifications', label: 'Notificações', icon: Bell },
      { id: 'schedules', label: 'Horários', icon: Clock },
      { id: 'company', label: 'Empresa', icon: Building2 },
      { id: 'plan', label: 'Plano', icon: CreditCard },
      { id: 'support', label: 'Suporte', icon: LifeBuoy },
    ],
  },
];

export const allMenuItems: AdminMenuItem[] = [
  ...fixedItems,
  ...menuGroups.flatMap((g) => g.items),
];

// Helper: encontra o id do grupo que contém a seção ativa (para abrir o accordion)
export function findGroupIdForSection(sectionId: string): string | undefined {
  return menuGroups.find((g) => g.items.some((i) => i.id === sectionId))?.id;
}
