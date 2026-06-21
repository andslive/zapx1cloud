import { ObjectionsView } from '@/components/objections/ObjectionsView';
import { useObjections } from '@/hooks/useObjections';
import { useProducts } from '@/hooks/useProducts';
import { Loader2 } from 'lucide-react';

interface ObjectionsTabProps {
  productId: string;
}

export function ObjectionsTab({ productId }: ObjectionsTabProps) {
  const { data: objections, isLoading } = useObjections(productId);
  const { data: products } = useProducts();
  
  const product = products?.find(p => p.id === productId);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ObjectionsView 
      objections={objections || []} 
      productId={productId}
      productName={product?.name}
      showAdminActions
    />
  );
}
