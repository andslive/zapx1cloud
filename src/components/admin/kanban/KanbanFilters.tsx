import { Search, X, ArrowUpDown, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KanbanFilters as KanbanFiltersType } from '@/hooks/useKanbanFilters';

interface KanbanFiltersProps {
  filters: KanbanFiltersType;
  onFilterChange: <K extends keyof KanbanFiltersType>(key: K, value: KanbanFiltersType[K]) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  team: { id: string; full_name: string; avatar_url: string | null }[];
}

export function KanbanFilters({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  team,
}: KanbanFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead, empresa, email..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[140px] justify-start text-left font-normal">
            <Calendar className="mr-2 h-4 w-4" />
            {filters.dateFrom ? format(filters.dateFrom, 'dd/MM/yyyy') : 'Data início'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={filters.dateFrom || undefined}
            onSelect={(date) => onFilterChange('dateFrom', date || null)}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Date To */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[140px] justify-start text-left font-normal">
            <Calendar className="mr-2 h-4 w-4" />
            {filters.dateTo ? format(filters.dateTo, 'dd/MM/yyyy') : 'Data fim'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={filters.dateTo || undefined}
            onSelect={(date) => onFilterChange('dateTo', date || null)}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Min Value */}
      <div className="relative min-w-[150px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
        <Input
          type="number"
          placeholder="Valor mínimo"
          value={filters.minValue ?? ''}
          onChange={(e) => onFilterChange('minValue', e.target.value ? Number(e.target.value) : null)}
          className="pl-10"
        />
      </div>

      {/* Sort By */}
      <Select value={filters.sortBy} onValueChange={(v) => onFilterChange('sortBy', v as KanbanFiltersType['sortBy'])}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Ordenar por" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_at">Data Criação</SelectItem>
          <SelectItem value="deal_value">Valor</SelectItem>
          <SelectItem value="last_contact_at">Último Contato</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort Direction */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onFilterChange('sortDirection', filters.sortDirection === 'asc' ? 'desc' : 'asc')}
        title={filters.sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
      >
        <ArrowUpDown className={`h-4 w-4 transition-transform ${filters.sortDirection === 'asc' ? 'rotate-180' : ''}`} />
      </Button>

      {/* Seller Filter */}
      <Select value={filters.sellerId || 'all'} onValueChange={(v) => onFilterChange('sellerId', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Todos vendedores" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos vendedores</SelectItem>
          {team.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
