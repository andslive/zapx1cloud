import { useState, useEffect } from 'react';
import { FormBlock, FormBlockType, getBlockConfig, SelectOption, ScaleOptions, LogicRule } from '@/types/forms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEAD_FIELD_MAPPINGS = [
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'notes', label: 'Observações' },
  { value: 'custom', label: 'Campo personalizado' },
];

const CATEGORY_COLORS: Record<string, string> = {
  screen: 'bg-purple-500',
  input: 'bg-blue-500',
  selection: 'bg-green-500',
  logic: 'bg-orange-500',
  advanced: 'bg-pink-500',
};

interface FormBlockEditorProps {
  block: FormBlock | null;
  allBlocks: FormBlock[];
  onUpdate: (block: FormBlock) => void;
  onClose: () => void;
}

export function FormBlockEditor({ 
  block, 
  allBlocks, 
  onUpdate, 
  onClose,
}: FormBlockEditorProps) {
  const [localBlock, setLocalBlock] = useState<FormBlock | null>(block);
  
  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  if (!localBlock) {
    return (
      <div className="w-80 bg-card border-l flex items-center justify-center text-muted-foreground p-4 text-center">
        <p>Selecione um bloco para editar suas propriedades</p>
      </div>
    );
  }

  const config = getBlockConfig(localBlock.block_type);
  const categoryColor = config ? CATEGORY_COLORS[config.category] : 'bg-muted';
  
  const handleChange = <K extends keyof FormBlock>(key: K, value: FormBlock[K]) => {
    const updated = { ...localBlock, [key]: value };
    setLocalBlock(updated);
    onUpdate(updated);
  };

  const handleOptionsChange = (options: SelectOption[] | ScaleOptions) => {
    handleChange('options', options);
  };

  // Select options management
  const addOption = () => {
    const currentOptions = (localBlock.options as SelectOption[]) || [];
    const newOption: SelectOption = {
      value: `option_${currentOptions.length + 1}`,
      label: `Opção ${currentOptions.length + 1}`,
    };
    handleOptionsChange([...currentOptions, newOption]);
  };

  const updateOption = (index: number, updates: Partial<SelectOption>) => {
    const currentOptions = [...(localBlock.options as SelectOption[])];
    currentOptions[index] = { ...currentOptions[index], ...updates };
    handleOptionsChange(currentOptions);
  };

  const removeOption = (index: number) => {
    const currentOptions = [...(localBlock.options as SelectOption[])];
    currentOptions.splice(index, 1);
    handleOptionsChange(currentOptions);
  };

  // Tags management
  const addTag = (tag: string) => {
    if (tag && !localBlock.apply_tags.includes(tag)) {
      handleChange('apply_tags', [...localBlock.apply_tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    handleChange('apply_tags', localBlock.apply_tags.filter(t => t !== tag));
  };

  return (
    <div className="w-80 bg-card border-l flex flex-col h-full">
      {/* Header */}
      <div className={cn("p-4 flex items-center justify-between", categoryColor)}>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">{config?.label || 'Bloco'}</h3>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white/80 hover:text-white hover:bg-white/20" 
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Common fields */}
          <div className="space-y-2">
            <Label>Pergunta / Título</Label>
            <Textarea
              value={localBlock.label}
              onChange={(e) => handleChange('label', e.target.value)}
              placeholder="Digite a pergunta..."
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={localBlock.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Texto de ajuda ou contexto..."
              rows={2}
            />
          </div>
          
          {/* Placeholder for input types */}
          {['text', 'email', 'phone', 'number', 'textarea'].includes(localBlock.block_type) && (
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={localBlock.placeholder || ''}
                onChange={(e) => handleChange('placeholder', e.target.value)}
                placeholder="Texto de exemplo..."
              />
            </div>
          )}
          
          {/* Required toggle for inputs */}
          {!['welcome_screen', 'end_screen', 'conditional', 'score', 'tag', 'hidden_field'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Obrigatório</Label>
                  <p className="text-xs text-muted-foreground">O usuário deve responder</p>
                </div>
                <Switch
                  checked={localBlock.required}
                  onCheckedChange={(checked) => handleChange('required', checked)}
                />
              </div>
            </>
          )}
          
          {/* Select/Multi-select options */}
          {['select', 'multi_select'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opções</Label>
                  <Button variant="outline" size="sm" onClick={addOption}>
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {((localBlock.options as SelectOption[]) || []).map((option, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted rounded-lg p-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <Input
                        value={option.label}
                        onChange={(e) => updateOption(index, { 
                          label: e.target.value,
                          value: e.target.value.toLowerCase().replace(/\s+/g, '_')
                        })}
                        placeholder="Texto da opção"
                        className="flex-1 h-8"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          
          {/* Scale options */}
          {localBlock.block_type === 'scale' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Configuração da Escala</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Valor Mínimo</Label>
                    <Input
                      type="number"
                      value={(localBlock.options as ScaleOptions)?.min || 1}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        min: parseInt(e.target.value) || 1,
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Valor Máximo</Label>
                    <Input
                      type="number"
                      value={(localBlock.options as ScaleOptions)?.max || 10}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        max: parseInt(e.target.value) || 10,
                      })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label Mínimo</Label>
                    <Input
                      value={(localBlock.options as ScaleOptions)?.min_label || ''}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        min_label: e.target.value,
                      })}
                      placeholder="Ruim"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label Máximo</Label>
                    <Input
                      value={(localBlock.options as ScaleOptions)?.max_label || ''}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        max_label: e.target.value,
                      })}
                      placeholder="Excelente"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          
          {/* Score block */}
          {localBlock.block_type === 'score' && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Pontuação</Label>
                <Input
                  type="number"
                  value={localBlock.score_value}
                  onChange={(e) => handleChange('score_value', parseInt(e.target.value) || 0)}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">
                  Pontos adicionados ao score do lead
                </p>
              </div>
            </>
          )}
          
          {/* Tag block */}
          {localBlock.block_type === 'tag' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Tags a Aplicar</Label>
                <div className="flex flex-wrap gap-1.5">
                  {localBlock.apply_tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova etiqueta..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addTag((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Hidden field */}
          {localBlock.block_type === 'hidden_field' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Mapear para</Label>
                  <Select
                    value={localBlock.maps_to || 'custom'}
                    onValueChange={(value) => handleChange('maps_to', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utm_source">UTM Source</SelectItem>
                      <SelectItem value="utm_medium">UTM Medium</SelectItem>
                      <SelectItem value="utm_campaign">UTM Campaign</SelectItem>
                      <SelectItem value="utm_content">UTM Content</SelectItem>
                      <SelectItem value="utm_term">UTM Term</SelectItem>
                      <SelectItem value="referrer">Referrer URL</SelectItem>
                      <SelectItem value="landing_page">Landing Page</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
          
          {/* Field mapping for inputs */}
          {['text', 'email', 'phone', 'number', 'textarea'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Mapear para campo do Lead</Label>
                <Select
                  value={localBlock.maps_to || 'none'}
                  onValueChange={(value) => handleChange('maps_to', value === 'none' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {LEAD_FIELD_MAPPINGS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A resposta será salva neste campo do lead
                </p>
              </div>
            </>
          )}
          
          {/* End screen CTA */}
          {localBlock.block_type === 'end_screen' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Configuração da Tela Final</Label>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Texto do Botão</Label>
                  <Input
                    value={localBlock.block_settings?.cta_text as string || 'Concluir'}
                    onChange={(e) => handleChange('block_settings', {
                      ...localBlock.block_settings,
                      cta_text: e.target.value,
                    })}
                    placeholder="Concluir"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">URL de Redirecionamento</Label>
                  <Input
                    value={localBlock.block_settings?.redirect_url as string || ''}
                    onChange={(e) => handleChange('block_settings', {
                      ...localBlock.block_settings,
                      redirect_url: e.target.value,
                    })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </>
          )}
          
          {/* AI blocks info */}
          {['ai_question', 'ai_followup'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-lg">
                <p className="text-sm text-pink-700 dark:text-pink-300">
                  <strong>Pergunta com IA</strong>
                </p>
                <p className="text-xs text-pink-600 dark:text-pink-400 mt-1">
                  Esta pergunta será gerada dinamicamente com base no contexto do produto e nas respostas anteriores do usuário.
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
