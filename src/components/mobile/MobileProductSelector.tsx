import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface MobileProductSelectorProps {
  products: DBProduct[];
  onSelectProduct: (product: DBProduct) => void;
}

export function MobileProductSelector({ products, onSelectProduct }: MobileProductSelectorProps) {
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500/20 text-green-500 text-[10px]">Ativo</Badge>;
      case 'draft':
        return <Badge className="bg-yellow-500/20 text-yellow-500 text-[10px]">Rascunho</Badge>;
      case 'review':
        return <Badge className="bg-blue-500/20 text-blue-500 text-[10px]">Em Revisão</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Meus Produtos</h2>
        <p className="text-sm text-muted-foreground">
          Selecione um produto para começar
        </p>
      </div>

      {/* Products Grid */}
      <div className="space-y-3">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum produto atribuído a você</p>
          </div>
        ) : (
          products.map((product) => (
            <Card 
              key={product.id}
              className="p-4 bg-card border-border active:scale-[0.98] transition-transform touch-manipulation cursor-pointer"
              onClick={() => onSelectProduct(product)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground truncate">
                      {product.name}
                    </span>
                    {getStatusBadge(product.status)}
                  </div>
                  
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
