import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Bot, 
  Target, 
  MessageSquare, 
  Settings2, 
  Zap,
  Plus,
  X,
  Loader2,
  Sparkles,
  Wand2,
  GraduationCap,
  Wrench,
  MessageCircle,
  Crown,
  Calendar,
} from 'lucide-react';
import {
  ProductAgent,
  AgentType,
  ToneStyle,
  MessageStyle,
  AGENT_TYPE_LABELS,
  TONE_STYLE_LABELS,
  MESSAGE_STYLE_LABELS,
  AGENT_TEMPLATES,
  CHANNEL_LABELS,
} from '@/types/agents';
import { cn } from '@/lib/utils';
import { useGenerateAgentAI } from '@/hooks/useGenerateAgentAI';
import { toast } from 'sonner';
import { AgentTrainingSection } from './AgentTrainingSection';
import { AgentToolsTab } from './AgentToolsTab';
import { AgentSchedulingTab } from './AgentSchedulingTab';
import { AgentTestChat } from './AgentTestChat';
import { AgentActivationRules } from './AgentActivationRules';
import { AdminExecutivePanel } from './AdminExecutivePanel';
import { AgentSupportTab } from './AgentSupportTab';
import { AgentOrchestratorRoutingTab } from './AgentOrchestratorRoutingTab';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { Globe, Package, Smartphone, Compass, BookOpen, Hand } from 'lucide-react';
import { AgentWelcomeMenuTab } from './AgentWelcomeMenuTab';
import { AgentHumanizationTab, DEFAULT_HUMANIZATION } from './AgentHumanizationTab';

interface AgentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: ProductAgent | null;
  productId: string | null;
  onSave: (agent: Partial<ProductAgent>) => void;
  isLoading?: boolean;
  /** When true, opens directly on the "Executivo" tab (admin only). */
  openOnExecutiveTab?: boolean;
}

const DEFAULT_AGENT: Partial<ProductAgent> = {
  name: '',
  description: '',
  agent_type: 'custom',
  primary_objective: '',
  can_do: [],
  cannot_do: [],
  handoff_triggers: [],
  end_conversation_triggers: [],
  tone_style: 'friendly',
  message_style: 'balanced',
  // ai_model removido — modelo agora vem de org_ai_routing (Integrações > Roteamento de IA)
  always_end_with_question: true,
  additional_prompt: '',
  required_phrases: [],
  prohibited_phrases: [],
  auto_tag_leads: true,
  default_tags: [],
  can_update_pipeline: true,
  can_create_tasks: true,
  can_schedule_meetings: true,
  can_apply_tags: false,
  can_update_lead: false,
  can_send_emails: false,
  can_send_materials: false,
  can_trigger_flows: false,
  can_transfer: false,
  can_notify: false,
  can_add_notes: false,
  can_start_cadence: false,
  can_qualify: false,
  tool_configs: {},
  active_in_funnels: true,
  active_in_chat: true,
  active_in_widget: true,
  active_in_inbox: true,
  active_in_copilot: false,
  is_active: true,
  activation_keywords: [],
  activation_phrases: [],
  activation_priority: 0,
  activation_scope: 'all',
  takeover_on_match: true,
  humanization: DEFAULT_HUMANIZATION as any,
};

