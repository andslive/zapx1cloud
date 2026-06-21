import { useState } from 'react';
import { Search, Package, Loader2, ImageOff, ExternalLink, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { MediaPayload } from './MediaAttachment';

interface CatalogItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  thumbnail_url: string | null;
  images: string[] | null;
  tags: string[] | null;
}

interface CatalogPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string | null;
  onSend: (text: string, media?: MediaPayload) => void;
}

function formatMoney(value: number | null, currency = 'BRL') {
  if (value == null) return '';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

export function CatalogPickerDialog({ open, onOpenChange, productId, onSend }: CatalogPickerDialogProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['catalog-items-chat', profile?.organization_id, productId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      let q = supabase
        .from('product_catalog_items')
        .select('id, title, description, price, currency, url, thumbnail_url, images, tags')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60);
      if (productId) q = q.eq('product_id', productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CatalogItem[];
    },
    enabled: !!profile?.organization_id && open,
  });

  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.description?.toLowerCase().includes(search.toLowerCase()) ||
    i.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSend = async (item: CatalogItem) => {
    setSendingId(item.id);
    const lines: string[] = [`*${item.title}*`];
    if (item.price != null) lines.push(formatMoney(item.price, item.currency || 'BRL'));
    if (item.description) lines.push('', item.description.slice(0, 280));
    if (item.url) lines.push('', `🔗 ${item.url}`);
    const text = lines.join('\n');

    const imageUrl = item.thumbnail_url || item.images?.[0];
    let media: MediaPayload | undefined;
    if (imageUrl) {
      media = {
        kind: 'image',
        url: imageUrl,
        filename: item.title,
      };
    }

    onSend(text, media);
    setSendingId(null);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de produtos
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, descrição ou etiqueta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">{items.length === 0 ? 'Nenhum item no catálogo' : 'Nada encontrado'}</p>
              <p className="text-xs mt-1">
                {items.length === 0
                  ? 'Cadastre produtos no catálogo para enviá-los rapidamente no chat.'
                  : 'Tente outros termos de busca.'}
              </p>
            </div>
          ) : (
            <div className="p-3 grid gap-2 sm:grid-cols-2">
              {filtered.map(item => (
                <Card key={item.id} className="overflow-hidden hover:border-primary/50 transition-all group">
                  <div className="flex gap-3 p-3">
                    <div className="w-16 h-16 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {item.thumbnail_url || item.images?.[0] ? (
                        <img
                          src={item.thumbnail_url || item.images![0]}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                      {item.price != null && (
                        <p className="text-sm font-semibold text-primary">{formatMoney(item.price, item.currency || 'BRL')}</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleSend(item)}
                          disabled={sendingId === item.id}
                        >
                          {sendingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Enviar</>}
                        </Button>
                        {item.url && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
