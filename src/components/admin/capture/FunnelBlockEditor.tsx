import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Plus, 
  Trash2,
  ArrowRight,
  MessageSquare,
  Monitor,
  Smartphone,
  Bot,
  Brain,
  Percent,
  Settings2,
  ChevronDown,
  Sparkles,
  Mic,
  FileText,
  Video as VideoIcon,
  Image as ImageIcon,
  Clock,
  Dices,
  CreditCard,
  HelpCircle,
  RefreshCw,
  MoreVertical,
} from 'lucide-react';
import { FileAndMediaUpload } from '@/components/ui/file-and-media-upload';
import { 
  FunnelBlock, 
  FunnelBlockData, 
  FunnelInputType, 
  FunnelBlockOption,
  FunnelChannel,
  AIObjective,
  AIDecideOutput,
  ABTestVariant,
  AutoSwitchAgentConfig,
  generateBlockId,
  FUNNEL_BLOCK_PALETTE,
  getBlockCategoryColor,
} from '@/types/funnel';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentSwitchEditor } from './AgentSwitchEditor';
import { AutoSwitchConfig } from './AutoSwitchConfig';
import { useProductAgents } from '@/hooks/useProductAgents';
import { useFacebookLeadIntegrations } from '@/hooks/useFacebookLeads';


interface FunnelBlockEditorProps {
  block: FunnelBlock;
  blocks: FunnelBlock[];
  productId: string;
  onUpdate: (updates: Partial<FunnelBlock> | ((block: FunnelBlock) => Partial<FunnelBlock>)) => void;
  onConnect: (targetBlockId: string | null) => void;
}

const CHANNEL_CONFIG: { key: FunnelChannel; label: string; icon: React.ReactNode }[] = [
  { key: 'chat', label: 'Chat', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: 'form', label: 'Form', icon: <Monitor className="h-3.5 w-3.5" /> },
  { key: 'widget', label: 'Widget', icon: <Smartphone className="h-3.5 w-3.5" /> },
];

const AI_OBJECTIVES: { value: AIObjective; label: string; description: string }[] = [
  { value: 'qualify', label: 'Qualificar', description: 'Avaliar interesse e fit do lead' },
  { value: 'sell', label: 'Vender', description: 'Conduzir para fechamento' },
  { value: 'schedule', label: 'Agendar', description: 'Marcar reunião ou demo' },
  { value: 'support', label: 'Suporte', description: 'Tirar dúvidas e ajudar' },
  { value: 'custom', label: 'Personalizado', description: 'Definir objetivo próprio' },
];

