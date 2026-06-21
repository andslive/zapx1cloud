import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  UserPlus,
  UserCog,
  UserCheck,
  Users,
  Building2,
  ArrowRight,
  Tag,
  Edit,
  Zap,
  Mail,
  Bell,
  Thermometer,
  DollarSign,
  MessageCircle,
  Bot,
  Check
} from 'lucide-react';
import type { WebhookActionType } from '@/types/webhook';
import { ACTION_TYPES } from '@/types/webhook';

const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus,
  UserCog,
  UserCheck,
  Users,
  Building2,
  ArrowRight,
  Tag,
  Edit,
  Zap,
  Mail,
  Bell,
  Thermometer,
  DollarSign,
  MessageCircle,
  Bot
};

interface AddActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: WebhookActionType) => void;
  existingTypes: WebhookActionType[];
}

export function AddActionDialog({ 
  open, 
  onOpenChange, 
  onAdd,
  existingTypes 
}: AddActionDialogProps) {
  const actionTypes = Object.entries(ACTION_TYPES) as [WebhookActionType, typeof ACTION_TYPES[WebhookActionType]][];

  // Group actions by category
  const leadActions = actionTypes.filter(([type]) => 
    ['create_lead', 'update_lead', 'set_temperature', 'set_deal_value', 'apply_tags', 'update_field'].includes(type)
  );
  
  const transferActions = actionTypes.filter(([type]) => 
    ['transfer_user', 'transfer_squad', 'transfer_sector', 'move_stage'].includes(type)
  );
  
  const automationActions = actionTypes.filter(([type]) => 
    ['trigger_flow', 'send_email', 'send_email_to_seller', 'notify_user', 'notify_whatsapp'].includes(type)
  );

  const aiActions = actionTypes.filter(([type]) => 
    ['ai_agent_outreach'].includes(type)
  );

  // Actions that can be added multiple times (one per field)
  const MULTI_ALLOWED: WebhookActionType[] = ['update_field'];

  const renderActionButton = ([type, info]: [WebhookActionType, typeof ACTION_TYPES[WebhookActionType]]) => {
    const Icon = ICON_MAP[info.icon] || Zap;
    const isMultiAllowed = MULTI_ALLOWED.includes(type);
    const isAdded = existingTypes.includes(type) && !isMultiAllowed;
    const addedCount = isMultiAllowed ? existingTypes.filter(t => t === type).length : 0;

    return (
      <button
        key={type}
        onClick={() => !isAdded && onAdd(type)}
        disabled={isAdded}
        className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
          isAdded 
            ? 'bg-muted/50 opacity-50 cursor-not-allowed' 
            : 'hover:bg-muted cursor-pointer'
        }`}
      >
        <div className={`p-2 rounded-lg ${isAdded ? 'bg-muted' : 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${isAdded ? 'text-muted-foreground' : 'text-primary'}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{info.label}</span>
            {isAdded && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Adicionada
              </Badge>
            )}
            {isMultiAllowed && addedCount > 0 && (
              <Badge variant="outline" className="text-xs text-primary border-primary/40">
                {addedCount}x adicionada — adicionar mais
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {info.description}
          </p>
          {isMultiAllowed && (
            <p className="text-xs text-primary mt-1 font-medium">
              ✓ Pode ser adicionada várias vezes (um por campo)
            </p>
          )}
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Adicionar Ação</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Lead Actions */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Ações de Lead
              </h3>
              <div className="space-y-2">
                {leadActions.map(([type, info]) => renderActionButton([type, info]))}
              </div>
            </div>

            {/* Transfer Actions */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Transferência e Pipeline
              </h3>
              <div className="space-y-2">
                {transferActions.map(([type, info]) => renderActionButton([type, info]))}
              </div>
            </div>

            {/* Automation Actions */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Automação
              </h3>
              <div className="space-y-2">
                {automationActions.map(([type, info]) => renderActionButton([type, info]))}
              </div>
            </div>

            {/* AI Actions */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                🤖 Inteligência Artificial
              </h3>
              <div className="space-y-2">
                {aiActions.map(([type, info]) => renderActionButton([type, info]))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
