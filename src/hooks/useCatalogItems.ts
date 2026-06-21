import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface CatalogItem {
  id: string;
  organization_id: string;
  product_id: string | null;
  external_id: string | null;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string | null;
  thumbnail_url: string | null;
  images: string[];
  videos: string[];
  documents: Array<{ url: string; name: string; type?: string }>;
  attributes: Record<string, any>;
  tags: string[];
  source_type: 'manual' | 'firecrawl' | 'webhook' | 'api' | 'csv';
  source_url: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useCatalogItems(productId?: string | null, search?: string) {
  return useQuery({
    queryKey: ['catalog-items', productId, search],
    queryFn: async () => {
      let q = supabase.from('product_catalog_items').select('*').order('updated_at', { ascending: false });
      if (productId) q = q.eq('product_id', productId);
      if (search && search.trim()) {
        q = q.textSearch('search_vector', search, { config: 'portuguese', type: 'websearch' });
      }
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data || []) as unknown as CatalogItem[];
    },
  });
}

export function useCatalogItemMutations(productId?: string | null) {
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalog-items'] });

  const create = useMutation({
    mutationFn: async (input: Partial<CatalogItem> & { title: string; organization_id: string }) => {
      const { data, error } = await supabase
        .from('product_catalog_items')
        .insert({
          ...input,
          product_id: input.product_id ?? productId ?? null,
          source_type: input.source_type ?? 'manual',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item adicionado ao catálogo' });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CatalogItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('product_catalog_items')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item atualizado' });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_catalog_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item removido' });
    },
    onError: (e: any) => toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' }),
  });

  return { create, update, remove };
}

export function useCatalogSync() {
  return useMutation({
    mutationFn: async (input: {
      organization_id: string;
      product_id?: string | null;
      base_url: string;
      item_pattern?: string;
      catalog_type?: string;
      max_items?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('catalog-sync-website', { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Sincronização concluída',
        description: `${data.items_created || 0} novos · ${data.items_updated || 0} atualizados · ${data.items_failed || 0} falhas`,
      });
    },
    onError: (e: any) => toast({ title: 'Falha na sincronização', description: e.message, variant: 'destructive' }),
  });
}

export function useCatalogImport() {
  return useMutation({
    mutationFn: async (input: { organization_id: string; product_id?: string | null; items: any[] }) => {
      const { data, error } = await supabase.functions.invoke('catalog-import-csv', { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({ title: 'Importação concluída', description: `${data.inserted || 0} itens importados` });
    },
    onError: (e: any) => toast({ title: 'Falha na importação', description: e.message, variant: 'destructive' }),
  });
}
