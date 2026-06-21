import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FlowListManager } from './FlowListManager';
import { FlowBuilder } from './FlowBuilder';
import { ChatFlow } from '@/types/chatFlow';
import { useChatFlow } from '@/hooks/useChatFlows';
import { Loader2 } from 'lucide-react';

interface FlowTabProps {
  productId: string;
}

export function FlowTab({ productId }: FlowTabProps) {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { data: selectedFlow, isLoading } = useChatFlow(selectedFlowId || undefined);

  if (selectedFlowId) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!selectedFlow) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setSelectedFlowId(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista
          </Button>
          <div className="text-center text-muted-foreground py-8">
            Fluxo não encontrado
          </div>
        </div>
      );
    }

    return (
      <FlowBuilder 
        flow={selectedFlow}
        onBack={() => setSelectedFlowId(null)}
      />
    );
  }

  return (
    <FlowListManager 
      productId={productId} 
      onSelectFlow={(flow) => setSelectedFlowId(flow.id)} 
    />
  );
}
