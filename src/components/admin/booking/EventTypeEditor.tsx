import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronDown, Plus, X, GripVertical, Bell } from 'lucide-react';
import { useBookingEventTypes, BookingEventType, QuestionField, generateSlug } from '@/hooks/useBookingEventTypes';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NotificationsAutomationTab } from './notifications/NotificationsAutomationTab';

interface EventTypeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventType: BookingEventType | null;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h 30min' },
  { value: 120, label: '2 horas' },
];

const LOCATION_OPTIONS = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'phone', label: 'Telefone' },
  { value: 'in_person', label: 'Presencial' },
];

const COLOR_OPTIONS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#22c55e', // green
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ef4444', // red
];

const QUESTION_TYPES = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'select', label: 'Seleção' },
];

export function EventTypeEditor({ open, onOpenChange, eventType }: EventTypeEditorProps) {
  const { createEventType, updateEventType } = useBookingEventTypes();
  const isEditing = !!eventType;

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    duration_minutes: 30,
    location_type: 'google_meet',
    location_details: '',
    color: '#3b82f6',
    buffer_before: 0,
    buffer_after: 0,
    min_notice_hours: 24,
    max_days_ahead: 60,
    create_meet: true,
    confirmation_message: '',
    is_active: false,
    booking_experience: 'standard' as 'standard' | 'conversational',
  });

  const [questions, setQuestions] = useState<QuestionField[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (eventType) {
      setFormData({
        name: eventType.name,
        slug: eventType.slug,
        description: eventType.description || '',
        duration_minutes: eventType.duration_minutes,
        location_type: eventType.location_type,
        location_details: eventType.location_details || '',
        color: eventType.color,
        buffer_before: eventType.buffer_before,
        buffer_after: eventType.buffer_after,
        min_notice_hours: eventType.min_notice_hours,
        max_days_ahead: eventType.max_days_ahead,
        create_meet: eventType.create_meet,
        confirmation_message: eventType.confirmation_message || '',
        is_active: eventType.is_active,
        booking_experience: eventType.booking_experience || 'standard',
      });
      setQuestions(eventType.questions || []);
      setSlugEdited(true);
    } else {
      setFormData({
        name: '',
        slug: '',
        description: '',
        duration_minutes: 30,
        location_type: 'google_meet',
        location_details: '',
        color: '#3b82f6',
        buffer_before: 0,
        buffer_after: 0,
        min_notice_hours: 24,
        max_days_ahead: 60,
        create_meet: true,
        confirmation_message: '',
        is_active: false,
        booking_experience: 'standard',
      });
      setQuestions([]);
      setSlugEdited(false);
    }
  }, [eventType, open]);

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: slugEdited ? prev.slug : generateSlug(name),
    }));
  };

  const addQuestion = () => {
    setQuestions(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
      },
    ]);
  };

  const updateQuestion = (id: string, updates: Partial<QuestionField>) => {
    setQuestions(prev => 
      prev.map(q => q.id === id ? { ...q, ...updates } : q)
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      questions,
    };

    if (isEditing) {
      await updateEventType.mutateAsync({ id: eventType.id, ...payload });
    } else {
      await createEventType.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Tipo de Evento' : 'Novo Tipo de Evento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Evento *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Consultoria Digital"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL do Evento</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/agendar/você/</span>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setFormData(prev => ({ ...prev, slug: e.target.value }));
                  }}
                  placeholder="consultoria-digital"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva o que será discutido nesta reunião..."
                rows={3}
              />
            </div>
          </div>

          {/* Duration and Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duração</Label>
              <Select
                value={formData.duration_minutes.toString()}
                onValueChange={(v) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Local</Label>
              <Select
                value={formData.location_type}
                onValueChange={(v) => setFormData(prev => ({ ...prev, location_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Cor do Badge</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color }))}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all',
                    formData.color === color && 'ring-2 ring-offset-2 ring-primary'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Google Meet Toggle */}
          {formData.location_type === 'google_meet' && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-base">Gerar link do Google Meet</Label>
                <p className="text-sm text-muted-foreground">
                  Criar automaticamente um link de videoconferência
                </p>
              </div>
              <Switch
                checked={formData.create_meet}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, create_meet: checked }))}
              />
            </div>
          )}

          {/* Booking Experience */}
          <div className="space-y-3">
            <Label className="text-base">Experiência de Agendamento</Label>
            <RadioGroup
              value={formData.booking_experience}
              onValueChange={(v) => setFormData(prev => ({ ...prev, booking_experience: v as 'standard' | 'conversational' }))}
              className="grid grid-cols-1 gap-3"
            >
              <label
                htmlFor="exp-standard"
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
                  formData.booking_experience === 'standard' 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-muted-foreground/50'
                )}
              >
                <RadioGroupItem value="standard" id="exp-standard" className="mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium">Padrão (Calendário + Formulário)</span>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Interface tradicional estilo Calendly com passos separados para seleção de data e preenchimento de dados.
                  </p>
                </div>
              </label>
              <label
                htmlFor="exp-conversational"
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
                  formData.booking_experience === 'conversational' 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-muted-foreground/50'
                )}
              >
                <RadioGroupItem value="conversational" id="exp-conversational" className="mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium">Conversacional (Chat Interativo)</span>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Interface moderna estilo TypeBot com perguntas uma a uma em formato de chat.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Advanced Settings */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" type="button" className="w-full justify-between">
                Configurações Avançadas
                <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="buffer_before">Folga antes (min)</Label>
                  <Input
                    id="buffer_before"
                    type="number"
                    min={0}
                    value={formData.buffer_before}
                    onChange={(e) => setFormData(prev => ({ ...prev, buffer_before: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buffer_after">Folga depois (min)</Label>
                  <Input
                    id="buffer_after"
                    type="number"
                    min={0}
                    value={formData.buffer_after}
                    onChange={(e) => setFormData(prev => ({ ...prev, buffer_after: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_notice_hours">Antecedência mínima (horas)</Label>
                  <Input
                    id="min_notice_hours"
                    type="number"
                    min={0}
                    value={formData.min_notice_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, min_notice_hours: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_days_ahead">Agendar até (dias)</Label>
                  <Input
                    id="max_days_ahead"
                    type="number"
                    min={1}
                    value={formData.max_days_ahead}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_days_ahead: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmation_message">Mensagem de Confirmação</Label>
                <Textarea
                  id="confirmation_message"
                  value={formData.confirmation_message}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmation_message: e.target.value }))}
                  placeholder="Mensagem exibida após o agendamento..."
                  rows={2}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Custom Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Perguntas Personalizadas</Label>
              <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {questions.length > 0 && (
              <div className="space-y-3">
                {questions.map((question, index) => (
                  <div key={question.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={question.label}
                          onChange={(e) => updateQuestion(question.id, { label: e.target.value })}
                          placeholder="Pergunta..."
                          className="flex-1"
                        />
                        <Select
                          value={question.type}
                          onValueChange={(v) => updateQuestion(question.id, { type: v as QuestionField['type'] })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={question.required}
                          onCheckedChange={(checked) => updateQuestion(question.id, { required: checked })}
                        />
                        <span className="text-sm text-muted-foreground">Obrigatório</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQuestion(question.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Publicar Evento</Label>
              <p className="text-sm text-muted-foreground">
                Tornar este evento disponível para agendamentos
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createEventType.isPending || updateEventType.isPending}
              className="w-full sm:w-auto"
            >
              {createEventType.isPending || updateEventType.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
