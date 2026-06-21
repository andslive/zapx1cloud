import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Clock, MapPin, Users, Bell, Link2, X, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateEvent, useUpdateEvent, CalendarEvent, CreateEventData } from '@/hooks/useCalendarEvents';
import { useProducts } from '@/hooks/useProducts';
import { useLeads } from '@/hooks/useLeads';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import { cn } from '@/lib/utils';

interface EventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  defaultDate?: Date;
  defaultLeadId?: string;
  defaultProductId?: string;
}

const EVENT_TYPES = [
  { value: 'meeting', label: '🤝 Reunião', color: 'bg-blue-500' },
  { value: 'call', label: '📞 Ligação', color: 'bg-green-500' },
  { value: 'demo', label: '🎯 Demo', color: 'bg-purple-500' },
  { value: 'follow_up', label: '📋 Follow-up', color: 'bg-orange-500' },
  { value: 'other', label: '📌 Outro', color: 'bg-gray-500' },
];

const REMINDER_OPTIONS = [
  { value: 5, label: '5 minutos antes' },
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
];

export function EventModal({ open, onOpenChange, event, defaultDate, defaultLeadId, defaultProductId }: EventModalProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const { data: products } = useProducts();
  const { data: leads } = useLeads();
  const { isConnected } = useGoogleCalendarConnection();

  const [formData, setFormData] = useState<CreateEventData & { create_meet?: boolean }>({
    title: '',
    description: '',
    location: '',
    event_type: 'meeting',
    start_time: '',
    end_time: '',
    all_day: false,
    lead_id: undefined,
    product_id: undefined,
    reminder_minutes: [15, 60],
    notes: '',
    create_meet: false,
  });

  const [startDate, setStartDate] = useState<Date | undefined>(defaultDate || new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(defaultDate || new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  useEffect(() => {
    if (event) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      
      setFormData({
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        event_type: event.event_type,
        start_time: event.start_time,
        end_time: event.end_time,
        all_day: event.all_day,
        lead_id: event.lead_id || undefined,
        product_id: event.product_id || undefined,
        reminder_minutes: event.reminder_minutes || [15, 60],
        notes: event.notes || '',
        create_meet: event.create_meet || false,
      });
      setStartDate(start);
      setEndDate(end);
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(end, 'HH:mm'));
    } else {
      // Reset form and apply defaults
      const date = defaultDate || new Date();
      setStartDate(date);
      setEndDate(date);
      setFormData(prev => ({
        ...prev,
        title: '',
        description: '',
        location: '',
        event_type: 'meeting',
        all_day: false,
        lead_id: defaultLeadId || undefined,
        product_id: defaultProductId || undefined,
        reminder_minutes: [15, 60],
        notes: '',
        create_meet: false,
      }));
    }
  }, [event, defaultDate, defaultLeadId, defaultProductId, open]);

  const handleSubmit = async () => {
    if (!startDate || !endDate || !formData.title) return;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startDateTime = new Date(startDate);
    startDateTime.setHours(startHour, startMin, 0, 0);

    const endDateTime = new Date(endDate);
    endDateTime.setHours(endHour, endMin, 0, 0);

    const eventData: CreateEventData = {
      ...formData,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
    };

    if (event) {
      await updateEvent.mutateAsync({ id: event.id, ...eventData });
    } else {
      await createEvent.mutateAsync(eventData);
    }

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      location: '',
      event_type: 'meeting',
      start_time: '',
      end_time: '',
      all_day: false,
      lead_id: undefined,
      product_id: undefined,
      reminder_minutes: [15, 60],
      notes: '',
      create_meet: false,
    });
    setStartDate(new Date());
    setEndDate(new Date());
    setStartTime('09:00');
    setEndTime('10:00');
  };

  const toggleReminder = (minutes: number) => {
    const current = formData.reminder_minutes || [];
    if (current.includes(minutes)) {
      setFormData({ ...formData, reminder_minutes: current.filter(m => m !== minutes) });
    } else {
      setFormData({ ...formData, reminder_minutes: [...current, minutes] });
    }
  };

  const isLoading = createEvent.isPending || updateEvent.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {event ? 'Editar Evento' : 'Novo Evento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ex: Reunião com cliente"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Event Type */}
          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={formData.event_type === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, event_type: type.value })}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      if (date && (!endDate || date > endDate)) {
                        setEndDate(date);
                      }
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora Início</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="pl-10"
                  disabled={formData.all_day}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => startDate ? date < startDate : false}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora Fim</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="pl-10"
                  disabled={formData.all_day}
                />
              </div>
            </div>
          </div>

          {/* All Day */}
          <div className="flex items-center gap-2">
            <Switch
              id="all_day"
              checked={formData.all_day}
              onCheckedChange={(checked) => setFormData({ ...formData, all_day: checked })}
            />
            <Label htmlFor="all_day">Dia inteiro</Label>
          </div>

          {/* Links Section */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Vínculos
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lead</Label>
                <Select
                  value={formData.lead_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, lead_id: value === 'none' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {leads?.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={formData.product_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, product_id: value === 'none' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">
              <MapPin className="h-4 w-4 inline mr-1" />
              Local / Link da reunião
            </Label>
            <Input
              id="location"
              placeholder="https://meet.google.com/... ou endereço"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              disabled={formData.create_meet}
            />
            {formData.create_meet && (
              <p className="text-xs text-muted-foreground">
                Um link do Google Meet será gerado automaticamente ao sincronizar
              </p>
            )}
          </div>

          {/* Google Meet Toggle */}
          {isConnected && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Video className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <Label htmlFor="create_meet" className="text-sm font-medium">
                  Criar Google Meet
                </Label>
                <p className="text-xs text-muted-foreground">
                  Gera automaticamente um link de reunião ao sincronizar
                </p>
              </div>
              <Switch
                id="create_meet"
                checked={formData.create_meet}
                onCheckedChange={(checked) => setFormData({ ...formData, create_meet: checked, location: checked ? '' : formData.location })}
              />
            </div>
          )}

          {/* Show existing Meet link */}
          {event?.meet_link && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <Video className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Link do Google Meet</p>
                <a 
                  href={event.meet_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:underline break-all"
                >
                  {event.meet_link}
                </a>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(event.meet_link!, '_blank')}
              >
                Entrar
              </Button>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Detalhes do evento..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Reminders */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Lembretes
            </h4>
            <div className="space-y-2">
              {REMINDER_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`reminder-${option.value}`}
                    checked={formData.reminder_minutes?.includes(option.value)}
                    onCheckedChange={() => toggleReminder(option.value)}
                  />
                  <Label htmlFor={`reminder-${option.value}`} className="text-sm font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.title || isLoading}
              className="flex-1"
            >
              {isLoading ? 'Salvando...' : event ? 'Salvar Alterações' : 'Criar Evento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