export function FunnelBlockEditor({ block, blocks, productId, onUpdate, onConnect }: FunnelBlockEditorProps) {
  const paletteItem = FUNNEL_BLOCK_PALETTE.find(p => p.type === block.type);
  const categoryColors = getBlockCategoryColor(block.type);
  
  const { data: agents } = useProductAgents(productId);
  const { data: fbIntegrations } = useFacebookLeadIntegrations();
  const activeAgents = agents?.filter(a => a.is_active) || [];

  const fbPixels = fbIntegrations
    ?.filter(i => i.pixel_id)
    .map(i => ({ 
      id: i.pixel_id, 
      name: i.pixel_name || i.pixel_id 
    })) || [];


  const getIcon = () => {
    switch (block.type) {
      case 'message': return MessageSquare;
      case 'audio': return Mic;
      case 'video': return VideoIcon;
      case 'document': return FileText;
      case 'image': return ImageIcon;
      case 'ai_receipt': return Brain;
      case 'delay': return Clock;
      case 'wait_response': return Clock;
      case 'ia_pergunta': return HelpCircle;
      case 'pix_button': return CreditCard;
      case 'input': return Monitor;
      case 'buttons': return Plus;
      case 'ai_decide': return Brain;
      case 'condition': return ArrowRight;
      default: return Bot;
    }
  };

  const Icon = getIcon();
  
  const updateData = (key: keyof FunnelBlockData, value: any) => {
    onUpdate({
      data: { ...block.data, [key]: value },
    });
  };

  const otherBlocks = blocks.filter(b => b.id !== block.id);

  return (
    <ScrollArea className="h-full pr-4 -mr-4">
      <div className="text-xs space-y-4 [&_input]:text-xs [&_textarea]:text-xs [&_select]:text-xs [&_button]:text-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            paletteItem?.color || "bg-primary"
          )}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-semibold leading-none">{paletteItem?.label || block.type}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">{paletteItem?.description || 'Configurações do bloco'}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Exibir em</Label>
          <div className="flex gap-2">
            {CHANNEL_CONFIG.map(({ key, label, icon }) => (
              <Button
                key={key}
                variant={block.data.channels?.includes(key) ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => {
                  const current = block.data.channels || ['chat', 'form', 'widget'];
                  if (current.includes(key)) {
                    updateData('channels', current.filter(c => c !== key));
                  } else {
                    updateData('channels', [...current, key]);
                  }
                }}
              >
                {icon}
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {block.type === 'message' && (
          <>
            <div className="space-y-2">
              <Label className="text-xs">Mensagem</Label>
              <Textarea className="text-xs"
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Digite a mensagem..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Delay para Próxima Bolha (segundos)</Label>
              <Input className="text-xs"
                type="number"
                value={(block.data.delay_ms ?? 2000) / 1000}
                onChange={(e) => {
                  const valMs = parseFloat(e.target.value) * 1000;
                  const typingMs = block.data.typing_duration_ms ?? 2000;
                  onUpdate({
                    data: { 
                      ...block.data, 
                      delay_ms: valMs,
                      typing_duration_ms: typingMs > valMs ? valMs : typingMs
                    },
                  });
                }}
                step="0.5"
                min="0"
              />
              <p className="text-[10px] text-muted-foreground">Tempo total antes de enviar o conteúdo</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch 
                  id="show_typing"
                  checked={block.data.show_typing ?? true}
                  onCheckedChange={(checked) => updateData('show_typing', checked)}
                />
                <Label htmlFor="show_typing" className="text-xs">Simular "digitando..."</Label>
              </div>
            </div>
            
            {(block.data.show_typing ?? true) && (
              <div className="space-y-2 pl-2 border-l-2 border-primary/20 mt-2">
                <Label className="text-xs">Duração do Status (segundos)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[ (block.data.typing_duration_ms ?? 2000) / 1000 ]}
                    max={(block.data.delay_ms ?? 2000) / 1000}
                    min={0}
                    step={0.1}
                    onValueChange={(value) => updateData('typing_duration_ms', value[0] * 1000)}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono font-bold bg-muted px-1.5 py-0.5 rounded min-w-[3rem] text-center">
                    {((block.data.typing_duration_ms ?? 2000) / 1000).toFixed(1)}s
                  </span>
                </div>
                {(block.data.typing_duration_ms ?? 0) > (block.data.delay_ms ?? 0) && (
                  <p className="text-[10px] text-destructive font-medium mt-1">
                    ⚠️ Não pode ser maior que o Delay.
                  </p>
                )}
              </div>
            )}
            <Separator />
          </>
        )}

        {block.type === 'audio' && (
          <>
            <div className="space-y-2">
              <Label className="text-xs">Arquivo de Áudio</Label>
              <FileAndMediaUpload
                value={block.data.audio_url || block.data.content || ''}
                onChange={(url) => updateData('audio_url', url)}
                type="audio"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Delay para Próxima Bolha (segundos)</Label>
              <Input className="text-xs"
                type="number"
                value={(block.data.delay_ms ?? 6000) / 1000}
                onChange={(e) => {
                  const valMs = parseFloat(e.target.value) * 1000;
                  const typingMs = block.data.typing_duration_ms ?? 6000;
                  onUpdate({
                    data: { 
                      ...block.data, 
                      delay_ms: valMs,
                      typing_duration_ms: typingMs > valMs ? valMs : typingMs
                    },
                  });
                }}
                step="0.5"
                min="0"
              />
              <p className="text-[10px] text-muted-foreground">Tempo total antes de enviar o áudio</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch 
                  id="show_recording"
                  checked={block.data.show_typing ?? true}
                  onCheckedChange={(checked) => updateData('show_typing', checked)}
                />
                <Label htmlFor="show_recording" className="text-xs">Simular "gravando áudio..."</Label>
              </div>
            </div>
            
            {(block.data.show_typing ?? true) && (
              <div className="space-y-2 pl-2 border-l-2 border-primary/20 mt-2">
                <Label className="text-xs">Duração do Status (segundos)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[ (block.data.typing_duration_ms ?? 6000) / 1000 ]}
                    max={(block.data.delay_ms ?? 6000) / 1000}
                    min={0}
                    step={0.1}
                    onValueChange={(value) => updateData('typing_duration_ms', value[0] * 1000)}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono font-bold bg-muted px-1.5 py-0.5 rounded min-w-[3rem] text-center">
                    {((block.data.typing_duration_ms ?? 6000) / 1000).toFixed(1)}s
                  </span>
                </div>
                {(block.data.typing_duration_ms ?? 0) > (block.data.delay_ms ?? 0) && (
                  <p className="text-[10px] text-destructive font-medium mt-1">
                    ⚠️ Não pode ser maior que o Delay.
                  </p>
                )}
              </div>
            )}
            <Separator />
          </>
        )}

        {block.type === 'ai_receipt' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Mensagem de Instrução</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Ex: Por favor, envie uma foto ou PDF do seu comprovante..."
                rows={3}
                className="text-xs"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Mensagem Enviada (Contexto)</Label>
              <Input
                value={block.data.receipt_sent_message || ''}
                onChange={(e) => updateData('receipt_sent_message', e.target.value)}
                placeholder="Ex: {{mensagem_anterior}} ou texto fixo"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Insira a variável da mensagem anterior para a IA ler.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Ativar Timeout</Label>
                  <p className="text-[10px] text-muted-foreground">Caso o lead não responda</p>
                </div>
                <Switch
                  checked={block.data.timeout_enabled || false}
                  onCheckedChange={(v) => updateData('timeout_enabled', v)}
                />
              </div>

              {block.data.timeout_enabled && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={block.data.timeout_value || 15}
                      onChange={(e) => updateData('timeout_value', parseInt(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <Select
                      value={block.data.timeout_unit || 'minutes'}
                      onValueChange={(v: any) => updateData('timeout_unit', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-xs font-semibold">Funcionalidades</Label>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Entender Áudio</Label>
                  <p className="text-[10px] text-muted-foreground">Processar mensagens de voz</p>
                </div>
                <Switch
                  checked={block.data.receipt_understand_audio ?? true}
                  onCheckedChange={(v) => updateData('receipt_understand_audio', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Entender Imagem</Label>
                  <p className="text-[10px] text-muted-foreground">Processar fotos e imagens</p>
                </div>
                <Switch
                  checked={block.data.receipt_understand_image ?? true}
                  onCheckedChange={(v) => updateData('receipt_understand_image', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Entender PDF</Label>
                  <p className="text-[10px] text-muted-foreground">Processar documentos PDF</p>
                </div>
                <Switch
                  checked={block.data.receipt_understand_pdf ?? true}
                  onCheckedChange={(v) => updateData('receipt_understand_pdf', v)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Mapeamento de Variáveis</Label>
              <div className="space-y-2">
                <Label className="text-[10px]">Salvar Nome Completo em</Label>
                <Input
                  value={block.data.receipt_name_var || 'nomecomprovante'}
                  onChange={(e) => updateData('receipt_name_var', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">Salvar Valor em</Label>
                <Input
                  value={block.data.receipt_value_var || 'valorcomprovante'}
                  onChange={(e) => updateData('receipt_value_var', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Prompt / Sandra</Label>
              <Textarea
                value={block.data.receipt_prompt || ''}
                onChange={(e) => updateData('receipt_prompt', e.target.value)}
                rows={6}
                className="text-xs font-mono"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-semibold">Provedor de IA do bloco</Label>
              <p className="text-[10px] text-muted-foreground">
                Sobrescreve o roteamento padrão da organização. Útil para forçar OpenAI/GPT em comprovantes.
              </p>

              <div className="space-y-1">
                <Label className="text-[10px]">Provedor</Label>
                <Select
                  value={block.data.receipt_ai_provider || 'openai'}
                  onValueChange={(v: any) => updateData('receipt_ai_provider', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lovable">Lovable AI Gateway (padrão)</SelectItem>
                    <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">Modelo</Label>
                <Input
                  value={block.data.receipt_ai_model || ''}
                  onChange={(e) => updateData('receipt_ai_model', e.target.value)}
                  placeholder="Padrão: gpt-5-mini"
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Vazio = OpenAI GPT-5 Mini (padrão global da plataforma).
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">Autenticação</Label>
                <Select
                  value={block.data.receipt_ai_auth_mode || 'global'}
                  onValueChange={(v: any) => updateData('receipt_ai_auth_mode', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Chave global da organização / plataforma</SelectItem>
                    <SelectItem value="manual">Chave manual neste bloco</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {block.data.receipt_ai_auth_mode === 'manual' && (
                <div className="space-y-1">
                  <Label className="text-[10px]">API Key</Label>
                  <Input
                    type="password"
                    value={block.data.receipt_ai_api_key || ''}
                    onChange={(e) => updateData('receipt_ai_api_key', e.target.value)}
                    placeholder="sk-... ou chave do provedor"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-xs font-semibold">Roteamento (Saídas)</Label>
              
              <div className="space-y-2">
                <Label className="text-green-600 text-[10px] uppercase font-semibold">Se Comprovante →</Label>
                <Select
                  value={block.data.true_next_block_id || block.data.sim_next_block_id || 'none'}
                  onValueChange={(v) => {
                    const val = v === 'none' ? null : v;
                    onUpdate({
                      data: { 
                        ...block.data, 
                        true_next_block_id: val || undefined,
                        sim_next_block_id: val || undefined
                      }
                    });
                    if (val) onConnect(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fim</SelectItem>
                    {otherBlocks.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-red-600 text-[10px] uppercase font-semibold">Se Não for →</Label>
                <Select
                  value={block.data.false_next_block_id || block.data.nao_next_block_id || 'none'}
                  onValueChange={(v) => {
                    const val = v === 'none' ? null : v;
                    onUpdate({
                      data: { 
                        ...block.data, 
                        false_next_block_id: val || undefined,
                        nao_next_block_id: val || undefined
                      }
                    });
                    if (val) onConnect(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fim</SelectItem>
                    {otherBlocks.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {block.data.timeout_enabled && (
                <div className="space-y-2">
                  <Label className="text-slate-500 text-[10px] uppercase font-semibold">Se Timeout →</Label>
                  <Select
                    value={block.data.timeout_next_block_id || 'none'}
                    onValueChange={(v) => {
                      const val = v === 'none' ? null : v;
                      onUpdate({
                        data: { 
                          ...block.data, 
                          timeout_next_block_id: val || undefined
                        }
                      });
                      if (val) onConnect(val);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Próximo bloco..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fim</SelectItem>
                      {otherBlocks.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}

        {block.type === 'wait_response' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Mensagem de Pergunta</Label>
              <Textarea
                value={block.data.wait_response_message || ''}
                onChange={(e) => updateData('wait_response_message', e.target.value)}
                placeholder="Digite a pergunta que o bot deve fazer antes de aguardar..."
                rows={3}
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Esta mensagem será enviada antes do bot ficar aguardando a resposta.</p>
            </div>
            
            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Salvar Resposta em</Label>
                  <p className="text-[10px] text-muted-foreground">Nome da variável para usar depois</p>
                </div>
              </div>
              <Input
                value={block.data.variable_name || 'resposta'}
                onChange={(e) => updateData('variable_name', e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Configurações de Tempo</Label>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Aguardar Indefinitamente</Label>
                  <p className="text-[10px] text-muted-foreground">O fluxo só continua quando o lead responder</p>
                </div>
                <Switch
                  checked={block.data.wait_indefinitely || false}
                  onCheckedChange={(v) => updateData('wait_indefinitely', v)}
                />
              </div>

              {!block.data.wait_indefinitely && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Ativar Limite (Timeout)</Label>
                      <p className="text-[10px] text-muted-foreground">Executar ação se não houver resposta</p>
                    </div>
                    <Switch
                      checked={block.data.timeout_enabled ?? true}
                      onCheckedChange={(v) => updateData('timeout_enabled', v)}
                    />
                  </div>

                  {block.data.timeout_enabled !== false && (
                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Valor</Label>
                        <Input
                          type="number"
                          value={block.data.timeout_value ?? 15}
                          onChange={(e) => updateData('timeout_value', parseInt(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Unidade</Label>
                        <Select
                          value={block.data.timeout_unit || 'minutes'}
                          onValueChange={(v: any) => updateData('timeout_unit', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="seconds">Segundos</SelectItem>
                            <SelectItem value="minutes">Minutos</SelectItem>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-xs font-semibold">Recursos do WhatsApp</Label>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Responder Mensagem</Label>
                  <p className="text-[10px] text-muted-foreground">Marca a mensagem do lead ao responder</p>
                </div>
                <Switch
                  checked={block.data.reply_to_message || false}
                  onCheckedChange={(v) => updateData('reply_to_message', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Reagir com Emoji</Label>
                  <p className="text-[10px] text-muted-foreground">Reage à mensagem assim que recebida</p>
                </div>
                <Switch
                  checked={block.data.react_to_message || false}
                  onCheckedChange={(v) => updateData('react_to_message', v)}
                />
              </div>

              {block.data.react_to_message && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                  <Label className="text-[10px]">Emoji da Reação</Label>
                  <Input
                    value={block.data.reaction_emoji || '👍'}
                    onChange={(e) => updateData('reaction_emoji', e.target.value)}
                    className="h-8 text-xs w-12 text-center"
                    maxLength={2}
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-xs font-semibold">Saídas do Fluxo</Label>
              
              <div className="space-y-2">
                <Label className="text-green-600 text-[10px] uppercase font-semibold">Se Responder (Sucesso) →</Label>
                <Select
                  value={block.data.success_next_block_id || block.next_block_id || 'none'}
                  onValueChange={(v) => {
                    const val = v === 'none' ? null : v;
                    onUpdate({
                      next_block_id: val,
                      data: { 
                        ...block.data, 
                        success_next_block_id: val || undefined
                      }
                    });
                    if (val) onConnect(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fim</SelectItem>
                    {otherBlocks.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!block.data.wait_indefinitely && block.data.timeout_enabled !== false && (
                <div className="space-y-2">
                  <Label className="text-slate-500 text-[10px] uppercase font-semibold">Se Não Responder (Timeout) →</Label>
                  <Select
                    value={block.data.timeout_next_block_id || 'none'}
                    onValueChange={(v) => {
                      const val = v === 'none' ? null : v;
                      updateData('timeout_next_block_id', val || undefined);
                      if (val) onConnect(val);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Próximo bloco..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fim</SelectItem>
                      {otherBlocks.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Separator />
          </div>
        )}

        {block.type === 'pixel' && (

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Pixel *</Label>
              <Select
                value={block.data.pixel_name || 'Todos os Pixels'}
                onValueChange={(v) => updateData('pixel_name', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione o Pixel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos os Pixels">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 text-blue-500" />
                      Todos os Pixels
                    </div>
                  </SelectItem>
                  {fbPixels.map(pixel => (
                    <SelectItem key={pixel.id} value={pixel.id!}>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {pixel.name}
                      </div>
                    </SelectItem>
                  ))}

                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Evento *</Label>
              <Select
                value={block.data.pixel_event_type || 'Purchase'}
                onValueChange={(v: any) => updateData('pixel_event_type', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Compra (Purchase)</SelectItem>
                  <SelectItem value="Lead">Lead</SelectItem>
                  <SelectItem value="InitiateCheckout">Iniciar Checkout (InitiateCheckout)</SelectItem>
                  <SelectItem value="AddToCart">Adicionar ao Carrinho (AddToCart)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Moeda</Label>
              <Select
                value={block.data.pixel_currency || 'BRL'}
                onValueChange={(v) => updateData('pixel_currency', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">R$ — Real Brasileiro (BRL)</SelectItem>
                  <SelectItem value="USD">US$ — Dólar Americano (USD)</SelectItem>
                  <SelectItem value="EUR">€ — Euro (EUR)</SelectItem>
                  <SelectItem value="GBP">£ — Libra Esterlina (GBP)</SelectItem>
                  <SelectItem value="ARS">AR$ — Peso Argentino (ARS)</SelectItem>
                  <SelectItem value="MXN">MX$ — Peso Mexicano (MXN)</SelectItem>
                  <SelectItem value="COP">CO$ — Peso Colombiano (COP)</SelectItem>
                  <SelectItem value="CLP">CL$ — Peso Chileno (CLP)</SelectItem>
                  <SelectItem value="PEN">S/ — Sol Peruano (PEN)</SelectItem>
                  <SelectItem value="JPY">¥ — Iene Japonês (JPY)</SelectItem>
                  <SelectItem value="CAD">C$ — Dólar Canadense (CAD)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Padrão: <span className="text-emerald-500">BRL (Real Brasileiro)</span>. O evento será enviado à Meta com a moeda selecionada.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Valor do Evento (R$)</Label>
              <Input
                value={block.data.pixel_item_value || ''}
                onChange={(e) => updateData('pixel_item_value', e.target.value)}
                placeholder="Ex: 97.00 ou {{event_value}}"
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge 
                  variant="outline" 
                  className="text-[9px] cursor-pointer hover:bg-emerald-500/10 border-emerald-500/30 text-emerald-600 bg-emerald-500/5 px-1 py-0 h-4"
                  onClick={() => updateData('pixel_item_value', 'valorcomprovante')}
                >
                  💰 valorcomprovante (valor do PIX)
                </Badge>
                {['ai_error', 'contactName', 'dia_da_semana', 'resposta1', 'resposta2'].map(v => (
                  <Badge 
                    key={v}
                    variant="outline" 
                    className="text-[9px] cursor-pointer hover:bg-muted bg-muted/30 border-muted-foreground/30 px-1 py-0 h-4 text-muted-foreground"
                    onClick={() => updateData('pixel_item_value', `{{${v}}}`)}
                  >
                    {"{{"}{v}{"}}"}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Deixe vazio ou use <span className="text-emerald-500">{"{{event_value}}"}</span> para enviar o valor extraído do comprovante PIX automaticamente. Moeda: <span className="text-emerald-500">BRL</span>.
              </p>
            </div>
            <Separator />
          </div>
        )}


        {block.type === 'video' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tipo de Vídeo</Label>
              <Select
                value={block.data.video_type || 'file'}
                onValueChange={(v: any) => updateData('video_type', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">Arquivo Direto / WhatsApp</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="vimeo">Vimeo</SelectItem>
                  <SelectItem value="embed">Embed Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">URL do Vídeo</Label>
              {block.data.video_type === 'file' ? (
                <FileAndMediaUpload
                  value={block.data.video_url}
                  onChange={(url) => updateData('video_url', url)}
                  type="video"
                />
              ) : (
                <Input
                  value={block.data.video_url || ''}
                  onChange={(e) => updateData('video_url', e.target.value)}
                  placeholder="https://..."
                  className="h-8 text-xs"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Legenda (Opcional)</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Legenda do vídeo..."
                rows={2}
                className="text-xs"
              />
            </div>
            <Separator />
          </div>
        )}

        {block.type === 'document' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Arquivos / PDFs</Label>
              
              {block.data.document_urls && block.data.document_urls.length > 0 && (
                <div className="space-y-2 mb-3">
                  {block.data.document_urls.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-border/50 group">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-[10px] font-medium truncate flex-1">{doc.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          onUpdate((currentBlock) => {
                            const newUrls = [...(currentBlock.data.document_urls || [])];
                            const removedDoc = newUrls[idx];
                            newUrls.splice(idx, 1);

                            return {
                              data: {
                                ...currentBlock.data,
                                document_urls: newUrls,
                                document_url: removedDoc?.url === currentBlock.data.document_url ? (newUrls[0]?.url || '') : currentBlock.data.document_url,
                                file_name: removedDoc?.url === currentBlock.data.document_url ? (newUrls[0]?.name || '') : currentBlock.data.file_name
                              }
                            };
                          });
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <FileAndMediaUpload
                key={`document-upload-${block.id}`}
                multiple
                values={(block.data.document_urls || []).map(d => d.url)}
                onChange={(url, name) => {
                  const newDoc = { url, name: name || url.split('/').pop() || 'documento.pdf' };
                  onUpdate((currentBlock) => {
                    const currentUrls = currentBlock.data.document_urls || [];

                    return {
                      data: { 
                        ...currentBlock.data, 
                        document_urls: [...currentUrls, newDoc],
                        document_url: url,
                        file_name: name || newDoc.name
                      }
                    };
                  });
                }}
                type="document"
                folder={`funnels/${productId}/documents/${block.id}`}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Nome do Arquivo</Label>
              <Input
                value={block.data.file_name || ''}
                onChange={(e) => updateData('file_name', e.target.value)}
                placeholder="exemplo.pdf"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Legenda (Opcional)</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Legenda do arquivo..."
                rows={2}
                className="text-xs"
              />
            </div>
            <Separator />
          </div>
        )}

        {block.type === 'image' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Imagem</Label>
              <FileAndMediaUpload
                value={block.data.image_url}
                onChange={(url) => updateData('image_url', url)}
                type="image"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Legenda (Opcional)</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Legenda da imagem..."
                rows={2}
                className="text-xs"
              />
            </div>
            <Separator />
          </div>
        )}


        {block.type === 'delay' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Delay Aleatório</Label>
                <p className="text-[10px] text-muted-foreground">Escolher tempo entre um intervalo</p>
              </div>
              <Switch 
                checked={block.data.delay_random ?? true}
                onCheckedChange={(checked) => {
                  if (!checked && block.data.delay_seconds === undefined) {
                    onUpdate({
                      data: {
                        ...block.data,
                        delay_random: false,
                        delay_seconds: 5
                      }
                    });
                  } else {
                    updateData('delay_random', checked);
                  }
                }}
              />
            </div>

            {block.data.delay_random !== false ? (
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <Label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Delay entre Mensagens</Label>
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {block.data.delay_min || 5} - {block.data.delay_max || 16} segundos
                  </span>
                </div>
                
                <div className="pt-2 px-1">
                  <Slider
                    value={[block.data.delay_min || 5, block.data.delay_max || 16]}
                    max={120}
                    min={0}
                    step={1}
                    onValueChange={(value) => {
                      onUpdate({
                        data: {
                          ...block.data,
                          delay_min: value[0],
                          delay_max: value[1]
                        }
                      });
                    }}
                    className="py-4"
                  />
                </div>

                <div className="flex justify-between text-[10px] text-muted-foreground px-1 font-medium">
                  <span>0 segundos</span>
                  <span>120 segundos</span>
                </div>

                <div className="flex items-start gap-2 bg-muted/30 p-2.5 rounded-lg border border-border/50">
                  <Dices className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    O delay será escolhido aleatoriamente entre o mínimo e máximo configurados para simular um comportamento humano natural.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Tempo Fixo (segundos)</Label>
                <Input
                  type="number"
                  value={block.data.delay_seconds || 5}
                  onChange={(e) => updateData('delay_seconds', parseInt(e.target.value))}
                  min={1}
                  max={120}
                  className="h-8 text-xs"
                />
              </div>
            )}
            
            <Separator />
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Próximo Bloco</Label>
              <Select
                value={block.next_block_id || 'none'}
                onValueChange={(v) => onConnect(v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Encerrar fluxo</SelectItem>
                  {otherBlocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {FUNNEL_BLOCK_PALETTE.find(t => t.type === b.type)?.label || b.type}: {b.id.substring(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {block.type === 'condition' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-xs font-semibold">Regra Lógica</Label>
              <div className="space-y-2">
                <div 
                  className="flex items-center space-x-2 cursor-pointer"
                  onClick={() => updateData('condition_logic', 'all')}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border border-primary flex items-center justify-center",
                    (block.data.condition_logic || 'all') === 'all' ? "bg-primary" : "bg-transparent"
                  )}>
                    {(block.data.condition_logic || 'all') === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs">Regra corresponde a <b>todas</b> as condições (e)</span>
                </div>
                
                <div 
                  className="flex items-center space-x-2 cursor-pointer"
                  onClick={() => updateData('condition_logic', 'any')}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border border-primary flex items-center justify-center",
                    block.data.condition_logic === 'any' ? "bg-primary" : "bg-transparent"
                  )}>
                    {block.data.condition_logic === 'any' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs">Regra corresponde a <b>qualquer</b> condição (ou)</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Condições</Label>
                <Button 
                  size="sm" 
                  variant="secondary"
                  className="h-7 px-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white gap-1"
                  onClick={() => {
                    const newCond = { 
                      id: crypto.randomUUID(),
                      variable: '', 
                      operator: 'equals' as const, 
                      value: '' 
                    };
                    const currentConditions = block.data.conditions || [];
                    updateData('conditions', [...currentConditions, newCond]);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Adicionar Condição
                </Button>
              </div>

              <div className="space-y-3">
                {(block.data.conditions || []).map((cond, index) => (
                  <div key={cond.id || index} className="space-y-3">
                    <div className="p-3 bg-card rounded-lg border border-border space-y-3 relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          const newConditions = [...(block.data.conditions || [])];
                          newConditions.splice(index, 1);
                          updateData('conditions', newConditions);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>

                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-primary">variável</Label>
                        <Input
                          value={cond.variable}
                          onChange={(e) => {
                            const newConditions = [...(block.data.conditions || [])];
                            newConditions[index] = { ...cond, variable: e.target.value };
                            updateData('conditions', newConditions);
                          }}
                          placeholder="ex: nome, email"
                          className="h-8 text-xs bg-muted/20"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">operador</Label>
                          <Select
                            value={cond.operator}
                            onValueChange={(v: any) => {
                              const newConditions = [...(block.data.conditions || [])];
                              newConditions[index] = { ...cond, operator: v };
                              updateData('conditions', newConditions);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs bg-muted/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">Igual (=)</SelectItem>
                              <SelectItem value="not_equals">Diferente (≠)</SelectItem>
                              <SelectItem value="contains">Contém</SelectItem>
                              <SelectItem value="greater_than">Maior (&gt;)</SelectItem>
                              <SelectItem value="less_than">Menor (&lt;)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">valor</Label>
                          <Input
                            value={cond.value}
                            onChange={(e) => {
                              const newConditions = [...(block.data.conditions || [])];
                              newConditions[index] = { ...cond, value: e.target.value };
                              updateData('conditions', newConditions);
                            }}
                            placeholder="valor"
                            className="h-8 text-xs bg-muted/20"
                          />
                        </div>
                      </div>
                    </div>
                    {index < (block.data.conditions || []).length - 1 && (
                      <div className="flex justify-center">
                        <Badge variant="outline" className="text-[9px] h-5 px-2 bg-primary/10 text-primary border-primary/20">
                          {block.data.condition_logic === 'any' ? 'OU' : 'E'}
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}

                {(block.data.conditions || []).length === 0 && (
                  <div className="text-center py-6 border border-dashed rounded-lg bg-muted/10">
                    <p className="text-[10px] text-muted-foreground">Nenhuma condição adicionada</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-xs font-semibold">Roteamento (Saídas)</Label>

              <div className="space-y-2">
                <Label className="text-green-600 text-[10px] uppercase font-semibold">Se Verdadeiro →</Label>
                <Select
                  value={block.data.true_next_block_id || 'none'}
                  onValueChange={(v) => {
                    const val = v === 'none' ? null : v;
                    onUpdate({
                      data: { ...block.data, true_next_block_id: val || undefined }
                    });
                    if (val) onConnect(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fim</SelectItem>
                    {otherBlocks.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-red-600 text-[10px] uppercase font-semibold">Se Falso →</Label>
                <Select
                  value={block.data.false_next_block_id || 'none'}
                  onValueChange={(v) => {
                    const val = v === 'none' ? null : v;
                    onUpdate({
                      data: { ...block.data, false_next_block_id: val || undefined }
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Próximo bloco..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fim</SelectItem>
                    {otherBlocks.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label || b.type}: {b.data.content?.slice(0, 15) || '...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {block.type === 'pix_button' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Texto do Botão</Label>
              <Input
                value={block.data.content || 'Gerar QR Code PIX'}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Ex: Pagar com PIX"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Tipo de Chave</Label>
                <Select
                  value={block.data.pix_type || 'EVP'}
                  onValueChange={(v: any) => updateData('pix_type', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                    <SelectItem value="EVP">Chave Aleatória (EVP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Valor (R$)</Label>
                <Input
                  value={block.data.pixel_item_value || ''}
                  onChange={(e) => updateData('pixel_item_value', e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Chave PIX</Label>
              <Input
                value={block.data.pix_key || ''}
                onChange={(e) => updateData('pix_key', e.target.value)}
                placeholder="Sua chave PIX aqui"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Nome do Beneficiário</Label>
              <Input
                value={block.data.pix_name || ''}
                onChange={(e) => updateData('pix_name', e.target.value)}
                placeholder="Nome que aparece no banco"
                className="h-8 text-xs"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Próximo Bloco (Após Pagamento)</Label>
              <Select
                value={block.next_block_id || 'none'}
                onValueChange={(v) => onConnect(v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Encerrar fluxo</SelectItem>
                  {otherBlocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {FUNNEL_BLOCK_PALETTE.find(t => t.type === b.type)?.label || b.type}: {b.id.substring(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {block.type === 'end' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Mensagem de Finalização</Label>
              <Textarea 
                className="text-xs"
                value={block.data.success_message || ''}
                onChange={(e) => updateData('success_message', e.target.value)}
                placeholder="Ex: Obrigado! Seu cadastro foi concluído com sucesso."
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">Esta mensagem será enviada ao lead ao finalizar o funil.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Delay para Mensagem (segundos)</Label>
              <Input className="text-xs"
                type="number"
                value={(block.data.delay_ms ?? 2000) / 1000}
                onChange={(e) => {
                  const valMs = parseFloat(e.target.value) * 1000;
                  const typingMs = block.data.typing_duration_ms ?? 2000;
                  onUpdate({
                    data: { 
                      ...block.data, 
                      delay_ms: valMs,
                      typing_duration_ms: typingMs > valMs ? valMs : typingMs
                    },
                  });
                }}
                step="0.5"
                min="0"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch 
                  id="show_typing_end"
                  checked={block.data.show_typing ?? true}
                  onCheckedChange={(checked) => updateData('show_typing', checked)}
                />
                <Label htmlFor="show_typing_end" className="text-xs">Simular "digitando..."</Label>
              </div>
            </div>
            
            {(block.data.show_typing ?? true) && (
              <div className="space-y-2 pl-2 border-l-2 border-primary/20 mt-2">
                <Label className="text-xs">Duração do Status (segundos)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[ (block.data.typing_duration_ms ?? 2000) / 1000 ]}
                    max={(block.data.delay_ms ?? 2000) / 1000}
                    min={0}
                    step={0.1}
                    onValueChange={(value) => updateData('typing_duration_ms', value[0] * 1000)}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono font-bold bg-muted px-1.5 py-0.5 rounded min-w-[3rem] text-center">
                    {((block.data.typing_duration_ms ?? 2000) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">URL de Redirecionamento (Opcional)</Label>
              <Input 
                className="text-xs"
                value={block.data.redirect_url || ''}
                onChange={(e) => updateData('redirect_url', e.target.value)}
                placeholder="https://exemplo.com/obrigado"
              />
              <p className="text-[10px] text-muted-foreground">O lead será enviado para esta URL após a finalização (apenas Canais Web).</p>
            </div>
          </div>
        )}

        {['input', 'buttons', 'ai_decide', 'ia_pergunta'].includes(block.type) && (
          <div className="p-4 bg-muted/20 rounded-lg border border-dashed text-center italic text-muted-foreground text-[10px]">
            Configurações padrão ativas para {paletteItem?.label || block.type}.
          </div>
        )}

      </div>
    </ScrollArea>
  );
}