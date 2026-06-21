import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Plus, Info, MessageCircle, Search, ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTeamMembers } from '@/hooks/useTeam';
import { useSquads } from '@/hooks/useSquads';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useFunnels } from '@/hooks/useFunnels';
import { useAllAgents } from '@/hooks/useProductAgents';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { useSectors } from '@/hooks/useSectors';
import { useLeadTags } from '@/hooks/useLeadTags';
import { supabase } from '@/integrations/supabase/client';
import type { WebhookAction, WebhookActionConfig, FollowupStep } from '@/types/webhook';
import { ACTION_TYPES } from '@/types/webhook';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ActionConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: WebhookAction;
  availableFields: Record<string, any>;
  productId?: string;
  onSave: (action: WebhookAction) => void;
}

interface PipelineStageRow {
  id: string;
  name: string;
  color?: string | null;
  order_index: number;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

export function ActionConfigDialog({
  open,
  onOpenChange,
  action,
  availableFields,
  productId,
  onSave
}: ActionConfigDialogProps) {
  const [config, setConfig] = useState<WebhookActionConfig>(action.config);
  const [newTag, setNewTag] = useState('');
  const [pipelineStages, setPipelineStages] = useState<PipelineStageRow[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  
  const { data: teamMembers } = useTeamMembers();
  const { data: squads } = useSquads();
  const { data: emailTemplates } = useEmailTemplates();
  const { fields: customFields } = useCustomFields();
  const { data: funnels } = useFunnels();
  const { data: allAgents } = useAllAgents();
  const { data: evolutionInstances } = useWhatsAppInstances();
  const { data: sectors } = useSectors();
  const { data: leadTags } = useLeadTags();

  useEffect(() => {
    let cancelled = false;
    if (!productId || action.type !== 'move_stage') {
      setPipelineStages([]);
      return;
    }
    setLoadingStages(true);
    supabase
      .from('pipeline_stages')
      .select('id, name, color, order_index, is_won, is_lost')
      .eq('product_id', productId)
      .order('order_index', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setPipelineStages((data as PipelineStageRow[]) || []);
        setLoadingStages(false);
      });
    return () => { cancelled = true; };
  }, [productId, action.type]);

  // Migra config legado: se vier {tags: ["nome"]} sem tag_ids, tenta resolver pelos nomes
  useEffect(() => {
    if (action.type !== 'apply_tags') return;
    if (config.tag_ids && config.tag_ids.length > 0) return;
    if (!config.tags || config.tags.length === 0) return;
    if (!leadTags || leadTags.length === 0) return;
    const lower = (s: string) => s.trim().toLowerCase();
    const matched = config.tags
      .map((name) => leadTags.find((t) => lower(t.name) === lower(name))?.id)
      .filter((v): v is string => !!v);
    if (matched.length > 0) {
      setConfig((prev) => ({ ...prev, tag_ids: Array.from(new Set([...(prev.tag_ids || []), ...matched])) }));
    }
  }, [action.type, leadTags]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Flatten available fields for dropdown
  const flattenObject = (obj: any, prefix = ''): string[] => {
    const paths: string[] = [];
    for (const key in obj) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...flattenObject(value, fullPath));
      } else {
        paths.push(fullPath);
      }
    }
    return paths;
  };
  
  const fieldPaths = flattenObject(availableFields);

  // Get sample value for a given dotted path (e.g. "customer.email")
  // Supports both nested objects and already-flattened keys (which is how
  // webhook_sample_requests.extracted_fields is stored).
  const getSampleValue = (path: string): string => {
    try {
      let cur: any = undefined;
      // 1) Try as a flat key first (matches what webhook-receiver saves)
      if (availableFields && Object.prototype.hasOwnProperty.call(availableFields, path)) {
        cur = (availableFields as any)[path];
      } else {
        // 2) Fallback: walk the path as nested object
        const parts = path.split('.');
        cur = availableFields;
        for (const p of parts) {
          if (cur == null) return '';
          cur = cur[p];
        }
      }
      if (cur === null || cur === undefined) return '';
      if (typeof cur === 'object') return Array.isArray(cur) ? `[${cur.length} itens]` : '{...}';
      const str = String(cur);
      return str.length > 80 ? str.slice(0, 80) + '…' : str;
    } catch {
      return '';
    }
  };

  const handleSave = () => {
    onSave({ ...action, config });
  };

  const updateFieldMapping = (crmField: string, payloadField: string) => {
    setConfig(prev => ({
      ...prev,
      field_mappings: {
        ...prev.field_mappings,
        [crmField]: payloadField
      }
    }));
  };

  const removeFieldMapping = (crmField: string) => {
    setConfig(prev => {
      const newMappings = { ...prev.field_mappings };
      delete newMappings[crmField];
      return { ...prev, field_mappings: newMappings };
    });
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    setConfig(prev => ({
      ...prev,
      tags: [...(prev.tags || []), newTag.trim()]
    }));
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setConfig(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tag)
    }));
  };

  const renderCreateLeadConfig = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mapeie os campos do payload para os campos do lead
      </p>
      
      {/* Field Mappings */}
      <div className="space-y-3">
        <FieldMappingRow
          label="Nome"
          crmField="name"
          value={config.field_mappings?.name || ''}
          fieldPaths={fieldPaths}
          onChange={(v) => updateFieldMapping('name', v)}
          onRemove={() => removeFieldMapping('name')}
          getSampleValue={getSampleValue}
        />
        <FieldMappingRow
          label="Email"
          crmField="email"
          value={config.field_mappings?.email || ''}
          fieldPaths={fieldPaths}
          onChange={(v) => updateFieldMapping('email', v)}
          onRemove={() => removeFieldMapping('email')}
          getSampleValue={getSampleValue}
        />
        <FieldMappingRow
          label="Telefone"
          crmField="phone"
          value={config.field_mappings?.phone || ''}
          fieldPaths={fieldPaths}
          onChange={(v) => updateFieldMapping('phone', v)}
          onRemove={() => removeFieldMapping('phone')}
          getSampleValue={getSampleValue}
        />
        <FieldMappingRow
          label="Empresa"
          crmField="company"
          value={config.field_mappings?.company || ''}
          fieldPaths={fieldPaths}
          onChange={(v) => updateFieldMapping('company', v)}
          onRemove={() => removeFieldMapping('company')}
          getSampleValue={getSampleValue}
        />
      </div>
    </div>
  );

  const renderTransferUserConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Vendedor de Destino</Label>
        <Select
          value={config.target_user_id || ''}
          onValueChange={(v) => setConfig(prev => ({ ...prev, target_user_id: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um vendedor" />
          </SelectTrigger>
          <SelectContent>
            {teamMembers?.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderTransferSquadConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Squad de Destino</Label>
        <Select
          value={config.target_squad_id || ''}
          onValueChange={(v) => setConfig(prev => ({ ...prev, target_squad_id: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um squad" />
          </SelectTrigger>
          <SelectContent>
            {squads?.map((squad) => (
              <SelectItem key={squad.id} value={squad.id}>
                {squad.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderTransferSectorConfig = () => {
    const activeSectors = (sectors || []).filter((s: any) => s.is_active !== false);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Setor de Destino</Label>
          <Select
            value={config.target_sector_id || ''}
            onValueChange={(v) => setConfig(prev => ({ ...prev, target_sector_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um setor" />
            </SelectTrigger>
            <SelectContent>
              {activeSectors.map((sector: any) => (
                <SelectItem key={sector.id} value={sector.id}>
                  {sector.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeSectors.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum setor ativo. Crie um em Configurações → Setores.
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderMoveStageConfig = () => {
    if (!productId) {
      return (
        <p className="text-sm text-muted-foreground">
          Vincule este webhook a um produto na aba de configuração para listar as etapas do pipeline.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Estágio do Pipeline</Label>
          <Select
            value={config.target_stage_id || ''}
            onValueChange={(v) => setConfig(prev => ({ ...prev, target_stage_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingStages ? 'Carregando...' : 'Selecione um estágio'} />
            </SelectTrigger>
            <SelectContent>
              {pipelineStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="flex items-center gap-2">
                    {stage.color && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                    )}
                    <span>{stage.name}</span>
                    {stage.is_won && <Badge variant="outline" className="text-xs">Ganho</Badge>}
                    {stage.is_lost && <Badge variant="outline" className="text-xs">Perdido</Badge>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loadingStages && pipelineStages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Esse produto ainda não tem etapas no pipeline.
            </p>
          )}
        </div>
      </div>
    );
  };

  const toggleTagId = (id: string) => {
    setConfig((prev) => {
      const current = prev.tag_ids || [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...prev, tag_ids: next };
    });
  };

  const renderApplyTagsConfig = () => {
    const selected = config.tag_ids || [];
    const orphanLegacy = (config.tags || []).filter(
      (name) => !leadTags?.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())
    );
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Etiquetas a aplicar</Label>
          <p className="text-xs text-muted-foreground">
            Selecione as etiquetas cadastradas em <strong>Etiquetas</strong> que serão aplicadas no lead quando este webhook disparar.
          </p>
          {(!leadTags || leadTags.length === 0) ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma etiqueta cadastrada ainda. Crie etiquetas em <strong>Leads → Etiquetas</strong>.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
              {leadTags.map((tag) => {
                const active = selected.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTagId(tag.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                    {active && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}
          {selected.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {selected.length} etiqueta(s) selecionada(s)
            </div>
          )}
          {orphanLegacy.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
              <strong>Atenção:</strong> existem nomes antigos de tags que não casaram com nenhuma etiqueta cadastrada:{' '}
              {orphanLegacy.join(', ')}. Crie/selecione as etiquetas reais acima.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTemperatureConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Temperatura</Label>
        <Select
          value={config.temperature || ''}
          onValueChange={(v) => setConfig(prev => ({ ...prev, temperature: v as 'hot' | 'warm' | 'cold' }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione a temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hot">🔥 Quente</SelectItem>
            <SelectItem value="warm">🌡️ Morno</SelectItem>
            <SelectItem value="cold">❄️ Frio</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderSetDealValueConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Campo do Payload com o Valor</Label>
        <Select
          value={config.value_field || ''}
          onValueChange={(v) => setConfig(prev => ({ ...prev, value_field: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o campo" />
          </SelectTrigger>
          <SelectContent>
            {fieldPaths.map((path) => (
              <SelectItem key={path} value={path}>
                {path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderNotifyConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Mensagem da Notificação</Label>
        <Input
          placeholder="Ex: Novo lead recebido via webhook!"
          value={config.notification_message || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, notification_message: e.target.value }))}
        />
      </div>
    </div>
  );

  const renderSendEmailConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Template de Email (opcional)</Label>
        <Select
          value={config.email_template_id || 'default'}
          onValueChange={(v) => setConfig(prev => ({ ...prev, email_template_id: v === 'default' ? undefined : v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Usar template padrão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">📧 Template Padrão (Boas-vindas)</SelectItem>
            {emailTemplates?.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Se nenhum template for selecionado, será usado um email padrão de boas-vindas.
        </p>
      </div>
    </div>
  );

  const renderSendEmailToSellerConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Assunto do Email</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Variáveis disponíveis: {'{{lead_name}}, {{lead_email}}, {{lead_phone}}'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          placeholder="Novo lead recebido: {{lead_name}}"
          value={config.email_subject || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, email_subject: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Mensagem</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Variáveis: {'{{lead_name}}, {{lead_email}}, {{lead_phone}}, {{lead_url}}'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Textarea
          placeholder="Um novo lead chamado {{lead_name}} foi recebido via webhook. Acesse: {{lead_url}}"
          value={config.email_message || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, email_message: e.target.value }))}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          O email será enviado para o vendedor responsável pelo lead.
        </p>
      </div>
    </div>
  );

  const renderUpdateFieldConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Campo Personalizado</Label>
        <Select
          value={config.custom_field_id || ''}
          onValueChange={(v) => {
            const field = customFields.find(f => f.id === v);
            setConfig(prev => ({
              ...prev,
              custom_field_id: v,
              custom_field_key: field?.field_key || ''
            }));
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o campo" />
          </SelectTrigger>
          <SelectContent>
            {customFields.filter(f => f.is_active).map((field) => (
              <SelectItem key={field.id} value={field.id}>
                {field.name} ({field.field_key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {customFields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum campo personalizado criado. Vá em "Campos Personalizados" para criar.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Campo do Payload (valor)</Label>
        <Select
          value={config.value_field || ''}
          onValueChange={(v) => setConfig(prev => ({ ...prev, value_field: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o campo do payload" />
          </SelectTrigger>
          <SelectContent>
            {fieldPaths.map((path) => (
              <SelectItem key={path} value={path}>
                {path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderNotifyWhatsappConfig = () => {
    const target = config.whatsapp_target || 'all_team';
    return (
      <div className="space-y-5">
        {/* Message */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Mensagem *</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Variáveis disponíveis: {'{{lead_name}}, {{lead_phone}}, {{lead_email}}'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            placeholder={`Olá! Um novo lead chegou: {{lead_name}}\nTelefone: {{lead_phone}}`}
            value={config.whatsapp_message || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, whatsapp_message: e.target.value }))}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">{'{{lead_name}}'}</code>, <code className="bg-muted px-1 rounded">{'{{lead_phone}}'}</code>, <code className="bg-muted px-1 rounded">{'{{lead_email}}'}</code>
          </p>
        </div>

        {/* Target */}
        <div className="space-y-3">
          <Label>Quem notificar?</Label>
          <RadioGroup
            value={target}
            onValueChange={(v) => setConfig(prev => ({ ...prev, whatsapp_target: v as any }))}
            className="space-y-2"
          >
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="all_team" id="wa-all" />
              <label htmlFor="wa-all" className="cursor-pointer flex-1">
                <div className="font-medium text-sm">Todos os membros da equipe</div>
                <div className="text-xs text-muted-foreground">Envia para todos que possuem telefone cadastrado</div>
              </label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="specific_user" id="wa-user" />
              <label htmlFor="wa-user" className="cursor-pointer flex-1">
                <div className="font-medium text-sm">Membro específico</div>
                <div className="text-xs text-muted-foreground">Selecione um membro da equipe</div>
              </label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="specific_number" id="wa-number" />
              <label htmlFor="wa-number" className="cursor-pointer flex-1">
                <div className="font-medium text-sm">Número específico</div>
                <div className="text-xs text-muted-foreground">Digite um número de WhatsApp fixo</div>
              </label>
            </div>
          </RadioGroup>
        </div>

        {/* Conditional: specific user dropdown */}
        {target === 'specific_user' && (
          <div className="space-y-2">
            <Label>Membro da equipe</Label>
            <Select
              value={config.whatsapp_user_id || ''}
              onValueChange={(v) => setConfig(prev => ({ ...prev, whatsapp_user_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um membro" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O telefone cadastrado no perfil do membro será usado como destino.
            </p>
          </div>
        )}

        {/* Conditional: specific number input */}
        {target === 'specific_number' && (
          <div className="space-y-2">
            <Label>Número de WhatsApp</Label>
            <Input
              placeholder="Ex: 558599999999"
              value={config.whatsapp_number || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, whatsapp_number: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Formato: DDI + DDD + Número (ex: <code className="bg-muted px-1 rounded">558599999999</code>)
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderAiAgentOutreachConfig = () => {
    const [agents, setAgents] = useState<Array<{ id: string; name: string; agent_type: string }>>([]);
    
    useEffect(() => {
      const fetchAgents = async () => {
        const { data } = await supabase
          .from('product_agents')
          .select('id, name, agent_type')
          .eq('is_active', true)
          .order('name');
        if (data) setAgents(data);
      };
      fetchAgents();
    }, []);

    return (
      <div className="space-y-5">
        {/* Agent Selection */}
        <div className="space-y-2">
          <Label>Agente IA *</Label>
          <Select
            value={config.ai_agent_id || ''}
            onValueChange={(v) => setConfig(prev => ({ ...prev, ai_agent_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o agente" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name} ({agent.agent_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agents.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum agente IA encontrado. Crie um agente no produto primeiro.
            </p>
          )}
        </div>

        {/* Objective */}
        <div className="space-y-2">
          <Label>Objetivo da Abordagem *</Label>
          <Input
            placeholder="Ex: Qualificar o lead e agendar uma call"
            value={config.ai_objective || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, ai_objective: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Instrução principal que o agente seguirá ao abordar o lead.
          </p>
        </div>

        {/* Extra Context */}
        <div className="space-y-2">
          <Label>Contexto Extra (opcional)</Label>
          <Textarea
            placeholder="Ex: O lead veio da página de preços, provavelmente está comparando opções"
            value={config.ai_extra_context || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, ai_extra_context: e.target.value }))}
            rows={3}
          />
        </div>

        {/* Follow-up Section */}
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Follow-up Automático</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reenvia mensagem estratégica se o lead não responder
              </p>
            </div>
            <Switch
              checked={config.ai_followup_enabled || false}
              onCheckedChange={(v) => setConfig(prev => ({ ...prev, ai_followup_enabled: v }))}
            />
          </div>

          {config.ai_followup_enabled && (
            <div className="space-y-5 pt-2">
              {/* Business Hours */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Horário Comercial
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-28"
                    value={config.ai_business_hours_start || '09:00'}
                    onChange={(e) => setConfig(prev => ({ ...prev, ai_business_hours_start: e.target.value }))}
                  />
                  <span className="text-sm text-muted-foreground">às</span>
                  <Input
                    type="time"
                    className="w-28"
                    value={config.ai_business_hours_end || '18:00'}
                    onChange={(e) => setConfig(prev => ({ ...prev, ai_business_hours_end: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  {[
                    { day: 1, label: 'Seg' },
                    { day: 2, label: 'Ter' },
                    { day: 3, label: 'Qua' },
                    { day: 4, label: 'Qui' },
                    { day: 5, label: 'Sex' },
                    { day: 6, label: 'Sáb' },
                    { day: 0, label: 'Dom' },
                  ].map(({ day, label }) => {
                    const days = config.ai_business_days || [1, 2, 3, 4, 5];
                    const checked = days.includes(day);
                    return (
                      <div key={day} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`day-${day}`}
                          checked={checked}
                          onCheckedChange={(v) => {
                            const current = config.ai_business_days || [1, 2, 3, 4, 5];
                            const next = v
                              ? [...current, day]
                              : current.filter(d => d !== day);
                            setConfig(prev => ({ ...prev, ai_business_days: next }));
                          }}
                        />
                        <label htmlFor={`day-${day}`} className="text-sm cursor-pointer">{label}</label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Follow-up Steps */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Etapas de Follow-up</Label>
                
                {(config.ai_followup_steps || [{ delay_hours: 24 }]).map((step, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{idx + 1}º Follow-up</span>
                      {(config.ai_followup_steps || []).length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const steps = [...(config.ai_followup_steps || [])];
                            steps.splice(idx, 1);
                            setConfig(prev => ({ ...prev, ai_followup_steps: steps }));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Esperar</Label>
                      <Select
                        value={String(step.delay_hours)}
                        onValueChange={(v) => {
                          const steps = [...(config.ai_followup_steps || [{ delay_hours: 24 }])];
                          steps[idx] = { ...steps[idx], delay_hours: parseInt(v) };
                          setConfig(prev => ({ ...prev, ai_followup_steps: steps }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 hora</SelectItem>
                          <SelectItem value="2">2 horas</SelectItem>
                          <SelectItem value="4">4 horas</SelectItem>
                          <SelectItem value="6">6 horas</SelectItem>
                          <SelectItem value="12">12 horas</SelectItem>
                          <SelectItem value="24">1 dia</SelectItem>
                          <SelectItem value="48">2 dias</SelectItem>
                          <SelectItem value="72">3 dias</SelectItem>
                          <SelectItem value="120">5 dias</SelectItem>
                          <SelectItem value="168">7 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Instrução para a IA (opcional)</Label>
                      <Input
                        placeholder="Ex: Reforce o benefício principal"
                        value={step.instruction || ''}
                        onChange={(e) => {
                          const steps = [...(config.ai_followup_steps || [{ delay_hours: 24 }])];
                          steps[idx] = { ...steps[idx], instruction: e.target.value };
                          setConfig(prev => ({ ...prev, ai_followup_steps: steps }));
                        }}
                      />
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const steps = [...(config.ai_followup_steps || [{ delay_hours: 24 }])];
                    steps.push({ delay_hours: 48 });
                    setConfig(prev => ({ ...prev, ai_followup_steps: steps }));
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar etapa
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };


  const renderTriggerFlowConfig = () => {
    const channel = config.flow_channel || 'whatsapp';
    const activeFunnels = (funnels || []).filter((f: any) => f.status === 'active' || f.status === 'draft');
    const connectedInstances = (evolutionInstances || []).filter((i) => i.status === 'connected');

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Funil a disparar *</Label>
          <Select
            value={config.flow_id || ''}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, flow_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {activeFunnels.length === 0 && (
                <SelectItem value="__none" disabled>
                  Nenhum funil disponível
                </SelectItem>
              )}
              {activeFunnels.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} {f.status === 'draft' ? '(rascunho)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Apenas funis publicados ou em rascunho aparecem aqui.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Agente IA que conduzirá o fluxo (opcional)</Label>
          <Select
            value={config.flow_agent_id || '__none'}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, flow_agent_id: v === '__none' ? undefined : v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem agente IA (apenas disparo)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem agente IA (apenas disparo)</SelectItem>
              {(allAgents || []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.product?.name ? ` · ${a.product.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Se não selecionar agente, o fluxo dispara e a conversa fica aguardando atendimento humano.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Atribuir a vendedor (opcional)</Label>
          <Select
            value={config.flow_assigned_user_id || '__none'}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, flow_assigned_user_id: v === '__none' ? undefined : v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Não atribuir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Não atribuir</SelectItem>
              {(teamMembers || []).map((m: any) => (
                <SelectItem key={m.user_id || m.id} value={m.user_id || m.id}>
                  {m.full_name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Atribuir a setor (opcional)</Label>
          <Select
            value={config.flow_sector_id || '__none'}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, flow_sector_id: v === '__none' ? undefined : v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem setor</SelectItem>
              {(sectors || []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Canal de entrega *</Label>
          <RadioGroup
            value={channel}
            onValueChange={(v) => setConfig((prev) => ({ ...prev, flow_channel: v as 'whatsapp' | 'webchat' }))}
            className="space-y-2"
          >
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border">
              <RadioGroupItem value="whatsapp" id="flow-wa" />
              <label htmlFor="flow-wa" className="cursor-pointer flex-1">
                <div className="font-medium text-sm">WhatsApp</div>
                <div className="text-xs text-muted-foreground">Envia o fluxo no WhatsApp do lead via UazAPI</div>
              </label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border border-border">
              <RadioGroupItem value="webchat" id="flow-web" />
              <label htmlFor="flow-web" className="cursor-pointer flex-1">
                <div className="font-medium text-sm">WebChat</div>
                <div className="text-xs text-muted-foreground">Cria a conversa no Inbox para o lead continuar via chat</div>
              </label>
            </div>
          </RadioGroup>
        </div>

        {channel === 'whatsapp' && (
          <div className="space-y-2">
            <Label>Instância WhatsApp (opcional)</Label>
            <Select
              value={config.flow_evolution_instance_id || '__auto'}
              onValueChange={(v) =>
                setConfig((prev) => ({ ...prev, flow_evolution_instance_id: v === '__auto' ? undefined : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Usar primeira instância conectada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto">Usar primeira instância conectada</SelectItem>
                {connectedInstances.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} {i.phone_number ? `· ${i.phone_number}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {connectedInstances.length === 0 && (
              <p className="text-xs text-amber-600">Nenhuma instância WhatsApp conectada — conecte uma em Conexões.</p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          O lead precisa ter telefone (WhatsApp) ou e-mail para que o fluxo seja iniciado corretamente.
        </div>
      </div>
    );
  };

  const renderConfigFields = () => {
    switch (action.type) {
      case 'create_lead':
      case 'update_lead':
        return renderCreateLeadConfig();
      case 'transfer_user':
        return renderTransferUserConfig();
      case 'transfer_squad':
        return renderTransferSquadConfig();
      case 'transfer_sector':
        return renderTransferSectorConfig();
      case 'move_stage':
        return renderMoveStageConfig();
      case 'apply_tags':
        return renderApplyTagsConfig();
      case 'set_temperature':
        return renderTemperatureConfig();
      case 'set_deal_value':
        return renderSetDealValueConfig();
      case 'notify_user':
        return renderNotifyConfig();
      case 'send_email':
        return renderSendEmailConfig();
      case 'send_email_to_seller':
        return renderSendEmailToSellerConfig();
      case 'update_field':
        return renderUpdateFieldConfig();
      case 'notify_whatsapp':
        return renderNotifyWhatsappConfig();
      case 'ai_agent_outreach':
        return renderAiAgentOutreachConfig();
      case 'trigger_flow':
        return renderTriggerFlowConfig();
      default:
        return (
          <p className="text-sm text-muted-foreground">
            Configuração não disponível para esta ação.
          </p>
        );
    }
  };

  const actionInfo = ACTION_TYPES[action.type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar: {actionInfo?.label}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          {renderConfigFields()}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for field mapping (BotConversa-style searchable picker)
function FieldMappingRow({
  label,
  crmField,
  value,
  fieldPaths,
  onChange,
  onRemove,
  getSampleValue,
}: {
  label: string;
  crmField: string;
  value: string;
  fieldPaths: string[];
  onChange: (value: string) => void;
  onRemove: () => void;
  getSampleValue?: (path: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sample = value && getSampleValue ? getSampleValue(value) : '';

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return fieldPaths;
    return fieldPaths.filter((path) => {
      if (path.toLowerCase().includes(q)) return true;
      const s = getSampleValue ? getSampleValue(path).toLowerCase() : '';
      return s.includes(q);
    });
  })();

  return (
    <div className="flex items-center gap-2">
      <Label className="w-20 text-sm">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between font-normal h-9"
          >
            {value ? (
              <span className="flex items-center gap-2 truncate min-w-0">
                <span className="font-mono text-xs truncate">{value}</span>
                {sample && (
                  <span className="text-muted-foreground text-xs truncate">
                    : {sample}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                Selecione o campo do payload
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[320px] max-w-[520px]"
          align="start"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por chave"
              className="flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ScrollArea className="max-h-[320px]">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum campo encontrado
              </div>
            ) : (
              <div className="p-1">
                {filtered.map((path) => {
                  const s = getSampleValue ? getSampleValue(path) : '';
                  const isSelected = path === value;
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => {
                        onChange(path);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-sm text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                        isSelected ? 'bg-accent/60' : ''
                      }`}
                    >
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          isSelected ? 'opacity-100 text-primary' : 'opacity-0'
                        }`}
                      />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border bg-muted/50 text-foreground whitespace-nowrap">
                          {path}
                        </span>
                        {s && (
                          <span className="text-muted-foreground text-xs truncate">
                            : {s}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
