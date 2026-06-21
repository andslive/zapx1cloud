import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Search, Plug, Sparkles, LayoutGrid, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { integrationsCatalog, type IntegrationItem } from '@/config/integrationsCatalog';
import { IntegrationCard } from './IntegrationCard';
import { IntegrationConfigDrawer } from './IntegrationConfigDrawer';
import { useIntegrations } from '@/hooks/useIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

type StatusFilter = 'all' | 'active' | 'inactive' | 'coming_soon';
type CategoryFilter = 'all' | string;

function useAllConfiguredIntegrations() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['all-integration-settings', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('integration_type, is_configured')
        .eq('organization_id', profile!.organization_id!);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((row) => {
        if (row.is_configured) map[row.integration_type] = true;
      });
      return map;
    },
    enabled: !!profile?.organization_id,
  });
}

export function IntegrationsManager() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selected, setSelected] = useState<IntegrationItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useIntegrations();
  const { data: configuredMap = {} } = useAllConfiguredIntegrations();

  const isItemActive = (item: IntegrationItem) => {
    if (item.alwaysActive) return true;
    if (configuredMap[item.id]) return true;
    if (item.id === 'whatsapp' && configuredMap['whatsapp_provider']) return true;
    if (item.id === 'botconversa' && configuredMap['whatsapp_provider']) return true;
    if (item.id === 'email-config' && configuredMap['email_config']) return true;
    if (item.id === 'sankhya' && configuredMap['sankhya']) return true;
    if (item.id === 'google-calendar' && configuredMap['google_calendar']) return true;
    if (item.id === 'facebook' && configuredMap['facebook_leads']) return true;
    return false;
  };

  const handleClick = (item: IntegrationItem) => {
    if (item.comingSoon) {
      toast.info(`${item.name} estará disponível em breve!`, {
        description: 'Vamos avisar você assim que liberarmos.',
      });
      return;
    }
    setSelected(item);
    setDrawerOpen(true);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return integrationsCatalog
      .map((cat) => {
        const items = cat.items.filter((item) => {
          if (statusFilter === 'coming_soon' && !item.comingSoon) return false;
          if (statusFilter === 'active' && (item.comingSoon || !isItemActive(item))) return false;
          if (statusFilter === 'inactive' && (item.comingSoon || isItemActive(item))) return false;
          if (categoryFilter !== 'all' && cat.id !== categoryFilter) return false;

          if (!term) return true;
          const haystack = [
            item.name,
            item.description,
            cat.label,
            ...(item.keywords ?? []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(term);
        });
        return { ...cat, items };
      })
      .filter((cat) => cat.items.length > 0);
  }, [search, statusFilter, categoryFilter, configuredMap]);

  const totals = useMemo(() => {
    const all = integrationsCatalog.flatMap((c) => c.items);
    const available = all.filter((i) => !i.comingSoon).length;
    const active = all.filter((i) => !i.comingSoon && isItemActive(i)).length;
    return { active, available, total: all.length };
  }, [configuredMap]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, { total: number; active: number }> = {};
    integrationsCatalog.forEach((cat) => {
      const total = cat.items.length;
      const active = cat.items.filter((i) => !i.comingSoon && isItemActive(i)).length;
      map[cat.id] = { total, active };
    });
    return map;
  }, [configuredMap]);

  const renderSidebar = (onSelect?: () => void) => (
    <nav className="space-y-1">
      <button
        onClick={() => {
          setCategoryFilter('all');
          onSelect?.();
        }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
          categoryFilter === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent text-foreground'
        )}
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Todos</span>
        <Badge
          variant={categoryFilter === 'all' ? 'secondary' : 'outline'}
          className="text-[10px] px-1.5 py-0 h-5"
        >
          {totals.total}
        </Badge>
      </button>

      <div className="pt-2 pb-1 px-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Categorias
        </p>
      </div>

      {integrationsCatalog.map((cat) => {
        const Icon = cat.icon;
        const isActive = categoryFilter === cat.id;
        const counts = categoryCounts[cat.id];
        return (
          <button
            key={cat.id}
            onClick={() => {
              setCategoryFilter(cat.id);
              onSelect?.();
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{cat.label}</span>
            <Badge
              variant={isActive ? 'secondary' : 'outline'}
              className="text-[10px] px-1.5 py-0 h-5"
            >
              {counts.active}/{counts.total}
            </Badge>
          </button>
        );
      })}
    </nav>
  );

  const activeCategoryLabel =
    categoryFilter === 'all'
      ? 'Todas as integrações'
      : integrationsCatalog.find((c) => c.id === categoryFilter)?.label ?? 'Integrações';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6 text-primary" />
            Integrações
          </h2>
          <p className="text-muted-foreground">
            Conecte ferramentas e serviços ao seu CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {totals.active} de {totals.available} ativas
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 rounded-xl border bg-card p-3">
            {renderSidebar()}
          </div>
        </aside>

        {/* Main content */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Mobile category trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden gap-2 justify-start">
                  <Menu className="h-4 w-4" />
                  <span className="truncate">{activeCategoryLabel}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-xs p-4 overflow-y-auto">
                <div className="mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Plug className="h-4 w-4 text-primary" />
                    Categorias
                  </h3>
                </div>
                {renderSidebar(() => setMobileMenuOpen(false))}
              </SheetContent>
            </Sheet>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar integração... (ex: stripe, gpt, whatsapp)"
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="inactive">Não configuradas</SelectItem>
                <SelectItem value="coming_soon">Em breve</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-medium">Nenhuma integração encontrada</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente outro termo ou peça uma nova integração para o suporte.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {filtered.map((cat) => {
                const Icon = cat.icon;
                return (
                  <section key={cat.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{cat.label}</h3>
                        {cat.description && (
                          <p className="text-xs text-muted-foreground">{cat.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {cat.items.length}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {cat.items.map((item) => (
                        <IntegrationCard
                          key={item.id}
                          item={item}
                          isActive={isItemActive(item)}
                          onClick={() => handleClick(item)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <IntegrationConfigDrawer
        item={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