export function AgentEditor({
  open,
  onOpenChange,
  agent,
  productId,
  onSave,
  isLoading,
  openOnExecutiveTab,
}: AgentEditorProps) {
  const [formData, setFormData] = useState<Partial<ProductAgent>>(DEFAULT_AGENT);
  const [activeTab, setActiveTab] = useState('identity');
  const [optimizingField, setOptimizingField] = useState<string | null>(null);
  const [isRetraining, setIsRetraining] = useState(false);
  const [scope, setScope] = useState<'global' | 'product'>('global');
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [customContext, setCustomContext] = useState('');
  const { isGenerating, generateAgent, optimizeField } = useGenerateAgentAI();
  const { data: products } = useProducts();
  const { data: evolutionInstances } = useWhatsAppInstances();

  // Global agent types are forced to no product
  const GLOBAL_TYPES: AgentType[] = ['admin', 'support', 'financial', 'orchestrator'];
  const isGlobalType = (t?: AgentType) => !!t && GLOBAL_TYPES.includes(t);
  const isOrchestrator = formData.agent_type === 'orchestrator';
  const isSupport = formData.agent_type === 'support';

  useEffect(() => {
    if (agent) {
      setFormData(agent);
      setScope(agent.product_id ? 'product' : 'global');
    } else {
      setFormData({ ...DEFAULT_AGENT, product_id: productId ?? null });
      setScope(productId ? 'product' : 'global');
    }
    // Open directly on Executive tab when requested AND agent is admin
    if (openOnExecutiveTab && agent?.agent_type === 'admin') {
      setActiveTab('executive');
    } else {
      setActiveTab('identity');
    }
  }, [agent, productId, open, openOnExecutiveTab]);

  const runGenerateWithAI = async (contextOverride?: string) => {
    if (!formData.agent_type) {
      toast.error('Selecione o tipo de agente primeiro');
      setActiveTab('identity');
      return;
    }
    // Para tipos globais (admin/support/financial), permite gerar SEM produto
    // Para SDR/Closer/CS/custom, exige produto
    if (!formData.product_id && !isGlobalType(formData.agent_type)) {
      toast.error('Selecione um produto antes de gerar com IA');
      setActiveTab('identity');
      return;
    }

    // Passa null quando é global — edge function vai carregar contexto org-wide
    const result = await generateAgent(
      formData.product_id || null,
      formData.agent_type,
      contextOverride
    );
    if (result) {
      const aiHum: any = (result as any).humanization || {};
      const baseHum: any = (formData.humanization as any) || DEFAULT_HUMANIZATION;
      const mergedHumanization = {
        ...DEFAULT_HUMANIZATION,
        ...baseHum,
        ...aiHum,
        enabled: true,
        timing:    { ...DEFAULT_HUMANIZATION.timing,    ...(baseHum.timing    || {}), ...(aiHum.timing    || {}) },
        splitting: { ...DEFAULT_HUMANIZATION.splitting, ...(baseHum.splitting || {}), ...(aiHum.splitting || {}) },
        style:     { ...DEFAULT_HUMANIZATION.style,     ...(baseHum.style     || {}), ...(aiHum.style     || {}) },
        persona:   { ...DEFAULT_HUMANIZATION.persona,   ...(baseHum.persona   || {}), ...(aiHum.persona   || {}) },
        tics:      { ...DEFAULT_HUMANIZATION.tics,      ...(baseHum.tics      || {}), ...(aiHum.tics      || {}) },
        reactions: aiHum.reactions?.rules?.length
          ? { enabled: aiHum.reactions.enabled !== false, rules: aiHum.reactions.rules }
          : (baseHum.reactions || DEFAULT_HUMANIZATION.reactions),
      };
      const { humanization: _omit, ...rest } = result as any;
      setFormData(prev => ({
        ...prev,
        ...rest,
        humanization: mergedHumanization,
        agent_type: prev.agent_type,
        product_id: prev.product_id ?? null,
      }));
      toast.success('Agente gerado! Revise as configurações e ajuste se necessário.');
    }
  };

  const handleGenerateWithAI = async () => {
    if (!formData.agent_type) {
      toast.error('Selecione o tipo de agente primeiro');
      setActiveTab('identity');
      return;
    }
    // Sempre abre o dialog para o usuário poder somar contexto externo ao conhecimento interno
    setContextDialogOpen(true);
  };

  const handleConfirmCustomContext = async () => {
    setContextDialogOpen(false);
    const ctx = customContext.trim();
    await runGenerateWithAI(ctx ? ctx : undefined);
    setCustomContext('');
  };

  // Lista o que está faltando para criar (usado no header e na validação do clique)
  const missingFields: string[] = [];
  if (!formData.name?.trim()) missingFields.push('nome');
  if (!isGlobalType(formData.agent_type) && !formData.product_id) missingFields.push('produto');

  const handleOptimizeField = async (field: keyof ProductAgent) => {
    const currentValue = formData[field];
    if (!currentValue || (Array.isArray(currentValue) && currentValue.length === 0)) {
      toast.error('Preencha o campo antes de otimizar');
      return;
    }

    setOptimizingField(field);
    const result = await optimizeField(
      formData.product_id || '',
      formData.agent_type || 'custom',
      field,
      currentValue as string | string[]
    );

    if (result) {
      setFormData(prev => ({
        ...prev,
        [field]: result.optimized,
      }));
      toast.success(result.reasoning || 'Campo otimizado!');
    }
    setOptimizingField(null);
  };

  const handleTypeChange = (type: AgentType) => {
    const template = AGENT_TEMPLATES[type];
    const becomesGlobal = isGlobalType(type);
    if (becomesGlobal) setScope('global');
    setFormData(prev => ({
      ...prev,
      agent_type: type,
      // Auto-clear product when switching to a global type
      product_id: becomesGlobal ? null : (prev.product_id ?? null),
      name: prev.name || template.name,
      description: prev.description || template.description,
      primary_objective: template.primary_objective,
      can_do: template.can_do,
      cannot_do: template.cannot_do,
      handoff_triggers: template.handoff_triggers,
      tone_style: template.tone_style,
      message_style: template.message_style,
    }));
  };

  const handleScopeChange = (newScope: 'global' | 'product') => {
    setScope(newScope);
    setFormData(prev => ({
      ...prev,
      product_id: newScope === 'global' ? null : (prev.product_id ?? null),
    }));
  };

  const handleArrayAdd = (field: keyof ProductAgent, value: string) => {
    if (!value.trim()) return;
    const current = (formData[field] as string[]) || [];
    setFormData(prev => ({
      ...prev,
      [field]: [...current, value.trim()],
    }));
  };

  const handleArrayRemove = (field: keyof ProductAgent, index: number) => {
    const current = (formData[field] as string[]) || [];
    setFormData(prev => ({
      ...prev,
      [field]: current.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Dê um nome ao agente');
      setActiveTab('identity');
      setTimeout(() => {
        const el = document.getElementById('name') as HTMLInputElement | null;
        el?.focus();
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
    if (!isGlobalType(formData.agent_type) && !formData.product_id) {
      toast.error('Selecione um produto ou mude o tipo para Administrativo/Suporte/Financeiro (globais)');
      setActiveTab('identity');
      return;
    }
    // Fallback: garante objetivo mínimo para custom/admin sem template
    const payload = {
      ...formData,
      primary_objective:
        formData.primary_objective?.trim() ||
        (isGlobalType(formData.agent_type)
          ? `Atender e direcionar conversas em escopo ${AGENT_TYPE_LABELS[formData.agent_type as AgentType]}.`
          : 'Atender o lead conforme o objetivo definido.'),
    };
    onSave(payload);
  };

  const handleRetrain = useCallback(async () => {
    if (!agent?.id) return;
    setIsRetraining(true);
    try {
      // Save current form data first
      onSave(formData);
      
      // Force the webchat-bot to pick up new config by touching the agent record
      await supabase
        .from('product_agents')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', agent.id);
      
      toast.success('Agente retreinado! As alterações já estão ativas.');
    } catch (err) {
      toast.error('Erro ao retreinar o agente');
    } finally {
      setIsRetraining(false);
    }
  }, [agent?.id, formData, onSave]);

  const isEditing = !!agent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              {isEditing ? 'Editar Agente' : 'Criar Novo Agente'}
            </DialogTitle>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateWithAI}
                disabled={isGenerating || !formData.agent_type}
                className="gap-2 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-300 hover:border-violet-400 hover:bg-violet-500/20"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 text-violet-600" />
                )}
                <span className="text-violet-700 dark:text-violet-300">
                  {isGenerating ? 'Gerando...' : 'Gerar com IA'}
                </span>
              </Button>
            )}
          </div>
          {!isEditing && missingFields.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="destructive" className="text-xs font-normal">
                Faltam: {missingFields.join(', ')}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Preencha para criar o agente
              </span>
            </div>
          )}
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="mt-4 shrink-0 overflow-x-auto px-6">
            {formData.agent_type === 'admin' ? (
              // Admin agent: 5 focused tabs (Identity, Personality, Objective, Executive, History/Test)
              <TabsList className="inline-flex h-auto w-max gap-1">
                <TabsTrigger value="identity" className="text-xs whitespace-nowrap">
                  <Bot className="h-3 w-3 mr-1" />
                  Identidade
                </TabsTrigger>
                <TabsTrigger value="tone" className="text-xs whitespace-nowrap">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Personalidade
                </TabsTrigger>
                <TabsTrigger value="objective" className="text-xs whitespace-nowrap">
                  <Target className="h-3 w-3 mr-1" />
                  Objetivo
                </TabsTrigger>
                <TabsTrigger value="executive" className="text-xs whitespace-nowrap">
                  <Crown className="h-3 w-3 mr-1" />
                  Executivo
                </TabsTrigger>
                <TabsTrigger value="test" className="text-xs whitespace-nowrap" disabled={!isEditing}>
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Histórico & Teste
                </TabsTrigger>
              </TabsList>
            ) : isOrchestrator ? (
              // Orchestrator: classifier-only tabs + welcome/menu
              <TabsList className="inline-flex h-auto w-max gap-1">
                <TabsTrigger value="identity" className="text-xs whitespace-nowrap">
                  <Bot className="h-3 w-3 mr-1" />Identidade
                </TabsTrigger>
                <TabsTrigger value="objective" className="text-xs whitespace-nowrap">
                  <Target className="h-3 w-3 mr-1" />Objetivo
                </TabsTrigger>
                <TabsTrigger value="welcome" className="text-xs whitespace-nowrap">
                  <Hand className="h-3 w-3 mr-1" />Boas-vindas
                </TabsTrigger>
                <TabsTrigger value="routing" className="text-xs whitespace-nowrap">
                  <Compass className="h-3 w-3 mr-1" />Roteamento
                </TabsTrigger>
                <TabsTrigger value="channels" className="text-xs whitespace-nowrap">
                  <Zap className="h-3 w-3 mr-1" />Canais
                </TabsTrigger>
                <TabsTrigger value="test" className="text-xs whitespace-nowrap" disabled={!isEditing}>
                  <MessageCircle className="h-3 w-3 mr-1" />Testar
                </TabsTrigger>
              </TabsList>
            ) : (
              // Standard agent: full editor (adds Suporte tab when type=support)
              <TabsList className="inline-flex h-auto w-max gap-1">
                <TabsTrigger value="identity" className="text-xs whitespace-nowrap">
                  <Bot className="h-3 w-3 mr-1" />
                  Identidade
                </TabsTrigger>
                <TabsTrigger value="objective" className="text-xs whitespace-nowrap">
                  <Target className="h-3 w-3 mr-1" />
                  Objetivo
                </TabsTrigger>
                <TabsTrigger value="behavior" className="text-xs whitespace-nowrap">
                  <Settings2 className="h-3 w-3 mr-1" />
                  Regras
                </TabsTrigger>
                <TabsTrigger value="tone" className="text-xs whitespace-nowrap">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Tom
                </TabsTrigger>
                <TabsTrigger value="humanization" className="text-xs whitespace-nowrap">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Humanização
                </TabsTrigger>
                <TabsTrigger value="tools" className="text-xs whitespace-nowrap">
                  <Wrench className="h-3 w-3 mr-1" />
                  Ferramentas
                </TabsTrigger>
                <TabsTrigger value="scheduling" className="text-xs whitespace-nowrap">
                  <Calendar className="h-3 w-3 mr-1" />
                  Agendamento
                </TabsTrigger>
                <TabsTrigger value="channels" className="text-xs whitespace-nowrap">
                  <Zap className="h-3 w-3 mr-1" />
                  Canais
                </TabsTrigger>
                {isSupport && (
                  <TabsTrigger value="support" className="text-xs whitespace-nowrap">
                    <BookOpen className="h-3 w-3 mr-1" />
                    Suporte
                  </TabsTrigger>
                )}
                <TabsTrigger value="training" className="text-xs whitespace-nowrap" disabled={!isEditing}>
                  <GraduationCap className="h-3 w-3 mr-1" />
                  Treinar
                </TabsTrigger>
                <TabsTrigger value="test" className="text-xs whitespace-nowrap" disabled={!isEditing}>
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Testar
                </TabsTrigger>
              </TabsList>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">
              {/* Tab: Identity */}
              <TabsContent value="identity" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Agente</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione o tipo e clique em "Gerar com IA" para criar automaticamente
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(AGENT_TEMPLATES) as AgentType[]).map((type) => {
                      const template = AGENT_TEMPLATES[type];
                      return (
                        <button
                          key={type}
                          onClick={() => handleTypeChange(type)}
                          className={cn(
                            'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
                            formData.agent_type === type
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="text-2xl">{template.icon}</span>
                          <span className="text-xs font-medium">{AGENT_TYPE_LABELS[type]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Vínculo: Global vs Produto */}
                <div className="space-y-2">
                  <Label>Vínculo</Label>
                  <p className="text-xs text-muted-foreground">
                    {isGlobalType(formData.agent_type)
                      ? 'Tipos administrativos sempre são globais (atendem toda a organização).'
                      : 'Escolha se este agente atende toda a organização ou apenas um produto.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleScopeChange('global')}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                        scope === 'global'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <Globe className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Global</div>
                        <div className="text-xs text-muted-foreground">Sem produto</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('product')}
                      disabled={isGlobalType(formData.agent_type)}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                        scope === 'product'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50',
                        isGlobalType(formData.agent_type) && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Package className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Específico</div>
                        <div className="text-xs text-muted-foreground">De um produto</div>
                      </div>
                    </button>
                  </div>

                  {!isGlobalType(formData.agent_type) && scope === 'product' && (
                    <div className="space-y-1">
                      <Select
                        value={formData.product_id || ''}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, product_id: v }))}
                      >
                        <SelectTrigger
                          className={cn(
                            !formData.product_id && 'border-destructive ring-1 ring-destructive/40'
                          )}
                        >
                          <SelectValue placeholder="Selecione um produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.length === 0 && (
                            <div className="px-2 py-3 text-xs text-muted-foreground">
                              Nenhum produto cadastrado. Crie um produto primeiro.
                            </div>
                          )}
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5" />
                                {p.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!formData.product_id && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          ↑ Selecione qual produto este agente vai atender
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Agente</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: SDR Qualificador"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Breve descrição do agente..."
                    rows={2}
                  />
                </div>
              </TabsContent>

              {/* Tab: Objective */}
              <TabsContent value="objective" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="objective">Objetivo Principal</Label>
                      <p className="text-xs text-muted-foreground">
                        Qual é a principal missão deste agente?
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOptimizeField('primary_objective')}
                      disabled={optimizingField === 'primary_objective' || !formData.primary_objective}
                      className="text-xs gap-1"
                    >
                      {optimizingField === 'primary_objective' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-violet-500" />
                      )}
                      Otimizar
                    </Button>
                  </div>
                  <Textarea
                    id="objective"
                    value={formData.primary_objective || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, primary_objective: e.target.value }))}
                    placeholder="Ex: Qualificar leads e encaminhar para o closer quando houver interesse real"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="additional_prompt">
                        <Sparkles className="h-3 w-3 inline mr-1" />
                        Prompt Complementar (opcional)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Instruções adicionais além do Cérebro do Produto
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        onValueChange={async (role) => {
                          const { PROMPT_TEMPLATES } = await import('./AgentPromptTemplates');
                          const tpl = PROMPT_TEMPLATES[role as keyof typeof PROMPT_TEMPLATES];
                          if (tpl) {
                            setFormData(prev => ({ ...prev, additional_prompt: tpl.template }));
                            toast.success(`Template "${tpl.label}" carregado`);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-[140px]">
                          <SelectValue placeholder="Template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.agent_type === 'admin' ? (
                            <>
                              <SelectItem value="admin_executive">Executivo direto</SelectItem>
                              <SelectItem value="admin_strategic">Consultor estratégico</SelectItem>
                              <SelectItem value="admin_auditor">Auditor crítico</SelectItem>
                              <SelectItem value="admin_coach">Coach da equipe</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="orchestrator">Orquestrador</SelectItem>
                              <SelectItem value="sdr">SDR</SelectItem>
                              <SelectItem value="closer">Closer</SelectItem>
                              <SelectItem value="cs">Customer Success</SelectItem>
                              <SelectItem value="support">Suporte</SelectItem>
                              <SelectItem value="financial">Financeiro</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOptimizeField('additional_prompt')}
                        disabled={optimizingField === 'additional_prompt' || !formData.additional_prompt}
                        className="text-xs gap-1"
                      >
                        {optimizingField === 'additional_prompt' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-violet-500" />
                        )}
                        Otimizar
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="additional_prompt"
                    value={formData.additional_prompt || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, additional_prompt: e.target.value }))}
                    placeholder="Instruções específicas para este agente... Use {{product_name}}, {{organization_name}} e outras variáveis."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Variáveis disponíveis: <code>{'{{organization_name}}'}</code>, <code>{'{{product_name}}'}</code>, <code>{'{{agent_name}}'}</code>, <code>{'{{orchestrator_context}}'}</code>, <code>{'{{product_benefits}}'}</code>, <code>{'{{product_plans}}'}</code>, <code>{'{{product_prices}}'}</code>, <code>{'{{product_guarantee}}'}</code>
                  </p>
                </div>
              </TabsContent>

              {/* Tab: Behavior */}
              <TabsContent value="behavior" className="mt-0 space-y-6">
                <AgentActivationRules
                  formData={formData}
                  onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                />

                <ArrayField
                  label="O que pode fazer"
                  items={formData.can_do || []}
                  onAdd={(v) => handleArrayAdd('can_do', v)}
                  onRemove={(i) => handleArrayRemove('can_do', i)}
                  placeholder="Ex: Fazer perguntas de qualificação"
                />

                <ArrayField
                  label="O que NÃO pode fazer"
                  items={formData.cannot_do || []}
                  onAdd={(v) => handleArrayAdd('cannot_do', v)}
                  onRemove={(i) => handleArrayRemove('cannot_do', i)}
                  placeholder="Ex: Falar de preço fechado"
                />

                <ArrayField
                  label="Quando passar para humano"
                  items={formData.handoff_triggers || []}
                  onAdd={(v) => handleArrayAdd('handoff_triggers', v)}
                  onRemove={(i) => handleArrayRemove('handoff_triggers', i)}
                  placeholder="Ex: Lead pede para falar com humano"
                />

                <ArrayField
                  label="Quando encerrar conversa"
                  items={formData.end_conversation_triggers || []}
                  onAdd={(v) => handleArrayAdd('end_conversation_triggers', v)}
                  onRemove={(i) => handleArrayRemove('end_conversation_triggers', i)}
                  placeholder="Ex: Lead confirma que não tem interesse"
                />

                {/* === Transferência entre agentes === */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">Transferência entre agentes</h4>
                      <p className="text-xs text-muted-foreground">
                        Mensagens enviadas automaticamente quando este agente transfere
                        a conversa, ou quando ele assume uma conversa de outro agente.
                      </p>
                    </div>
                  </div>

                  {/* Escopo de transferência — depende se o agente está vinculado a um produto ou é global */}
                  {formData.product_id ? (
                    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">🔒</span>
                      <div>
                        <strong>Agente vinculado a um produto.</strong> Este agente só
                        poderá transferir conversas para outros agentes do <strong>mesmo produto</strong>{' '}
                        ou para agentes <strong>globais</strong> (Admin / Orquestrador). Tentativas de
                        transferência cruzada entre produtos são bloqueadas pelo sistema.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">🌐</span>
                      <div>
                        <strong>Agente global.</strong> Este agente pode rotear conversas
                        para qualquer agente da organização (entre produtos diferentes).
                      </div>
                    </div>
                  )}

                  {/* Aviso quando ambos os campos de handoff estão vazios — sem isso, a transferência sai muda */}
                  {!formData.handoff_outgoing_message?.trim() &&
                    !formData.handoff_incoming_message?.trim() && (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">⚠️</span>
                        <div>
                          <strong>Nenhuma mensagem de transferência configurada.</strong>{' '}
                          Sem despedida e sem apresentação, a troca de agente acontece em silêncio
                          e o lead pode ficar perdido. Preencha pelo menos um dos campos abaixo.
                        </div>
                      </div>
                    )}

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Mensagem ao transferir <span className="text-muted-foreground">(despedida)</span>
                    </Label>
                    <Textarea
                      value={formData.handoff_outgoing_message ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, handoff_outgoing_message: e.target.value }))
                      }
                      placeholder="Ex: Perfeito {{nome}}! Vou te transferir para a {{proximo_agente}}, que vai dar continuidade no seu atendimento. Um momento…"
                      rows={3}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Variáveis: <code>{'{{nome}}'}</code>, <code>{'{{produto}}'}</code>,{' '}
                      <code>{'{{proximo_agente}}'}</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Mensagem ao assumir <span className="text-muted-foreground">(apresentação automática)</span>
                    </Label>
                    <Textarea
                      value={formData.handoff_incoming_message ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, handoff_incoming_message: e.target.value }))
                      }
                      placeholder="Ex: Olá {{nome}}, aqui é a Ana, responsável pelo comercial do {{produto}}. Vi que você estava falando com a {{agente_anterior}} sobre {{resumo}}. Podemos seguir por aqui?"
                      rows={4}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Variáveis: <code>{'{{nome}}'}</code>, <code>{'{{produto}}'}</code>,{' '}
                      <code>{'{{agente_anterior}}'}</code>, <code>{'{{resumo}}'}</code>
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Esta mensagem é disparada automaticamente após o atraso configurado,
                      mesmo que o lead não responda.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Atraso da apresentação (segundos)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={formData.handoff_delay_seconds ?? 4}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            handoff_delay_seconds: Math.max(0, Math.min(120, parseInt(e.target.value || '4', 10))),
                          }))
                        }
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Tempo entre a despedida e a saudação do novo agente.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Atraso entre mensagens (segundos)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={formData.message_delay_seconds ?? 2}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            message_delay_seconds: Math.max(0, Math.min(30, parseInt(e.target.value || '2', 10))),
                          }))
                        }
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Pausa natural entre mensagens consecutivas deste agente.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <Label className="text-xs">Incluir resumo da conversa anterior</Label>
                      <p className="text-xs text-muted-foreground">
                        Gera um resumo curto e disponibiliza como <code>{'{{resumo}}'}</code>.
                      </p>
                    </div>
                    <Switch
                      checked={formData.handoff_include_summary !== false}
                      onCheckedChange={(v) =>
                        setFormData((prev) => ({ ...prev, handoff_include_summary: v }))
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Tab: Tone */}
              <TabsContent value="tone" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Estilo de Tom</Label>
                  <Select
                    value={formData.tone_style}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, tone_style: v as ToneStyle }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TONE_STYLE_LABELS) as ToneStyle[]).map((style) => (
                        <SelectItem key={style} value={style}>
                          {TONE_STYLE_LABELS[style]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tamanho das Mensagens</Label>
                  <Select
                    value={formData.message_style}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, message_style: v as MessageStyle }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MESSAGE_STYLE_LABELS) as MessageStyle[]).map((style) => (
                        <SelectItem key={style} value={style}>
                          {MESSAGE_STYLE_LABELS[style]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border border-dashed bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    💡 O <strong>modelo de IA</strong> usado pelos agentes de conversa é definido em{' '}
                    <strong>Configurações → Integrações → Roteamento de IA</strong> (capacidade
                    "Agentes de conversa") e vale para toda a organização.
                  </p>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Sempre terminar com pergunta?</Label>
                    <p className="text-xs text-muted-foreground">
                      Estimula o lead a continuar a conversa
                    </p>
                  </div>
                  <Switch
                    checked={formData.always_end_with_question}
                    onCheckedChange={(v) => setFormData(prev => ({ ...prev, always_end_with_question: v }))}
                  />
                </div>

                <ArrayField
                  label="Frases Obrigatórias"
                  items={formData.required_phrases || []}
                  onAdd={(v) => handleArrayAdd('required_phrases', v)}
                  onRemove={(i) => handleArrayRemove('required_phrases', i)}
                  placeholder="Ex: Posso ajudar em algo mais?"
                />

                <ArrayField
                  label="Frases Proibidas"
                  items={formData.prohibited_phrases || []}
                  onAdd={(v) => handleArrayAdd('prohibited_phrases', v)}
                  onRemove={(i) => handleArrayRemove('prohibited_phrases', i)}
                  placeholder="Ex: Infelizmente não podemos..."
                />
              </TabsContent>

              {/* Tab: Humanization */}
              <TabsContent value="humanization" className="mt-0">
                <AgentHumanizationTab
                  value={(formData.humanization as any) ?? null}
                  onChange={(next) => setFormData((p) => ({ ...p, humanization: next as any }))}
                />
              </TabsContent>

              {/* Tab: Tools */}
              <TabsContent value="tools" className="mt-0">
                <AgentToolsTab
                  formData={formData}
                  onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                />
              </TabsContent>

              {/* Tab: Scheduling */}
              <TabsContent value="scheduling" className="mt-0">
                <AgentSchedulingTab
                  formData={formData}
                  onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                />
              </TabsContent>

              {/* Tab: Channels */}
              <TabsContent value="channels" className="mt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Defina onde este agente estará disponível para atuar
                </p>

                {/* Conexão WhatsApp dedicada */}
                <div className="space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Conexão WhatsApp dedicada</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se selecionada, este agente <strong>só responderá</strong> mensagens recebidas neste número de WhatsApp.
                    Útil para isolar atendimento por número (ex.: Ana atende no número X, Sofia no número Y).
                  </p>
                  <Select
                    value={formData.evolution_instance_id || '__any__'}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        evolution_instance_id: v === '__any__' ? null : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Qualquer conexão (padrão)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5" />
                          <span>Qualquer conexão (padrão)</span>
                        </div>
                      </SelectItem>
                      {(evolutionInstances || []).map((inst) => {
                        const connected = inst.status === 'connected' || inst.status === 'paired';
                        return (
                          <SelectItem key={inst.id} value={inst.id}>
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-3.5 w-3.5" />
                              <span>
                                {inst.name}
                                {inst.phone_number ? ` — ${inst.phone_number}` : ''}
                              </span>
                              <span
                                className={cn(
                                  'ml-auto h-2 w-2 rounded-full',
                                  connected ? 'bg-success' : 'bg-muted-foreground'
                                )}
                                title={connected ? 'Conectado' : 'Desconectado'}
                              />
                            </div>
                          </SelectItem>
                        );
                      })}
                      {(!evolutionInstances || evolutionInstances.length === 0) && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          Nenhuma conexão WhatsApp cadastrada.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.evolution_instance_id &&
                    (() => {
                      const inst = evolutionInstances?.find(
                        (i) => i.id === formData.evolution_instance_id
                      );
                      const connected =
                        inst && (inst.status === 'connected' || inst.status === 'paired');
                      if (inst && !connected) {
                        return (
                          <p className="text-xs text-destructive">
                            ⚠️ Esta conexão está desconectada. Reconecte para o agente operar.
                          </p>
                        );
                      }
                      return null;
                    })()}
                </div>

                <div className="space-y-3">
                  {(Object.entries(CHANNEL_LABELS) as [keyof typeof CHANNEL_LABELS, string][]).map(
                    ([key, label]) => (
                      <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                        <span className="font-medium text-sm">{label}</span>
                        <Switch
                          checked={formData[key as keyof ProductAgent] as boolean}
                          onCheckedChange={(v) => setFormData(prev => ({ ...prev, [key]: v }))}
                        />
                      </div>
                    )
                  )}
                </div>

              </TabsContent>

              {/* Tab: Executive (apenas para tipo admin) */}
              {formData.agent_type === 'admin' && (
                <TabsContent value="executive" className="mt-0">
                  <AdminExecutivePanel compact />
                </TabsContent>
              )}

              {/* Tab: Support materials (apenas para tipo support) */}
              {isSupport && (
                <TabsContent value="support" className="mt-0">
                  <AgentSupportTab
                    formData={formData}
                    onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                    agentId={agent?.id}
                  />
                </TabsContent>
              )}

              {/* Tab: Routing matrix (apenas para tipo orchestrator) */}
              {isOrchestrator && (
                <TabsContent value="routing" className="mt-0">
                  <AgentOrchestratorRoutingTab
                    currentAgentId={agent?.id}
                    formData={formData}
                    onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                  />
                </TabsContent>
              )}

              {/* Tab: Welcome + Quick Menu (orchestrator only) */}
              {isOrchestrator && (
                <TabsContent value="welcome" className="mt-0">
                  <AgentWelcomeMenuTab
                    formData={formData}
                    onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                  />
                </TabsContent>
              )}

              <TabsContent value="training" className="mt-0">
                {isEditing && agent?.id ? (
                  <AgentTrainingSection agentId={agent.id} productId={productId} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Salve o agente primeiro</p>
                    <p className="text-sm">O treinamento estará disponível após criar o agente</p>
                  </div>
                )}
              </TabsContent>

              {/* Tab: Test */}
              <TabsContent value="test" className="mt-0">
                {isEditing && agent?.id ? (
                  <AgentTestChat
                    agentId={agent.id}
                    agentName={formData.name || agent.name || 'Agente'}
                    productId={productId}
                    agentType={formData.agent_type || agent.agent_type}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Salve o agente primeiro</p>
                    <p className="text-sm">O teste estará disponível após criar o agente</p>
                  </div>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-between gap-2 px-6 py-4 border-t shrink-0">
          <div>
            {isEditing && (
              <Button
                variant="outline"
                onClick={handleRetrain}
                disabled={isRetraining || !formData.name || !formData.primary_objective}
                className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/5"
              >
                {isRetraining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 text-primary" />
                )}
                Retreinar Agente
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isLoading}
              title={missingFields.length > 0 ? `Faltam: ${missingFields.join(', ')}` : undefined}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Agente'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Dialog: contexto do agente personalizado */}
      <Dialog open={contextDialogOpen} onOpenChange={(o) => { setContextDialogOpen(o); if (!o) setCustomContext(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-violet-600" />
              Contexto adicional para a IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Descreva detalhes específicos desse agente (público-alvo, restrições, tom, gatilhos especiais). A IA vai combinar isso com o conhecimento do produto e da empresa. Deixe em branco para gerar apenas com o contexto interno.
            </p>
            <Textarea
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="Ex: foque em leads frios vindos do Instagram, evite falar de preço por mensagem, seja mais consultivo..."
              rows={8}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setContextDialogOpen(false)} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmCustomContext}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? 'Gerando...' : 'Gerar Agente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// Helper component for array fields
interface ArrayFieldProps {
  label: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
}

function ArrayField({ label, items, onAdd, onRemove, placeholder }: ArrayFieldProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        />
        <Button type="button" size="icon" variant="outline" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="pr-1">
              {item}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
