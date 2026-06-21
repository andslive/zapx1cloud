import { Package, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface HeaderProductSwitcherProps {
  products: DBProduct[];
  selectedProduct: DBProduct | null;
  onSelectProduct: (product: DBProduct) => void;
}

export function HeaderProductSwitcher({
  products,
  selectedProduct,
  onSelectProduct,
}: HeaderProductSwitcherProps) {
  if (products.length === 0) return null;


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 min-w-[220px] justify-between bg-card hover:bg-muted/60"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Package className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium truncate">
              {selectedProduct?.name || 'Selecionar produto'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Meus produtos ({products.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {products.map((product) => {
          const isActive = selectedProduct?.id === product.id;
          return (
            <DropdownMenuItem
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="cursor-pointer flex items-center gap-2 py-2"
            >
              <Package className="h-4 w-4 text-primary shrink-0" />
              <span className={`flex-1 truncate ${isActive ? 'font-semibold' : ''}`}>
                {product.name}
              </span>
              {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
