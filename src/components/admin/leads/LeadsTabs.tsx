import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Users, User, UserX, UsersRound, Package } from 'lucide-react';

interface LeadsTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  stats?: {
    total: number;
    unassigned: number;
  } | null;
}

const tabs = [
  { id: 'all', label: 'Todos', icon: Users },
  { id: 'my-leads', label: 'Minha Carteira', icon: User },
  { id: 'unassigned', label: 'Sem Atendimento', icon: UserX },
  { id: 'by-squad', label: 'Por Squad', icon: UsersRound },
  { id: 'by-product', label: 'Por Produto', icon: Package },
];

export function LeadsTabs({ activeTab, onTabChange, stats }: LeadsTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="w-full h-auto flex-wrap justify-start bg-muted/50 p-1 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const showBadge = tab.id === 'unassigned' && stats?.unassigned;
          
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {showBadge && (
                <Badge variant="destructive" className="h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                  {stats.unassigned}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
