import { CalendarIcon, RefreshCw, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CommercialFilterOption, CommercialFilters, CommercialPeriod } from '@/hooks/useCommercialDashboard';

interface Props {
  filters: CommercialFilters;
  onChange: (filters: CommercialFilters) => void;
  connections: CommercialFilterOption[];
  funnels: CommercialFilterOption[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

const ALL = '__all__';

export function DashboardFilters({ filters, onChange, connections, funnels, onRefresh, isRefreshing }: Props) {
  const range = filters.startDate && filters.endDate
    ? { from: new Date(`${filters.startDate}T12:00:00`), to: new Date(`${filters.endDate}T12:00:00`) }
    : undefined;

  const hasExtraFilters = !!filters.connectionId || !!filters.funnelId || filters.period === 'custom';

  const clearFilters = () => onChange({ period: 'today' });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.period}
        onValueChange={(v) => onChange({ ...filters, period: v as CommercialPeriod })}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="yesterday">Ontem</SelectItem>
          <SelectItem value="7d">Últimos 7 dias</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {filters.period === 'custom' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('h-9 justify-start text-left font-normal', !range && 'text-muted-foreground')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {range?.from
                ? range.to
                  ? `${range.from.toLocaleDateString('pt-BR')} - ${range.to.toLocaleDateString('pt-BR')}`
                  : range.from.toLocaleDateString('pt-BR')
                : 'Selecionar datas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) => {
                if (!r?.from) return;
                // format() usa o dia local do calendário — evita o
                // deslocamento de data que toISOString() causaria
                // dependendo do fuso do navegador.
                const startDate = format(r.from, 'yyyy-MM-dd');
                const endDate = format(r.to || r.from, 'yyyy-MM-dd');
                onChange({ ...filters, startDate, endDate });
              }}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}

      <Select
        value={filters.connectionId || ALL}
        onValueChange={(v) => onChange({ ...filters, connectionId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px] h-9">
          <SelectValue placeholder="Instância" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as instâncias</SelectItem>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.funnelId || ALL}
        onValueChange={(v) => onChange({ ...filters, funnelId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px] h-9">
          <SelectValue placeholder="Funil/oferta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os funis</SelectItem>
          {funnels.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasExtraFilters && (
        <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Limpar filtros
        </Button>
      )}

      <Button variant="outline" size="icon" className="h-9 w-9" onClick={onRefresh} title="Atualizar">
        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
      </Button>
    </div>
  );
}
