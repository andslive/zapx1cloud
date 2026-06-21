import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Clock, CalendarOff, CheckCircle2, XCircle } from 'lucide-react';
import {
  useBusinessHours, useUpsertBusinessHours, useBusinessHolidays,
  useAddHoliday, useDeleteHoliday, isWithinBusinessHoursLocal,
  DAY_LABELS, DAY_ORDER, type WeekSchedule, type DayKey, type ScheduleBlock,
} from '@/hooks/useBusinessHours';

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
];

const DEFAULT_SCHEDULE: WeekSchedule = {
  mon: [{ start: '09:00', end: '18:00' }],
  tue: [{ start: '09:00', end: '18:00' }],
  wed: [{ start: '09:00', end: '18:00' }],
  thu: [{ start: '09:00', end: '18:00' }],
  fri: [{ start: '09:00', end: '18:00' }],
  sat: [],
  sun: [],
};

export function BusinessHoursManager() {
  const { data: bh } = useBusinessHours();
  const { data: holidays } = useBusinessHolidays();
  const upsert = useUpsertBusinessHours();
  const addHoliday = useAddHoliday();
  const delHoliday = useDeleteHoliday();

  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [outMessage, setOutMessage] = useState('');
  const [outEnabled, setOutEnabled] = useState(false);

  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');

  useEffect(() => {
    if (bh) {
      setSchedule(bh.schedule ?? DEFAULT_SCHEDULE);
      setTimezone(bh.timezone);
      setOutMessage(bh.out_of_hours_message);
      setOutEnabled(bh.out_of_hours_enabled);
    }
  }, [bh]);

  const isOpenNow = isWithinBusinessHoursLocal(
    bh ? { ...bh, schedule, timezone } : null,
    holidays ?? [],
  );

  const updateBlock = (day: DayKey, idx: number, field: 'start' | 'end', value: string) => {
    setSchedule((s) => ({
      ...s,
      [day]: s[day].map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    }));
  };

  const addBlock = (day: DayKey) => {
    setSchedule((s) => ({ ...s, [day]: [...s[day], { start: '09:00', end: '18:00' }] }));
  };

  const removeBlock = (day: DayKey, idx: number) => {
    setSchedule((s) => ({ ...s, [day]: s[day].filter((_, i) => i !== idx) }));
  };

  const toggleDay = (day: DayKey, on: boolean) => {
    setSchedule((s) => ({
      ...s,
      [day]: on ? [{ start: '09:00', end: '18:00' }] : [],
    }));
  };

  const handleSave = () => {
    upsert.mutate({
      schedule,
      timezone,
      out_of_hours_message: outMessage,
      out_of_hours_enabled: outEnabled,
    });
  };

  const handleAddHoliday = () => {
    if (!newHolidayDate) return;
    addHoliday.mutate({ date: newHolidayDate, description: newHolidayDesc });
    setNewHolidayDate('');
    setNewHolidayDesc('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Horários de funcionamento</h1>
          <p className="text-sm text-muted-foreground">
            Defina quando sua equipe atende. Fora desse horário, a IA pode enviar uma mensagem automática.
          </p>
        </div>
        <Badge variant={isOpenNow ? 'default' : 'secondary'} className="gap-2 text-sm py-2 px-3">
          {isOpenNow ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          Agora: {isOpenNow ? 'Aberto' : 'Fechado'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Agenda semanal
          </CardTitle>
          <CardDescription>Configure os horários de cada dia. Você pode adicionar múltiplos blocos (ex.: 08-12 e 14-18).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label>Fuso horário</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {DAY_ORDER.map((day) => {
              const blocks = schedule[day] ?? [];
              const enabled = blocks.length > 0;
              return (
                <div key={day} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3 min-w-[140px] pt-1">
                    <Switch checked={enabled} onCheckedChange={(v) => toggleDay(day, v)} />
                    <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    {!enabled ? (
                      <p className="text-sm text-muted-foreground pt-1">Fechado</p>
                    ) : (
                      <>
                        {blocks.map((b, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input type="time" value={b.start} onChange={(e) => updateBlock(day, idx, 'start', e.target.value)} className="w-32" />
                            <span className="text-muted-foreground text-sm">às</span>
                            <Input type="time" value={b.end} onChange={(e) => updateBlock(day, idx, 'end', e.target.value)} className="w-32" />
                            {blocks.length > 1 && (
                              <Button variant="ghost" size="icon" onClick={() => removeBlock(day, idx)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => addBlock(day)}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar bloco
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagem fora do horário</CardTitle>
          <CardDescription>O que enviar automaticamente quando alguém escrever fora do expediente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch checked={outEnabled} onCheckedChange={setOutEnabled} />
            <Label className="cursor-pointer" onClick={() => setOutEnabled(!outEnabled)}>
              Ativar resposta automática fora do horário
            </Label>
          </div>
          <Textarea
            value={outMessage}
            onChange={(e) => setOutMessage(e.target.value)}
            placeholder="Ex.: Olá! Estamos fora do horário de atendimento. Retornaremos no próximo dia útil."
            rows={3}
            disabled={!outEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarOff className="h-4 w-4" /> Feriados e datas bloqueadas
          </CardTitle>
          <CardDescription>Datas em que a empresa estará fechada mesmo sendo dia útil.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="sm:w-44" />
            <Input value={newHolidayDesc} onChange={(e) => setNewHolidayDesc(e.target.value)} placeholder="Descrição (opcional, ex.: Natal)" className="flex-1" />
            <Button onClick={handleAddHoliday} disabled={!newHolidayDate}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </div>
          {holidays && holidays.length > 0 && (
            <div className="space-y-2">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                  <Badge variant="outline">{new Date(h.date + 'T00:00:00').toLocaleDateString('pt-BR')}</Badge>
                  <span className="flex-1 text-sm">{h.description ?? '—'}</span>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delHoliday.mutate(h.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={upsert.isPending}>
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
