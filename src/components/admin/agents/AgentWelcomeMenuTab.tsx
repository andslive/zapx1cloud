import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowUp, ArrowDown, Hand, Bot, MessageCircle, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProductAgent, QuickMenuOption, QuickMenuMode } from '@/types/agents';

interface AgentWelcomeMenuTabProps {
  formData: Partial<ProductAgent>;
  onChange: (patch: Partial<ProductAgent>) => void;
}

const DEFAULT_INTRO = 'Como posso te ajudar?';

function makeBlankOption(): QuickMenuOption {
  return { label: '', action: 'transfer_to_agent', target_agent_id: null };
}

export function AgentWelcomeMenuTab({ formData, onChange }: AgentWelcomeMenuTabProps) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  // Load all candidate agents (excluding the orchestrator itself) so we can route to them.
  const { data: agentsData } = useQuery({
    queryKey: ['quick-menu-target-agents', orgId, formData.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('id, name, agent_type, product_id, products:product_id(name)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .neq('agent_type', 'orchestrator')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const options: QuickMenuOption[] = Array.isArray(formData.quick_menu_options)
    ? (formData.quick_menu_options as QuickMenuOption[])
    : [];

  const updateOptions = (next: QuickMenuOption[]) => {
    onChange({ quick_menu_options: next });
  };

  const addOption = () => {
    if (options.length >= 9) return;
    updateOptions([...options, makeBlankOption()]);
  };

  const removeOption = (idx: number) => {
    updateOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, patch: Partial<QuickMenuOption>) => {
    updateOptions(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const moveOption = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateOptions(next);
  };

  const previewMessage = useMemo(() => {
    const intro = (formData.quick_menu_intro || DEFAULT_INTRO).trim();
    const greeting = (formData.welcome_message || '').trim();
    const lines = options
      .filter(o => o.label.trim())
      .map((o, i) => `${i + 1}- ${o.label.trim()}`);

    const parts: string[] = [];
    if (formData.welcome_enabled && greeting) parts.push(greeting);
    if (formData.quick_menu_mode === 'always' && lines.length) {
      parts.push(`${intro}\n${lines.join('\n')}`);
    }
    return parts.join('\n\n') || '(Configure a saudação ou o menu para ver o preview)';
  }, [formData.welcome_enabled, formData.welcome_message, formData.quick_menu_mode, formData.quick_menu_intro, options]);

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Hand className="h-4 w-4 text-primary" />
                Saudação automática
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Enviada na 1ª mensagem da conversa, antes da IA classificar.
              </CardDescription>
            </div>
            <Switch
              checked={!!formData.welcome_enabled}
              onCheckedChange={(v) => onChange({ welcome_enabled: v })}
            />
          </div>
        </CardHeader>
        {formData.welcome_enabled && (
          <CardContent className="space-y-2">
            <Label className="text-xs">Texto da saudação</Label>
            <Textarea
              rows={3}
              placeholder="Olá! Sou a Malu da TechSales Brasil. Como posso te ajudar hoje?"
              value={formData.welcome_message || ''}
              onChange={(e) => onChange({ welcome_message: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Variáveis: <code>{'{{nome}}'}</code>, <code>{'{{agent_name}}'}</code>, <code>{'{{organization_name}}'}</code>
            </p>
          </CardContent>
        )}
      </Card>

      {/* Quick menu */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-primary" />
                Menu de atalhos
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Lista numerada que o cliente pode escolher digitando o número, sem depender da IA.
              </CardDescription>
            </div>
            <Select
              value={formData.quick_menu_mode || 'off'}
              onValueChange={(v: QuickMenuMode) => onChange({ quick_menu_mode: v })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desligado</SelectItem>
                <SelectItem value="always">Sempre na 1ª mensagem</SelectItem>
                <SelectItem value="fallback">Só quando IA não classificar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {formData.quick_menu_mode !== 'off' && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Texto antes do menu</Label>
              <Input
                placeholder={DEFAULT_INTRO}
                value={formData.quick_menu_intro || ''}
                onChange={(e) => onChange({ quick_menu_intro: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Opções ({options.length}/9)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  disabled={options.length >= 9}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar opção
                </Button>
              </div>

              {options.length === 0 && (
                <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nenhuma opção configurada. Adicione ao menos uma.
                </div>
              )}

              {options.map((opt, idx) => (
                <div key={idx} className="rounded border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0">{idx + 1}</Badge>
                    <Input
                      className="flex-1"
                      placeholder="Ex: Quero saber mais sobre o produto X"
                      value={opt.label}
                      onChange={(e) => updateOption(idx, { label: e.target.value })}
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => moveOption(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => moveOption(idx, 1)} disabled={idx === options.length - 1}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeOption(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Ação</Label>
                      <Select
                        value={opt.action}
                        onValueChange={(v) =>
                          updateOption(idx, {
                            action: v as QuickMenuOption['action'],
                            target_agent_id: v === 'transfer_to_agent' ? opt.target_agent_id : null,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer_to_agent">
                            <span className="flex items-center gap-2"><Bot className="h-3.5 w-3.5" />Transferir para agente</span>
                          </SelectItem>
                          <SelectItem value="transfer_to_human">
                            <span className="flex items-center gap-2"><Hand className="h-3.5 w-3.5" />Transferir para humano</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {opt.action === 'transfer_to_agent' && (
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Agente destino</Label>
                        <Select
                          value={opt.target_agent_id || ''}
                          onValueChange={(v) => updateOption(idx, { target_agent_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar agente..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(agentsData || []).map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}{a.products?.name ? ` — ${a.products.name}` : ' (Global)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Mensagem se cliente digitar opção inválida</Label>
              <Input
                placeholder="Não entendi sua escolha. Responda com o número da opção (1, 2, 3...)."
                value={formData.quick_menu_invalid_message || ''}
                onChange={(e) => onChange({ quick_menu_invalid_message: e.target.value })}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Live preview */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-3.5 w-3.5" />
            Preview do que o cliente vai ver
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-xs font-sans bg-background rounded p-3 border">
            {previewMessage}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
