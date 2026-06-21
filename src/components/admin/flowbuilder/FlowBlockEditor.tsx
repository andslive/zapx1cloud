import { useState, useEffect } from 'react';
import { FlowBlock, FlowBlockType, FlowButton, INPUT_TYPES, BLOCK_TYPES, ButtonActionType, BUTTON_ACTION_TYPES } from '@/types/chatFlow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Trash2, GripVertical, X, ChevronDown, ChevronUp, Clock, MessageSquareReply, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface FlowBlockEditorProps {
  block: FlowBlock | null;
  allBlocks: FlowBlock[];
  onUpdate: (block: FlowBlock) => void;
  onClose: () => void;
  onSetStart: (blockId: string) => void;
  isStartBlock: boolean;
}

export function FlowBlockEditor({ 
  block, 
  allBlocks, 
  onUpdate, 
  onClose,
  onSetStart,
  isStartBlock,
}: FlowBlockEditorProps) {
  const [localBlock, setLocalBlock] = useState<FlowBlock | null>(block);
  const [expandedButton, setExpandedButton] = useState<string | null>(null);
  
  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  if (!localBlock) {
    return (
      <div className="w-80 bg-card border-l p-4 flex items-center justify-center text-muted-foreground">
        Selecione um bloco para editar
      </div>
    );
  }

  const blockMeta = BLOCK_TYPES.find(b => b.type === localBlock.type);
  
  const handleChange = (updates: Partial<FlowBlock['data']>) => {
    const updated = {
      ...localBlock,
      data: { ...localBlock.data, ...updates },
    };
    setLocalBlock(updated);
    onUpdate(updated);
  };

  const handleNextBlockChange = (nextBlockId: string | null) => {
    const updated = { ...localBlock, next_block_id: nextBlockId };
    setLocalBlock(updated);
    onUpdate(updated);
  };

  const addButton = () => {
    const newButton: FlowButton = {
      id: `btn_${Date.now()}`,
      label: 'Novo botão',
      emoji: '👉',
      action_type: 'next_block',
      next_block_id: null,
    };
    handleChange({
      buttons: [...(localBlock.data.buttons || []), newButton],
    });
    setExpandedButton(newButton.id);
  };

  const updateButton = (index: number, updates: Partial<FlowButton>) => {
    const buttons = [...(localBlock.data.buttons || [])];
    buttons[index] = { ...buttons[index], ...updates };
    handleChange({ buttons });
  };

  const removeButton = (index: number) => {
    const buttons = [...(localBlock.data.buttons || [])];
    buttons.splice(index, 1);
    handleChange({ buttons });
  };

  const otherBlocks = allBlocks.filter(b => b.id !== localBlock.id);

  return (
    <div className="w-80 bg-card border-l flex flex-col h-full">
      {/* Header */}
      <div className={cn("p-4 flex items-center justify-between", blockMeta?.color || 'bg-muted')}>
        <h3 className="font-semibold text-white">{blockMeta?.label}</h3>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Set as start */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <Label className="text-sm font-medium">Bloco inicial</Label>
            <p className="text-xs text-muted-foreground">Este bloco inicia o fluxo</p>
          </div>
          <Switch 
            checked={isStartBlock}
            onCheckedChange={() => onSetStart(localBlock.id)}
          />
        </div>
        
        {/* Message Block */}
        {localBlock.type === 'message' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={localBlock.data.content || ''}
                onChange={(e) => handleChange({ content: e.target.value })}
                placeholder="Digite a mensagem..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{nome}}"} para variáveis
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay Próxima Bolha (ms)</Label>
                <Input
                  type="number"
                  value={localBlock.data.delay_ms ?? 2000}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const typing = localBlock.data.typing_duration_ms ?? 2000;
                    handleChange({ 
                      delay_ms: val,
                      typing_duration_ms: typing > val ? val : typing
                    });
                  }}
                  min={0}
                  step={100}
                />
                <p className="text-[10px] text-muted-foreground">Tempo total antes de enviar</p>
              </div>
              <div className="space-y-2">
                <Label>Simular Digitando (ms)</Label>
                <Input
                  type="number"
                  value={localBlock.data.typing_duration_ms ?? 2000}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const delay = localBlock.data.delay_ms ?? 2000;
                    handleChange({ typing_duration_ms: val > delay ? delay : val });
                  }}
                  max={localBlock.data.delay_ms ?? 2000}
                  min={0}
                  step={100}
                />
                <p className="text-[10px] text-muted-foreground">Duração do estado "digitando..."</p>
              </div>
            </div>
            {(localBlock.data.typing_duration_ms ?? 2000) > (localBlock.data.delay_ms ?? 2000) && (
              <p className="text-[10px] text-destructive font-medium">
                ⚠️ A duração de "digitando..." não pode ser maior que o Delay.
              </p>
            )}
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs">Mostrar "digitando..."</Label>
              <Switch 
                checked={localBlock.data.show_typing ?? true}
                onCheckedChange={(checked) => handleChange({ show_typing: checked })}
              />
            </div>
          </>
        )}
        
        {/* Input Block */}
        {localBlock.type === 'input' && (
          <>
            <div className="space-y-2">
              <Label>Tipo de Captura</Label>
              <Select
                value={localBlock.data.input_type || 'text'}
                onValueChange={(value) => handleChange({ input_type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_TYPES.map((type) => (
                    <SelectItem key={type.type} value={type.type}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome da Variável</Label>
              <Input
                value={localBlock.data.variable_name || ''}
                onChange={(e) => handleChange({ variable_name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                placeholder="nome_do_campo"
              />
              <p className="text-xs text-muted-foreground">
                Acessível como {"{{nome_do_campo}}"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={localBlock.data.placeholder || ''}
                onChange={(e) => handleChange({ placeholder: e.target.value })}
                placeholder="Digite aqui..."
              />
            </div>
            <div className="space-y-2">
              <Label>Validação</Label>
              <Select
                value={localBlock.data.validation || 'none'}
                onValueChange={(value) => handleChange({ validation: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  <SelectItem value="required">Obrigatório</SelectItem>
                  <SelectItem value="email">E-mail válido</SelectItem>
                  <SelectItem value="phone">Telefone válido</SelectItem>
                  <SelectItem value="cpf">CPF válido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Aguardar Resposta</Label>
                  <p className="text-xs text-muted-foreground">Delay condicional com timeout</p>
                </div>
                <Switch 
                  checked={localBlock.data.timeout_enabled || false}
                  onCheckedChange={(checked) => handleChange({ timeout_enabled: checked })}
                />
              </div>

              {localBlock.data.timeout_enabled && (
                <div className="space-y-3 bg-muted/30 p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Tempo</Label>
                      <Input
                        type="number"
                        value={localBlock.data.timeout_value || 1}
                        onChange={(e) => handleChange({ timeout_value: parseInt(e.target.value) })}
                        min={1}
                        className="h-8"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Unidade</Label>
                      <Select
                        value={localBlock.data.timeout_unit || 'minutes'}
                        onValueChange={(value) => handleChange({ timeout_unit: value as any })}
                      >
                        <SelectTrigger className="h-8">
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

                  <div className="space-y-1.5">
                    <Label className="text-xs">Se não responder, ir para:</Label>
                    <Select
                      value={localBlock.data.timeout_next_block_id || 'none'}
                      onValueChange={(value) => handleChange({ timeout_next_block_id: value === 'none' ? null : value })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Encerrar fluxo</SelectItem>
                        {otherBlocks.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {BLOCK_TYPES.find(t => t.type === b.type)?.label}: {b.id.substring(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Aguardar indefinidamente</Label>
                    <Switch 
                      checked={localBlock.data.wait_indefinitely || false}
                      onCheckedChange={(checked) => handleChange({ wait_indefinitely: checked })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Buffer de Mensagens</Label>
                  <p className="text-xs text-muted-foreground">Agrupar mensagens em um intervalo</p>
                </div>
                <Switch 
                  checked={localBlock.data.message_buffer_enabled || false}
                  onCheckedChange={(checked) => handleChange({ message_buffer_enabled: checked })}
                />
              </div>
              
              {localBlock.data.message_buffer_enabled && (
                <div className="space-y-2">
                  <Label className="text-xs">Segundos de buffer</Label>
                  <Input
                    type="number"
                    value={localBlock.data.message_buffer_seconds || 5}
                    onChange={(e) => handleChange({ message_buffer_seconds: parseInt(e.target.value) })}
                    min={1}
                    max={60}
                    className="h-8"
                  />
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareReply className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Responder ao Lead</Label>
                </div>
                <Switch 
                  checked={localBlock.data.reply_to_message || false}
                  onCheckedChange={(checked) => handleChange({ reply_to_message: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smile className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Reagir à Mensagem</Label>
                </div>
                <Switch 
                  checked={localBlock.data.react_to_message || false}
                  onCheckedChange={(checked) => handleChange({ react_to_message: checked })}
                />
              </div>
              
              {localBlock.data.react_to_message && (
                <div className="space-y-2">
                  <Label className="text-xs">Emoji da Reação</Label>
                  <Input
                    value={localBlock.data.reaction_emoji || '✅'}
                    onChange={(e) => handleChange({ reaction_emoji: e.target.value })}
                    placeholder="✅"
                    className="h-8"
                  />
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Buttons Block */}
        {localBlock.type === 'buttons' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea
                value={localBlock.data.content || ''}
                onChange={(e) => handleChange({ content: e.target.value })}
                placeholder="Escolha uma opção:"
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botões</Label>
                <Button variant="outline" size="sm" onClick={addButton}>
                  <Plus className="w-3 h-3 mr-1" />
                  Adicionar
                </Button>
              </div>
              
              <div className="space-y-3">
                {(localBlock.data.buttons || []).map((btn, idx) => (
                  <Collapsible 
                    key={btn.id}
                    open={expandedButton === btn.id}
                    onOpenChange={(open) => setExpandedButton(open ? btn.id : null)}
                  >
                    <div className="bg-muted rounded-lg overflow-hidden">
                      {/* Header do Botão */}
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/80">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <span className="text-lg">{btn.emoji || '👉'}</span>
                          <span className="flex-1 font-medium truncate">{btn.label || 'Novo botão'}</span>
                          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-background rounded">
                            {BUTTON_ACTION_TYPES.find(t => t.type === btn.action_type)?.label || 'Fluxo'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); removeButton(idx); }}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                          {expandedButton === btn.id ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      
                      {/* Configurações do Botão */}
                      <CollapsibleContent>
                        <div className="p-3 pt-0 space-y-3 border-t">
                          {/* Label e Emoji */}
                          <div className="flex gap-2">
                            <div className="w-16">
                              <Label className="text-xs">Emoji</Label>
                              <Input
                                value={btn.emoji || ''}
                                onChange={(e) => updateButton(idx, { emoji: e.target.value })}
                                placeholder="😊"
                                className="mt-1"
                              />
                            </div>
                            <div className="flex-1">
                              <Label className="text-xs">Texto do Botão</Label>
                              <Input
                                value={btn.label}
                                onChange={(e) => updateButton(idx, { label: e.target.value })}
                                placeholder="Texto do botão"
                                className="mt-1"
                              />
                            </div>
                          </div>
                          
                          {/* Tipo de Ação */}
                          <div>
                            <Label className="text-xs">Tipo de Ação</Label>
                            <Select
                              value={btn.action_type || 'next_block'}
                              onValueChange={(value: ButtonActionType) => updateButton(idx, { action_type: value })}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {BUTTON_ACTION_TYPES.map((actionType) => (
                                  <SelectItem key={actionType.type} value={actionType.type}>
                                    {actionType.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Campos condicionais baseados no tipo de ação */}
                          {btn.action_type === 'next_block' && (
                            <div>
                              <Label className="text-xs">Próximo Bloco</Label>
                              <Select
                                value={btn.next_block_id || 'none'}
                                onValueChange={(value) => updateButton(idx, { next_block_id: value === 'none' ? null : value })}
                              >
                                <SelectTrigger className="mt-1 text-xs">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                                  {otherBlocks.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                      {BLOCK_TYPES.find(t => t.type === b.type)?.label}: {b.id.substring(0, 8)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          {btn.action_type === 'url' && (
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs">URL</Label>
                                <Input
                                  value={btn.url || ''}
                                  onChange={(e) => updateButton(idx, { url: e.target.value })}
                                  placeholder="https://exemplo.com/checkout"
                                  className="mt-1"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  id={`new-tab-${btn.id}`}
                                  checked={btn.open_in_new_tab !== false}
                                  onCheckedChange={(checked) => updateButton(idx, { open_in_new_tab: checked })}
                                />
                                <Label htmlFor={`new-tab-${btn.id}`} className="text-xs">Abrir em nova aba</Label>
                              </div>
                            </div>
                          )}
                          
                          {btn.action_type === 'whatsapp' && (
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs">Número do WhatsApp</Label>
                                <Input
                                  value={btn.whatsapp_number || ''}
                                  onChange={(e) => updateButton(idx, { whatsapp_number: e.target.value })}
                                  placeholder="5511999999999"
                                  className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Formato: código do país + DDD + número</p>
                              </div>
                              <div>
                                <Label className="text-xs">Mensagem Pré-definida</Label>
                                <Textarea
                                  value={btn.whatsapp_message || ''}
                                  onChange={(e) => updateButton(idx, { whatsapp_message: e.target.value })}
                                  placeholder="Olá! Vim pelo chat do site..."
                                  rows={2}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                          
                          {btn.action_type === 'ai_takeover' && (
                            <div>
                              <Label className="text-xs">Contexto Extra para IA (opcional)</Label>
                              <Textarea
                                value={btn.ai_context || ''}
                                onChange={(e) => updateButton(idx, { ai_context: e.target.value })}
                                placeholder="Foque em apresentar o plano Premium..."
                                rows={2}
                                className="mt-1"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Instruções extras que a IA receberá ao assumir</p>
                            </div>
                          )}
                          
                          {btn.action_type === 'handoff' && (
                            <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs text-red-700 dark:text-red-300">
                              O visitante será transferido para a fila de atendimento humano.
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </div>
          </>
        )}
        
        {/* AI Takeover Block */}
        {localBlock.type === 'ai_takeover' && (
          <>
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-sm text-orange-700 dark:text-orange-300">
                🤖 A partir deste ponto, Sofia assume a conversa usando toda a base de conhecimento e os dados coletados no fluxo.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Instruções Extras (opcional)</Label>
              <Textarea
                value={localBlock.data.ai_context_prompt || ''}
                onChange={(e) => handleChange({ ai_context_prompt: e.target.value })}
                placeholder="Ex: Foque em apresentar o plano Premium..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Transferir variáveis</Label>
                <p className="text-xs text-muted-foreground">Enviar dados coletados para a IA</p>
              </div>
              <Switch
                checked={localBlock.data.transfer_variables !== false}
                onCheckedChange={(checked) => handleChange({ transfer_variables: checked })}
              />
            </div>
          </>
        )}
        
        {/* Handoff Block */}
        {localBlock.type === 'handoff' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem de Transferência</Label>
              <Textarea
                value={localBlock.data.handoff_message || ''}
                onChange={(e) => handleChange({ handoff_message: e.target.value })}
                placeholder="Vou te transferir para um especialista..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Destino</Label>
              <Select
                value={localBlock.data.handoff_target || 'queue'}
                onValueChange={(value) => handleChange({ handoff_target: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">Fila geral</SelectItem>
                  <SelectItem value="squad">Squad específico</SelectItem>
                  <SelectItem value="specific_user">Usuário específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        
        {/* Tag Block */}
        {localBlock.type === 'tag' && (
          <>
            <div className="space-y-2">
              <Label>Nome da Tag</Label>
              <Input
                value={localBlock.data.tag_name || ''}
                onChange={(e) => handleChange({ tag_name: e.target.value })}
                placeholder="interesse_curso"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (opcional)</Label>
              <Input
                value={localBlock.data.tag_value || ''}
                onChange={(e) => handleChange({ tag_value: e.target.value })}
                placeholder="plano_premium"
              />
            </div>
          </>
        )}
        
        {/* Video Block */}
        {localBlock.type === 'video' && (
          <>
            <div className="space-y-2">
              <Label>URL do Vídeo</Label>
              <Input
                value={localBlock.data.video_url || ''}
                onChange={(e) => handleChange({ video_url: e.target.value })}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={localBlock.data.video_title || ''}
                onChange={(e) => handleChange({ video_title: e.target.value })}
                placeholder="Conheça nosso produto"
              />
            </div>
          </>
        )}
        
        {/* Delay Block */}
        {localBlock.type === 'delay' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Delay Aleatório</Label>
                <p className="text-xs text-muted-foreground">Escolher tempo entre um intervalo</p>
              </div>
              <Switch 
                checked={localBlock.data.delay_random ?? true}
                onCheckedChange={(checked) => handleChange({ delay_random: checked })}
              />
            </div>

            {localBlock.data.delay_random !== false ? (
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <Label className="text-sm font-medium">Delay entre Mensagens</Label>
                  <span className="text-sm font-bold text-primary">
                    {localBlock.data.delay_min || 5} - {localBlock.data.delay_max || 16} segundos
                  </span>
                </div>
                
                <div className="pt-2">
                  <Slider
                    value={[localBlock.data.delay_min || 5, localBlock.data.delay_max || 16]}
                    max={120}
                    min={0}
                    step={1}
                    onValueChange={(value) => handleChange({ 
                      delay_min: value[0], 
                      delay_max: value[1] 
                    })}
                    className="py-4"
                  />
                </div>

                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  <span>0 segundos</span>
                  <span>120 segundos</span>
                </div>

                <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                  O delay será escolhido aleatoriamente entre o mínimo e máximo configurados.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Tempo Fixo (segundos)</Label>
                <Input
                  type="number"
                  value={localBlock.data.delay_seconds || 5}
                  onChange={(e) => handleChange({ delay_seconds: parseInt(e.target.value) })}
                  min={1}
                  max={120}
                />
              </div>
            )}
          </div>
        )}
        
        {/* Next Block (for linear blocks) */}
        {localBlock.type !== 'buttons' && localBlock.type !== 'ai_takeover' && localBlock.type !== 'handoff' && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Próximo Bloco</Label>
            <Select
              value={localBlock.next_block_id || 'none'}
              onValueChange={(value) => handleNextBlockChange(value === 'none' ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                {otherBlocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {BLOCK_TYPES.find(t => t.type === b.type)?.label}: {b.id.substring(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
