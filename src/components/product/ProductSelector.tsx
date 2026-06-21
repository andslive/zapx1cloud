import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, TrendingUp, Users, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type DBProduct = Tables<'products'>;

interface ProductSelectorProps {
  products: DBProduct[];
  onSelectProduct: (product: DBProduct) => void;
}

const statusConfig = {
  published: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  review: { label: 'Em revisão', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
};

export function ProductSelector({ products, onSelectProduct }: ProductSelectorProps) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Meus Produtos
          </h1>
          <p className="text-muted-foreground text-lg">
            Selecione um produto para acessar seu painel completo
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {products.map((product) => {
            const status = statusConfig[product.status as keyof typeof statusConfig] || statusConfig.draft;
            
            return (
              <Card 
                key={product.id}
                className={cn(
                  "group cursor-pointer transition-all duration-300",
                  "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
                  "bg-card"
                )}
                onClick={() => onSelectProduct(product)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>

                  <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  
                  {product.description && (
                    <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>12 leads</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>32% conversão</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    variant="outline"
                  >
                    Acessar Painel
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
