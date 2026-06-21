import { useState, useMemo } from 'react';

export interface KanbanFilters {
  search: string;
  sellerId: string;
  minValue: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  sortBy: 'created_at' | 'deal_value' | 'last_contact_at';
  sortDirection: 'asc' | 'desc';
}

const defaultFilters: KanbanFilters = {
  search: '',
  sellerId: '',
  minValue: null,
  dateFrom: null,
  dateTo: null,
  sortBy: 'created_at',
  sortDirection: 'desc',
};

export function useKanbanFilters() {
  const [filters, setFilters] = useState<KanbanFilters>(defaultFilters);

  const updateFilter = <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.sellerId !== '' ||
      filters.minValue !== null ||
      filters.dateFrom !== null ||
      filters.dateTo !== null
    );
  }, [filters]);

  return {
    filters,
    updateFilter,
    clearFilters,
    hasActiveFilters,
  };
}
