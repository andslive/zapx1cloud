import { useMemo, useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ChevronRight, ChevronLeft, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSectors } from '@/hooks/useSectors';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useTeamMembers } from '@/hooks/useTeam';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export interface InboxFiltersState {
  search: string;
  showResolved: boolean;
  selectedTagIds: string[];
  selectedSectorIds: string[];
  selectedUserIds: string[];
  selectedProductIds: string[];
}

export const defaultInboxFilters: InboxFiltersState = {
  search: '',
  showResolved: false,
  selectedTagIds: [],
  selectedSectorIds: [],
  selectedUserIds: [],
  selectedProductIds: [],
};

interface InboxFiltersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
  isAdmin: boolean;
  onCloseAllTickets?: () => void;
  trigger?: React.ReactNode;
}

type Section = 'root' | 'product' | 'tag' | 'sector' | 'user' | 'status';

export function InboxFiltersDrawer({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  isAdmin,
  onCloseAllTickets,
  trigger,
}: InboxFiltersDrawerProps) {
  const { profile } = useAuth();
  const { data: sectors = [] } = useSectors();
  const { data: tags = [] } = useLeadTags();
  const { data: members = [] } = useTeamMembers(profile?.organization_id);
  const { data: products = [] } = useProducts();

  const [section, setSection] = useState<Section>('root');
  const [subSearch, setSubSearch] = useState('');

  // Reseta navegação ao reabrir
  useEffect(() => {
    if (open) {
      setSection('root');
      setSubSearch('');
    }
  }, [open]);

  useEffect(() => {
    setSubSearch('');
  }, [section]);

  const update = (patch: Partial<InboxFiltersState>) =>
    onFiltersChange({ ...filters, ...patch });

  const toggle = (
    key: 'selectedTagIds' | 'selectedSectorIds' | 'selectedUserIds' | 'selectedProductIds',
    id: string,
  ) => {
    const current = filters[key];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    update({ [key]: next } as Partial<InboxFiltersState>);
  };

  const counts = {
    product: filters.selectedProductIds.length,
    tag: filters.selectedTagIds.length,
    sector: filters.selectedSectorIds.length,
    user: filters.selectedUserIds.length,
    status: filters.showResolved ? 1 : 0,
  };

  const totalActive =
    counts.product + counts.tag + counts.sector + (isAdmin ? counts.user : 0) + counts.status;

  const allSectorsSelected = useMemo(
    () =>
      sectors.length > 0 &&
      sectors.every((s: any) => filters.selectedSectorIds.includes(s.id)),
    [sectors, filters.selectedSectorIds],
  );

  // Header base
  const renderHeader = (title: string, onBack?: () => void) => (
    <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-background">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-primary hover:opacity-80"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
      ) : (
        <span className="text-base font-semibold text-foreground">Filtros</span>
      )}
      <button
        onClick={() => onOpenChange(false)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  // Linha de categoria (lista raiz)
  const CategoryRow = ({
    label,
    count,
    onClick,
  }: {
    label: string;
    count: number;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border hover:bg-muted/40 transition-colors text-left"
    >
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );

  // Linha de opção dentro de uma sub-tela (com checkbox)
  const OptionRow = ({
    label,
    checked,
    onToggle,
    color,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
    color?: string | null;
  }) => (
    <label className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/40">
      <span
        className="text-sm font-medium truncate pr-3"
        style={color ? { color } : undefined}
      >
        {label}
      </span>
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        style={color ? { borderColor: color } : undefined}
      />
    </label>
  );

  const filteredProducts = products.filter((p: any) =>
    !subSearch || p.name?.toLowerCase().includes(subSearch.toLowerCase()),
  );
  const filteredTags = tags.filter((t: any) =>
    !subSearch || t.name?.toLowerCase().includes(subSearch.toLowerCase()),
  );
  const filteredMembers = members.filter((m: any) =>
    !subSearch ||
    (m.full_name || '').toLowerCase().includes(subSearch.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(subSearch.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] p-0 flex flex-col gap-0 max-h-[70vh] overflow-hidden rounded-lg shadow-lg"
      >
        {section === 'root' && (
          <>
            {renderHeader('Filtros')}

            {/* Busca fixa */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar atendimento e mensagem"
                  value={filters.search}
                  onChange={(e) => update({ search: e.target.value })}
                  className="pl-9 h-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <CategoryRow label="Produto" count={counts.product} onClick={() => setSection('product')} />
              <CategoryRow label="Etiqueta" count={counts.tag} onClick={() => setSection('tag')} />
              <CategoryRow label="Setor" count={counts.sector} onClick={() => setSection('sector')} />
              {isAdmin && (
                <CategoryRow label="Usuário" count={counts.user} onClick={() => setSection('user')} />
              )}
              <CategoryRow label="Status" count={counts.status} onClick={() => setSection('status')} />

              {totalActive > 0 && (
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() =>
                      onFiltersChange({ ...defaultInboxFilters, search: filters.search })
                    }
                  >
                    Limpar filtros
                  </Button>
                </div>
              )}
            </ScrollArea>

            {isAdmin && onCloseAllTickets && (
              <div className="p-3 border-t border-border">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Encerrar Todos Atendimentos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Encerrar todos os atendimentos abertos?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação encerrará todas as conversas em andamento. Não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onCloseAllTickets}>Encerrar todos</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </>
        )}

        {/* PRODUTO */}
        {section === 'product' && (
          <>
            {renderHeader('Produto', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar produto"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filteredProducts.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhum produto encontrado
                </p>
              )}
              {filteredProducts.map((p: any) => (
                <OptionRow
                  key={p.id}
                  label={p.name}
                  checked={filters.selectedProductIds.includes(p.id)}
                  onToggle={() => toggle('selectedProductIds', p.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {/* ETIQUETA */}
        {section === 'tag' && (
          <>
            {renderHeader('Etiqueta', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar etiqueta"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filteredTags.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhuma etiqueta cadastrada
                </p>
              )}
              {filteredTags.map((t: any) => (
                <OptionRow
                  key={t.id}
                  label={t.name}
                  color={t.color}
                  checked={filters.selectedTagIds.includes(t.id)}
                  onToggle={() => toggle('selectedTagIds', t.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {/* SETOR */}
        {section === 'sector' && (
          <>
            {renderHeader('Setor', () => setSection('root'))}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Setores
              </span>
              {sectors.length > 0 && (
                <button
                  className="text-xs text-primary hover:underline font-medium"
                  onClick={() => {
                    update({
                      selectedSectorIds: allSectorsSelected
                        ? []
                        : sectors.map((s: any) => s.id),
                    });
                  }}
                >
                  {allSectorsSelected ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            <ScrollArea className="flex-1">
              <OptionRow
                label="Sem Setor"
                checked={filters.selectedSectorIds.includes('__none__')}
                onToggle={() => toggle('selectedSectorIds', '__none__')}
              />
              {sectors.map((s: any) => (
                <OptionRow
                  key={s.id}
                  label={s.name}
                  color={s.color}
                  checked={filters.selectedSectorIds.includes(s.id)}
                  onToggle={() => toggle('selectedSectorIds', s.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {/* USUÁRIO */}
        {section === 'user' && isAdmin && (
          <>
            {renderHeader('Usuário', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar usuário"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filteredMembers.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhum membro encontrado
                </p>
              )}
              {filteredMembers.map((m: any) => (
                <OptionRow
                  key={m.id}
                  label={m.full_name || m.email}
                  checked={filters.selectedUserIds.includes(m.id)}
                  onToggle={() => toggle('selectedUserIds', m.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {/* STATUS */}
        {section === 'status' && (
          <>
            {renderHeader('Status', () => setSection('root'))}
            <ScrollArea className="flex-1">
              <label className="flex items-center justify-between px-4 py-3.5 border-b border-border cursor-pointer hover:bg-muted/40">
                <div>
                  <span className="text-sm font-medium block">Ver Resolvidos</span>
                  <span className="text-xs text-muted-foreground">Exibir tickets finalizados</span>
                </div>
                <Switch
                  checked={filters.showResolved}
                  onCheckedChange={(v) => update({ showResolved: v })}
                />
              </label>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
