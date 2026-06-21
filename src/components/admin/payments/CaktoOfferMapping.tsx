import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Link2, AlertCircle } from 'lucide-react';

type Offer = {
  id: string;
  name: string;
  role: string;
  cakto_product_id: string | null;
  product_id: string | null;
  price: number | null;
  position: number | null;
  is_active: boolean;
};

type Product = { id: string; name: string };

const ROLES = [
  { value: 'main', label: 'Principal' },
  { value: 'front_end', label: 'Front-end' },
  { value: 'order_bump', label: 'Order Bump' },
  { value: 'upsell', label: 'Upsell' },
  { value: 'downsell', label: 'Downsell' },
  { value: 'cross_sell', label: 'Cross-sell' },
];

export function CaktoOfferMapping() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const orgId = profile?.organization_id;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    setLoading(true);
    const [offersRes, productsRes] = await Promise.all([
      supabase
        .from('product_offers')
        .select('id, name, role, cakto_product_id, product_id, price, position, is_active')
        .eq('organization_id', orgId!)
        .order('product_id', { nullsFirst: true })
        .order('position', { ascending: true }),
      supabase.from('products').select('id, name').eq('organization_id', orgId!).order('name'),
    ]);
    if (offersRes.error) toast({ title: 'Erro', description: offersRes.error.message, variant: 'destructive' });
    setOffers((offersRes.data as Offer[]) || []);
    setProducts((productsRes.data as Product[]) || []);
    setLoading(false);
  }

  async function updateOffer(id: string, patch: Partial<Offer>) {
    setSavingId(id);
    const { error } = await supabase.from('product_offers').update(patch).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      // Se vinculou produto, propaga para os pedidos já recebidos
      if ('product_id' in patch) {
        await supabase
          .from('cakto_orders')
          .update({ product_id: patch.product_id ?? null })
          .eq('offer_id', id);
      }
    }
    setSavingId(null);
  }

  const unmapped = useMemo(() => offers.filter((o) => !o.product_id), [offers]);
  const mapped = useMemo(() => offers.filter((o) => o.product_id), [offers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Mapear ofertas Cakto → Produtos
        </h3>
        <p className="text-sm text-muted-foreground">
          Vincule cada oferta da Cakto (front-end, order bump, upsell...) ao produto do CRM. Isso ativa as
          métricas por produto na tela inicial e a atribuição da equipe.
        </p>
      </div>

      {unmapped.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Ofertas sem produto ({unmapped.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OfferTable
              offers={unmapped}
              products={products}
              savingId={savingId}
              onUpdate={updateOffer}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ofertas mapeadas ({mapped.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {mapped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma oferta vinculada ainda.
            </p>
          ) : (
            <OfferTable
              offers={mapped}
              products={products}
              savingId={savingId}
              onUpdate={updateOffer}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OfferTable({
  offers,
  products,
  savingId,
  onUpdate,
}: {
  offers: Offer[];
  products: Product[];
  savingId: string | null;
  onUpdate: (id: string, patch: Partial<Offer>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2">
        <div className="col-span-4">Oferta</div>
        <div className="col-span-3">Produto CRM</div>
        <div className="col-span-2">Papel</div>
        <div className="col-span-2">Preço</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      {offers.map((o) => (
        <div
          key={o.id}
          className="grid grid-cols-12 gap-2 items-center bg-card border border-border rounded-lg p-2"
        >
          <div className="col-span-4">
            <Input
              defaultValue={o.name}
              onBlur={(e) => e.target.value !== o.name && onUpdate(o.id, { name: e.target.value })}
              className="h-9"
            />
            {o.cakto_product_id && (
              <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                {o.cakto_product_id}
              </p>
            )}
          </div>
          <div className="col-span-3">
            <Select
              value={o.product_id ?? '__none'}
              onValueChange={(v) => onUpdate(o.id, { product_id: v === '__none' ? null : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Nenhum —</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Select value={o.role} onValueChange={(v) => onUpdate(o.id, { role: v })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Input
              type="number"
              step="0.01"
              defaultValue={o.price ?? ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                if (v !== o.price) onUpdate(o.id, { price: v });
              }}
              className="h-9"
            />
          </div>
          <div className="col-span-1 text-right">
            {savingId === o.id ? (
              <Loader2 className="h-4 w-4 animate-spin inline" />
            ) : o.product_id ? (
              <Badge variant="default" className="text-[10px]">OK</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
