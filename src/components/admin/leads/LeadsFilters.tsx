import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Search, SlidersHorizontal, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LeadFilters } from '@/hooks/useLeadsManager';
import { LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import { useLeadTags } from '@/hooks/useLeadTags';
import { cn } from '@/lib/utils';

interface LeadsFiltersProps {
  filters: LeadFilters;
  onFilterChange: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  onClearFilters: () => void;
  squads: { id: string; name: string }[];
  products: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}

const temperatures = [
  { value: 'hot', label: 'Quente', color: 'bg-red-500' },
  { value: 'warm', label: 'Morno', color: 'bg-amber-500' },
  { value: 'cold', label: 'Frio', color: 'bg-blue-500' },
];

export function LeadsFilters({
  filters,
  onFilterChange,
  onClearFilters,
  squads,
  products,
  stages,
}: LeadsFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const { data: leadTags } = useLeadTags();

  const activeFiltersCount = [
    filters.temperature.length > 0,
    filters.origin.length > 0,
    filters.channel.length > 0,
    filters.stageId,
    filters.squadId,
    filters.productId,
    filters.dateFrom,
    filters.dateTo,
    filters.tagIds.length > 0,
  ].filter(Boolean).length;

  const toggleArrayFilter = (key: 'temperature' | 'origin' | 'channel', value: string) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFilterChange(key, updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email, telefone..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters Button */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge className="h-5 min-w-5 p-0 flex items-center justify-center">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filtros Avançados</h4>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={onClearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Temperatura</label>
                <div className="flex flex-wrap gap-2">
                  {temperatures.map((temp) => (
                    <button
                      key={temp.value}
                      onClick={() => toggleArrayFilter('temperature', temp.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        filters.temperature.includes(temp.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn("w-2 h-2 rounded-full", temp.color)} />
                      {temp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Origin */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Origem</label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_ORIGINS.map((origin) => (
                    <button
                      key={origin.value}
                      onClick={() => toggleArrayFilter('origin', origin.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        filters.origin.includes(origin.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {origin.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Canal</label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_CHANNELS.map((channel) => (
                    <button
                      key={channel.value}
                      onClick={() => toggleArrayFilter('channel', channel.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        filters.channel.includes(channel.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {channel.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Etiquetas */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Etiquetas</label>
                {(!leadTags || leadTags.length === 0) ? (
                  <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {leadTags.map((tag) => {
                      const active = filters.tagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => {
                            const next = active
                              ? filters.tagIds.filter((id) => id !== tag.id)
                              : [...filters.tagIds, tag.id];
                            onFilterChange('tagIds', next);
                          }}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                            active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Squad */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Squad</label>
                <Select
                  value={filters.squadId || '__all__'}
                  onValueChange={(v) => onFilterChange('squadId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os squads" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os squads</SelectItem>
                    {squads.map((squad) => (
                      <SelectItem key={squad.id} value={squad.id}>
                        {squad.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Produto</label>
                <Select
                  value={filters.productId || '__all__'}
                  onValueChange={(v) => onFilterChange('productId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os produtos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os produtos</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Estágio</label>
                <Select
                  value={filters.stageId || '__all__'}
                  onValueChange={(v) => onFilterChange('stageId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os estágios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os estágios</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <div className="grid grid-cols-2 gap-2">
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateFrom ? (
                          format(filters.dateFrom, 'dd/MM/yy', { locale: ptBR })
                        ) : (
                          'De'
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.dateFrom || undefined}
                        onSelect={(date) => {
                          onFilterChange('dateFrom', date || null);
                          setDateFromOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateTo ? (
                          format(filters.dateTo, 'dd/MM/yy', { locale: ptBR })
                        ) : (
                          'Até'
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.dateTo || undefined}
                        onSelect={(date) => {
                          onFilterChange('dateTo', date || null);
                          setDateToOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.temperature.map((temp) => (
            <Badge key={temp} variant="secondary" className="gap-1">
              {temperatures.find(t => t.value === temp)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('temperature', temp)}
              />
            </Badge>
          ))}
          {filters.origin.map((origin) => (
            <Badge key={origin} variant="secondary" className="gap-1">
              {LEAD_ORIGINS.find(o => o.value === origin)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('origin', origin)}
              />
            </Badge>
          ))}
          {filters.channel.map((channel) => (
            <Badge key={channel} variant="secondary" className="gap-1">
              {LEAD_CHANNELS.find(c => c.value === channel)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('channel', channel)}
              />
            </Badge>
          ))}
          {filters.tagIds.map((tid) => {
            const t = leadTags?.find((x) => x.id === tid);
            if (!t) return null;
            return (
              <Badge key={tid} variant="secondary" className="gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFilterChange('tagIds', filters.tagIds.filter((id) => id !== tid))}
                />
              </Badge>
            );
          })}
          {filters.dateFrom && (
            <Badge variant="secondary" className="gap-1">
              De: {format(filters.dateFrom, 'dd/MM/yy')}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFilterChange('dateFrom', null)}
              />
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="gap-1">
              Até: {format(filters.dateTo, 'dd/MM/yy')}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFilterChange('dateTo', null)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
