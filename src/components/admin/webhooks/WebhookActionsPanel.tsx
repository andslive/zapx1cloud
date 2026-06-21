import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  GripVertical, 
  Trash2,
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
  AlertTriangle
} from 'lucide-react';
import { AddActionDialog } from './AddActionDialog';
import { ActionConfigDialog } from './ActionConfigDialog';
import type { WebhookAction, WebhookActionType } from '@/types/webhook';
import { ACTION_TYPES, LEAD_DEPENDENT_ACTIONS } from '@/types/webhook';
import { useLeadTags } from '@/hooks/useLeadTags';

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
  DollarSign
};

interface WebhookActionsPanelProps {
  actions: WebhookAction[];
  availableFields: Record<string, any>;
  productId?: string;
  onChange: (actions: WebhookAction[]) => void;
}

export function WebhookActionsPanel({ 
  actions, 
  availableFields,
  productId,
  onChange 
}: WebhookActionsPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<WebhookAction | null>(null);
  const { data: leadTags } = useLeadTags();

  const handleAddAction = (type: WebhookActionType) => {
    const newAction: WebhookAction = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      config: {}
    };
    onChange([...actions, newAction]);
    setIsAddDialogOpen(false);
    // Open config dialog for the new action
    setEditingAction(newAction);
  };

  const handleToggleAction = (actionId: string, enabled: boolean) => {
    onChange(actions.map(a => 
      a.id === actionId ? { ...a, enabled } : a
    ));
  };

  const handleRemoveAction = (actionId: string) => {
    onChange(actions.filter(a => a.id !== actionId));
  };

  const handleUpdateAction = (updatedAction: WebhookAction) => {
    onChange(actions.map(a => 
      a.id === updatedAction.id ? updatedAction : a
    ));
    setEditingAction(null);
  };

  const getActionIcon = (type: WebhookActionType) => {
    const iconName = ACTION_TYPES[type]?.icon || 'Zap';
    const Icon = ICON_MAP[iconName] || Zap;
    return Icon;
  };

  const getFieldMappingBadges = (action: WebhookAction) => {
    const mappings = action.config.field_mappings || {};
    const badges = Object.entries(mappings).slice(0, 3).map(([key, value]) => (
      <Badge key={key} variant="secondary" className="text-xs">
        {key}: {String(value)}
      </Badge>
    ));
    // Show configured custom field for update_field actions
    if (action.type === 'update_field' && action.config.custom_field_key && action.config.value_field) {
      return [
        <Badge key="field" variant="secondary" className="text-xs">
          campo: {action.config.custom_field_key}
        </Badge>,
        <Badge key="from" variant="outline" className="text-xs">
          de: {action.config.value_field}
        </Badge>
      ];
    }
    return badges;
  };

  // Check if create_lead is present for dependent actions validation
  const hasCreateLead = useMemo(() => {
    return actions.some(a => a.type === 'create_lead' && a.enabled);
  }, [actions]);

  const hasDependentActionsWithoutCreate = useMemo(() => {
    if (hasCreateLead) return false;
    return actions.some(a => 
      a.enabled && LEAD_DEPENDENT_ACTIONS.includes(a.type)
    );
  }, [actions, hasCreateLead]);

  return (
    <>
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Ações</CardTitle>
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure as ações que serão executadas quando o webhook receber dados
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasDependentActionsWithoutCreate && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Atenção:</strong> Você tem ações que dependem de um lead, mas não há uma ação 
                "Criar Lead" habilitada. Adicione a ação "Criar Lead" como primeira ação para evitar erros.
              </AlertDescription>
            </Alert>
          )}
          {actions.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Nenhuma ação configurada
              </p>
              <Button variant="outline" size="sm" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Ação
              </Button>
            </div>
          ) : (
            actions.map((action, index) => {
              const Icon = getActionIcon(action.type);
              const actionInfo = ACTION_TYPES[action.type];
              
              return (
                <div
                  key={action.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    action.enabled ? 'bg-card' : 'bg-muted/50 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className={`p-2 rounded-lg ${action.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                        <Icon className={`h-4 w-4 ${action.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{actionInfo?.label || action.type}</span>
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {actionInfo?.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {getFieldMappingBadges(action)}
                        {action.type === 'apply_tags' && (action.config.tag_ids?.length || action.config.tags?.length) ? (
                          <>
                            {(action.config.tag_ids || []).slice(0, 4).map((tid) => {
                              const t = leadTags?.find((x) => x.id === tid);
                              if (!t) return null;
                              return (
                                <Badge key={tid} variant="secondary" className="text-xs gap-1">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                  {t.name}
                                </Badge>
                              );
                            })}
                            {(action.config.tag_ids?.length || 0) > 4 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(action.config.tag_ids!.length - 4)}
                              </Badge>
                            )}
                            {(!action.config.tag_ids || action.config.tag_ids.length === 0) && action.config.tags?.length ? (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/40">
                                {action.config.tags.length} tag(s) legado — reabrir e selecionar
                              </Badge>
                            ) : null}
                          </>
                        ) : null}
                        {action.config.target_user_id && (
                          <Badge variant="secondary" className="text-xs">
                            Vendedor definido
                          </Badge>
                        )}
                        {action.config.target_stage_id && (
                          <Badge variant="secondary" className="text-xs">
                            Estágio definido
                          </Badge>
                        )}
                        {action.config.target_sector_id && (
                          <Badge variant="secondary" className="text-xs">
                            Setor definido
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setEditingAction(action)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={action.enabled}
                        onCheckedChange={(checked) => handleToggleAction(action.id, checked)}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveAction(action.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AddActionDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAdd={handleAddAction}
        existingTypes={actions.map(a => a.type)}
      />

      {editingAction && (
        <ActionConfigDialog
          open={!!editingAction}
          onOpenChange={() => setEditingAction(null)}
          action={editingAction}
          availableFields={availableFields}
          productId={productId}
          onSave={handleUpdateAction}
        />
      )}
    </>
  );
}
