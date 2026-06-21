import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, TrendingUp, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface ProductCardProps {
  product: DBProduct;
  onSelect: (product: DBProduct) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const statusColors: Record<string, string> = {
    draft: 'bg-warning/10 text-warning border-warning/20',
    review: 'bg-primary/10 text-primary border-primary/20',
    published: 'bg-success/10 text-success border-success/20',
    archived: 'bg-muted/10 text-muted-foreground border-muted/20'
  };

  const statusLabels: Record<string, string> = {
    draft: 'Rascunho',
    review: 'Em revisão',
    published: 'Publicado',
    archived: 'Arquivado'
  };

  const status = product.status || 'draft';

  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border",
        "bg-card hover:border-primary/50 transition-all duration-300",
        "hover:shadow-lg hover:shadow-primary/5"
      )}
    >
      {/* Gradient accent */}
      <div className="absolute inset-0 gradient-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {product.description}
            </p>
          </div>
          <Badge 
            variant="outline" 
            className={cn("text-xs", statusColors[status])}
          >
            {statusLabels[status]}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <Users size={18} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">ICP</p>
            <p className="text-sm font-medium text-foreground truncate">Fintechs</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <Calendar size={18} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cadência</p>
            <p className="text-sm font-medium text-foreground">7 dias</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <TrendingUp size={18} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Taxa</p>
            <p className="text-sm font-medium text-foreground">32%</p>
          </div>
        </div>

        {/* Differentials preview */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(product.differentials || []).slice(0, 3).map((diff, i) => (
            <span 
              key={i}
              className="text-xs px-2 py-1 rounded-full bg-primary/5 text-primary border border-primary/10"
            >
              {diff}
            </span>
          ))}
          {(product.differentials || []).length > 3 && (
            <span className="text-xs px-2 py-1 text-muted-foreground">
              +{(product.differentials || []).length - 3}
            </span>
          )}
        </div>

        {/* CTA */}
        <Button 
          className="w-full group/btn"
          onClick={() => onSelect(product)}
        >
          Abrir Produto
          <ArrowRight size={16} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
