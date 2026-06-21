import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Clock, 
  Video, 
  Phone, 
  MapPin, 
  Calendar as CalendarIcon,
  Globe,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { 
  usePublicProfile, 
  usePublicEventTypes, 
  usePublicEventTypeBySlug,
  useAvailableSlots,
  useSubmitBooking,
} from '@/hooks/usePublicBooking';
import { BookingThankYou } from '@/components/booking/BookingThankYou';
import { ConversationalBooking, BookingFormData } from '@/components/booking/ConversationalBooking';
import { format, addDays, startOfDay, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { BookingEventType } from '@/hooks/useBookingEventTypes';

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video,
  zoom: Video,
  phone: Phone,
  in_person: MapPin,
};

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  phone: 'Telefone',
  in_person: 'Presencial',
};

type Step = 'list' | 'calendar' | 'form' | 'conversational' | 'confirmation';

export default function PublicBooking() {
  const { userSlug, eventSlug } = useParams<{ userSlug: string; eventSlug?: string }>();
  const navigate = useNavigate();
  
  const [step, setStep] = useState<Step>(eventSlug ? 'calendar' : 'list');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({
    name: '',
    email: '',
    phone: '',
  });
  const [bookingResult, setBookingResult] = useState<{
    bookingId: string;
    meetLink?: string;
    confirmationToken: string;
  } | null>(null);

  // Queries
  const { data: profile, isLoading: loadingProfile } = usePublicProfile(userSlug);
  const { data: eventTypes, isLoading: loadingEventTypes } = usePublicEventTypes(profile?.id);
  const { data: eventData, isLoading: loadingEventType } = usePublicEventTypeBySlug(userSlug, eventSlug);
  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(
    eventData?.eventType?.id,
    selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined
  );
  const submitBooking = useSubmitBooking();

  const eventType = eventData?.eventType;
  const hostProfile = eventData?.profile || profile;

  // Reset when changing event - decide step based on booking_experience
  useEffect(() => {
    if (eventSlug && eventType) {
      if (eventType.booking_experience === 'conversational') {
        setStep('conversational');
      } else {
        setStep('calendar');
      }
      setSelectedDate(undefined);
      setSelectedSlot(null);
    } else if (eventSlug && !loadingEventType) {
      // Event slug provided but no event type found yet or loading
      setStep('calendar'); // Will be corrected once eventType loads
    } else if (!eventSlug) {
      setStep('list');
    }
  }, [eventSlug, eventType?.booking_experience, loadingEventType]);

  const handleSelectEventType = (et: BookingEventType) => {
    navigate(`/agendar/${userSlug}/${et.slug}`);
  };

  const handleSelectDate = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSelectSlot = (slot: { start: string; end: string }) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleBack = () => {
    if (step === 'form') {
      setStep('calendar');
      setSelectedSlot(null);
    } else if (step === 'calendar' || step === 'conversational') {
      navigate(`/agendar/${userSlug}`);
    }
  };

  // Handler for conversational booking submit
  const handleConversationalSubmit = async (data: BookingFormData) => {
    if (!eventType || !selectedDate) return;

    const startTime = `${format(selectedDate, 'yyyy-MM-dd')}T${data.selectedSlot.start}:00`;
    
    // Collect additional info
    const additionalInfo: Record<string, string> = {};
    if (data.additionalInfo) {
      Object.entries(data.additionalInfo).forEach(([key, value]) => {
        additionalInfo[key] = value;
      });
    }

    try {
      const result = await submitBooking.mutateAsync({
        eventTypeId: eventType.id,
        startTime,
        guestName: data.name,
        guestEmail: data.email,
        guestPhone: data.phone || undefined,
        additionalInfo,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tracking: {
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        },
      });

      setFormData({
        name: data.name,
        email: data.email,
        phone: data.phone,
      });
      setSelectedSlot(data.selectedSlot);
      setBookingResult(result);
      setStep('confirmation');
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventType || !selectedDate || !selectedSlot) return;

    const startTime = `${format(selectedDate, 'yyyy-MM-dd')}T${selectedSlot.start}:00`;
    
    // Collect additional info from custom questions
    const additionalInfo: Record<string, string> = {};
    eventType.questions?.forEach((q) => {
      if (formData[q.id]) {
        additionalInfo[q.label] = formData[q.id];
      }
    });

    try {
      const result = await submitBooking.mutateAsync({
        eventTypeId: eventType.id,
        startTime,
        guestName: formData.name,
        guestEmail: formData.email,
        guestPhone: formData.phone || undefined,
        additionalInfo,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tracking: {
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        },
      });

      setBookingResult(result);
      setStep('confirmation');
    } catch (error) {
      // Error handled in hook
    }
  };

  // Date constraints
  const minDate = addDays(new Date(), Math.ceil((eventType?.min_notice_hours || 24) / 24));
  const maxDate = addDays(new Date(), eventType?.max_days_ahead || 60);

  const isDateDisabled = (date: Date) => {
    return isBefore(startOfDay(date), startOfDay(minDate)) || 
           isAfter(startOfDay(date), startOfDay(maxDate));
  };

  // Loading states
  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile && !loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
            <p className="text-muted-foreground">
              O link de agendamento que você está procurando não existe ou foi removido.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const LocationIcon = locationIcons[eventType?.location_type || 'google_meet'] || Video;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Event Type List */}
        {step === 'list' && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* Profile Header */}
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 text-center">
                <Avatar className="h-20 w-20 mx-auto mb-4">
                  <AvatarImage src={hostProfile?.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl">
                    {hostProfile?.full_name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <h1 className="text-2xl font-bold">{hostProfile?.full_name}</h1>
                {hostProfile?.booking_bio && (
                  <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                    {hostProfile.booking_bio}
                  </p>
                )}
              </div>

              {/* Event Types */}
              <div className="p-6 space-y-3">
                {loadingEventTypes ? (
                  [1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))
                ) : eventTypes?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum tipo de evento disponível no momento.
                  </p>
                ) : (
                  eventTypes?.map((et) => {
                    const Icon = locationIcons[et.location_type] || Video;
                    return (
                      <button
                        key={et.id}
                        onClick={() => handleSelectEventType(et)}
                        className="w-full p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className="w-1 h-12 rounded-full"
                            style={{ backgroundColor: et.color }}
                          />
                          <div className="flex-1">
                            <h3 className="font-medium group-hover:text-primary transition-colors">
                              {et.name}
                            </h3>
                            {et.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {et.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {et.duration_minutes} min
                              </span>
                              <span className="flex items-center gap-1">
                                <Icon className="h-3.5 w-3.5" />
                                {locationLabels[et.location_type]}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Step */}
        {step === 'calendar' && eventType && (
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                {/* Sidebar */}
                <div className="md:w-64 p-6 border-b md:border-b-0 md:border-r bg-muted/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-4 -ml-2"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>

                  <Avatar className="h-12 w-12 mb-3">
                    <AvatarImage src={hostProfile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {hostProfile?.full_name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm text-muted-foreground">{hostProfile?.full_name}</p>
                  <h2 className="text-lg font-semibold mt-1">{eventType.name}</h2>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{eventType.duration_minutes} min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <LocationIcon className="h-4 w-4" />
                      <span>
                        {eventType.create_meet 
                          ? 'Link após confirmação'
                          : locationLabels[eventType.location_type]
                        }
                      </span>
                    </div>
                  </div>

                  {eventType.description && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {eventType.description}
                    </p>
                  )}
                </div>

                {/* Calendar & Slots */}
                <div className="flex-1 p-6">
                  <h3 className="font-medium mb-4">Escolha uma data e horário</h3>
                  
                  <div className="flex flex-col gap-4 sm:gap-6">
                    <div>
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleSelectDate}
                        disabled={isDateDisabled}
                        locale={ptBR}
                        className="rounded-md border pointer-events-auto"
                      />
                      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        <span>Horário de Brasília</span>
                      </div>
                    </div>

                    {selectedDate && (
                      <div className="flex-1">
                        <h4 className="font-medium mb-3 capitalize">
                          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </h4>
                        
                        {loadingSlots ? (
                          <div className="space-y-2">
                            {[1, 2, 3, 4].map((i) => (
                              <Skeleton key={i} className="h-10 w-full" />
                            ))}
                          </div>
                        ) : slots?.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">
                            Nenhum horário disponível nesta data. Escolha outra data.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-2">
                            {slots?.filter(s => s.available).map((slot) => (
                              <Button
                                key={slot.start}
                                variant="outline"
                                className="justify-center"
                                onClick={() => handleSelectSlot(slot)}
                              >
                                {slot.start}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form Step */}
        {step === 'form' && eventType && selectedDate && selectedSlot && (
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                {/* Sidebar */}
                <div className="md:w-64 p-6 border-b md:border-b-0 md:border-r bg-muted/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="mb-4 -ml-2"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>

                  <Avatar className="h-12 w-12 mb-3">
                    <AvatarImage src={hostProfile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {hostProfile?.full_name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm text-muted-foreground">{hostProfile?.full_name}</p>
                  <h2 className="text-lg font-semibold mt-1">{eventType.name}</h2>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{eventType.duration_minutes} min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <LocationIcon className="h-4 w-4" />
                      <span>Link após confirmação</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      <span>
                        {selectedSlot.start} - {selectedSlot.end}
                        <br />
                        {format(selectedDate, "EEE, dd MMM", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>Brasília</span>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="flex-1 p-6">
                  <h3 className="font-medium mb-4">Preencha seus dados</h3>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Seu nome completo"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="seu@email.com"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(11) 99999-9999"
                      />
                    </div>

                    {/* Custom Questions — filtra as que duplicam Nome / E-mail / Telefone padrão */}
                    {eventType.questions?.filter((question) => {
                      const label = (question.label || '').toLowerCase().trim();
                      const type = (question.type || '').toLowerCase();
                      // Remove perguntas que são equivalentes aos campos fixos
                      if (type === 'email' || type === 'phone' || type === 'tel') return false;
                      if (/\bnome\b/.test(label)) return false;
                      if (/\b(e-?mail|email)\b/.test(label)) return false;
                      if (/\b(telefone|celular|whats?app|phone)\b/.test(label)) return false;
                      return true;
                    }).map((question) => (
                      <div key={question.id} className="space-y-2">
                        <Label htmlFor={question.id}>
                          {question.label} {question.required && '*'}
                        </Label>
                        {question.type === 'textarea' ? (
                          <Textarea
                            id={question.id}
                            value={formData[question.id] || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, [question.id]: e.target.value }))}
                            placeholder={question.placeholder}
                            required={question.required}
                          />
                        ) : (
                          <Input
                            id={question.id}
                            type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
                            value={formData[question.id] || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, [question.id]: e.target.value }))}
                            placeholder={question.placeholder}
                            required={question.required}
                          />
                        )}
                      </div>
                    ))}

                    <p className="text-xs text-muted-foreground">
                      Ao prosseguir, você confirma que leu e aceita nossos Termos de Uso.
                    </p>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={submitBooking.isPending}
                    >
                      {submitBooking.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Agendando...
                        </>
                      ) : (
                        'Agendar Evento'
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Conversational Step */}
        {step === 'conversational' && eventType && (
          <ConversationalBooking
            eventName={eventType.name}
            eventDescription={eventType.description || undefined}
            duration={eventType.duration_minutes}
            hostName={hostProfile?.full_name || ''}
            hostAvatar={hostProfile?.avatar_url || undefined}
            color={eventType.color}
            questions={eventType.questions}
            minNoticeHours={eventType.min_notice_hours}
            maxDaysAhead={eventType.max_days_ahead}
            slots={slots || []}
            loadingSlots={loadingSlots}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onSubmit={handleConversationalSubmit}
            isSubmitting={submitBooking.isPending}
            onBack={handleBack}
          />
        )}

        {/* Confirmation Step - Premium Thank You Page */}
        {step === 'confirmation' && eventType && selectedDate && selectedSlot && bookingResult && (
          <BookingThankYou
            guestName={formData.name}
            eventName={eventType.name}
            hostName={hostProfile?.full_name || ''}
            hostAvatar={hostProfile?.avatar_url || undefined}
            startTime={`${format(selectedDate, 'yyyy-MM-dd')}T${selectedSlot.start}:00`}
            duration={eventType.duration_minutes}
            meetLink={bookingResult.meetLink}
            confirmationToken={bookingResult.confirmationToken}
            thankYouTitle={eventType.thank_you_title || undefined}
            thankYouMessage={eventType.thank_you_message || undefined}
            whatHappens={Array.isArray(eventType.what_happens) ? eventType.what_happens as { icon: string; title: string; description: string }[] : undefined}
            nextSteps={Array.isArray(eventType.next_steps) ? eventType.next_steps as { icon: string; text: string }[] : undefined}
            color={eventType.color}
            onReschedule={() => navigate(`/reagendar/${bookingResult.confirmationToken}`)}
          />
        )}
      </div>
    </div>
  );
}
