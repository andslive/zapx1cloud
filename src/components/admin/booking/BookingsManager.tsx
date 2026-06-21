import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, Video, Phone, MapPin, User, Mail, MoreHorizontal, X, Check } from 'lucide-react';
import { useBookings, BookingRequest } from '@/hooks/useBookings';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookingStatusBadge } from './BookingStatusBadge';
import { BookingTimeline } from './BookingTimeline';

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video,
  zoom: Video,
  phone: Phone,
  in_person: MapPin,
};

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  completed: { label: 'Concluído', variant: 'outline' },
};

export function BookingsManager() {
  const [tab, setTab] = useState('upcoming');
  const { bookings, bookingsByDate, isLoading, cancelBooking, markCompleted } = useBookings({ 
    upcoming: tab === 'upcoming' 
  });
  
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleCancelBooking = () => {
    if (selectedBooking) {
      cancelBooking.mutate({ id: selectedBooking.id, reason: cancelReason });
    }
    setCancelDialogOpen(false);
    setSelectedBooking(null);
    setCancelReason('');
  };

  const handleMarkCompleted = (booking: BookingRequest) => {
    markCompleted.mutate(booking.id);
  };

  const openCancelDialog = (booking: BookingRequest) => {
    setSelectedBooking(booking);
    setCancelDialogOpen(true);
  };

  const openDetailDialog = (booking: BookingRequest) => {
    setSelectedBooking(booking);
    setDetailDialogOpen(true);
  };

  const formatDateHeader = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    return format(date, "EEEE, dd 'de' MMMM", { locale: ptBR });
  };

  const upcomingBookings = bookings.filter(b => 
    b.status !== 'cancelled' && !isPast(parseISO(b.start_time))
  );
  const pastBookings = bookings.filter(b => 
    isPast(parseISO(b.start_time)) || b.status === 'cancelled'
  );

  const displayBookings = tab === 'upcoming' ? upcomingBookings : pastBookings;

  // Group by date
  const groupedBookings = displayBookings.reduce((acc, booking) => {
    const date = booking.start_time.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(booking);
    return acc;
  }, {} as Record<string, BookingRequest[]>);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reuniões Agendadas</h2>
        <p className="text-muted-foreground">
          Gerencie os agendamentos feitos pelos visitantes
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="upcoming">
            Próximos ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Anteriores ({pastBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          {displayBookings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-1">
                  {tab === 'upcoming' ? 'Nenhuma reunião agendada' : 'Nenhuma reunião anterior'}
                </h3>
                <p className="text-muted-foreground text-center">
                  {tab === 'upcoming' 
                    ? 'Quando visitantes agendarem reuniões, elas aparecerão aqui.'
                    : 'Reuniões passadas e canceladas aparecerão aqui.'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedBookings)
                .sort(([a], [b]) => tab === 'upcoming' ? a.localeCompare(b) : b.localeCompare(a))
                .map(([date, dayBookings]) => (
                  <div key={date}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                      {formatDateHeader(date)}
                    </h3>
                    <div className="space-y-3">
                      {dayBookings.map((booking) => {
                        const LocationIcon = locationIcons[booking.event_type?.location_type || 'google_meet'];
                        const status = statusLabels[booking.status];
                        
                        return (
                          <Card key={booking.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                {/* Time & Color */}
                                <div className="text-center shrink-0">
                                  <div 
                                    className="w-1 h-12 rounded-full mb-1 mx-auto"
                                    style={{ backgroundColor: booking.event_type?.color || '#3b82f6' }}
                                  />
                                  <span className="text-sm font-medium">
                                    {format(parseISO(booking.start_time), 'HH:mm')}
                                  </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h4 className="font-medium flex items-center gap-2">
                                        {booking.guest_name}
                                        <BookingStatusBadge status={booking.status} />

                                      </h4>
                                      <p className="text-sm text-muted-foreground">
                                        {booking.event_type?.name}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5" />
                                      {format(parseISO(booking.start_time), 'HH:mm')} - {format(parseISO(booking.end_time), 'HH:mm')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <LocationIcon className="h-3.5 w-3.5" />
                                      {booking.event_type?.location_type === 'google_meet' ? 'Google Meet' : 'Presencial'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3.5 w-3.5" />
                                      {booking.guest_email}
                                    </span>
                                  </div>
                                </div>

                                {/* Actions */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openDetailDialog(booking)}>
                                      Ver Detalhes
                                    </DropdownMenuItem>
                                    {booking.status === 'confirmed' && (
                                      <>
                                        <DropdownMenuItem onClick={() => handleMarkCompleted(booking)}>
                                          <Check className="h-4 w-4 mr-2" />
                                          Marcar Concluído
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                          onClick={() => openCancelDialog(booking)}
                                          className="text-destructive"
                                        >
                                          <X className="h-4 w-4 mr-2" />
                                          Cancelar
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja cancelar a reunião com <strong>{selectedBooking?.guest_name}</strong>?
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Voltar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelBooking}
              disabled={cancelBooking.isPending}
            >
              Cancelar Reunião
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Agendamento</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>
                      {selectedBooking.guest_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium">{selectedBooking.guest_name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedBooking.guest_email}</p>
                  </div>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium">{selectedBooking.event_type?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data:</span>
                    <span className="font-medium">
                      {format(parseISO(selectedBooking.start_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horário:</span>
                    <span className="font-medium">
                      {format(parseISO(selectedBooking.start_time), 'HH:mm')} - {format(parseISO(selectedBooking.end_time), 'HH:mm')}
                    </span>
                  </div>
                  {selectedBooking.guest_phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefone:</span>
                      <span className="font-medium">{selectedBooking.guest_phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    <BookingStatusBadge status={selectedBooking.status} />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Linha do tempo</h4>
                  <BookingTimeline bookingId={selectedBooking.id} />
                </div>

                {selectedBooking.additional_info && Object.keys(selectedBooking.additional_info).length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Informações Adicionais</h4>
                    <div className="space-y-2 text-sm">
                      {Object.entries(selectedBooking.additional_info).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>
                          <p className="font-medium">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedBooking.cancellation_reason && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium text-destructive mb-1">Motivo do Cancelamento</h4>
                    <p className="text-sm">{selectedBooking.cancellation_reason}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
