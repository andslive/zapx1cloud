import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, Video, User, Mail, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBookingByToken } from '@/hooks/useBookingConfirmation';
import { BookingCountdown, CountdownProgress } from '@/components/booking/BookingCountdown';
import { format, parseISO, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Logo } from '@/components/ui/Logo';

export default function BookingConfirmation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: booking, isLoading, error } = useBookingByToken(token);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Link Inválido</h1>
            <p className="text-muted-foreground">
              Este link de confirmação não é válido ou a reunião foi cancelada.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startDate = parseISO(booking.start_time);
  const endDate = parseISO(booking.end_time);
  const isUpcoming = isBefore(new Date(), startDate);
  const isCancelled = booking.status === 'cancelled';

  const handleReschedule = () => {
    // Navigate to reschedule flow
    navigate(`/reagendar/${token}`);
  };

  const handleJoinMeeting = () => {
    if (booking.calendar_event?.meet_link) {
      window.open(booking.calendar_event.meet_link, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-center">
        <Logo size="md" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          <Card className="overflow-hidden shadow-2xl border-0">
            <CardContent className="p-0">
              {/* Progress Bar */}
              {isUpcoming && !isCancelled && (
                <div className="p-6 pb-0">
                  <CountdownProgress 
                    targetDate={startDate} 
                    createdAt={parseISO(booking.created_at)} 
                  />
                </div>
              )}

              {/* Main Content */}
              <div className="p-4 sm:p-6 space-y-6">
                {isCancelled ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Reunião Cancelada</h1>
                    <p className="text-muted-foreground">
                      Esta reunião foi cancelada.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Countdown */}
                    {isUpcoming && (
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide font-medium">
                          {isUpcoming ? 'Começa em' : 'Reunião em andamento'}
                        </p>
                        <BookingCountdown targetDate={startDate} size="md" />
                      </div>
                    )}

                    {/* Meeting Details Card */}
                    <Card className="bg-muted/30">
                      <CardContent className="p-3 sm:p-4 space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold capitalize">
                              {format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 p-3 rounded-lg bg-background">
                          <User className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Participante</p>
                            <p className="font-medium">{booking.guest_name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 p-3 rounded-lg bg-background">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">E-mail</p>
                            <p className="font-medium">{booking.guest_email}</p>
                          </div>
                        </div>

                        {booking.calendar_event?.meet_link && (
                          <div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <Video className="h-5 w-5 text-primary" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground">Link da reunião</p>
                              <a 
                                href={booking.calendar_event.meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline truncate block"
                              >
                                {booking.calendar_event.meet_link}
                              </a>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3">
                      {booking.calendar_event?.meet_link && (
                        <Button 
                          size="lg" 
                          className="w-full"
                          onClick={handleJoinMeeting}
                          disabled={isUpcoming}
                        >
                          {isUpcoming ? (
                            <>
                              <Clock className="h-4 w-4 mr-2" />
                              Aguarde o Horário
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Entrar na Reunião
                            </>
                          )}
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline" 
                        size="lg" 
                        className="w-full"
                        onClick={handleReschedule}
                      >
                        Reagendar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
