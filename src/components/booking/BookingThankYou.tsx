import { motion } from 'framer-motion';
import { Check, Calendar, Mail, MessageSquare, HelpCircle, Target, Sparkles, TrendingUp, Clock, Video, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BookingCountdown } from './BookingCountdown';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface WhatHappensItem {
  icon: string;
  title: string;
  description: string;
}

interface NextStep {
  icon: string;
  text: string;
}

interface BookingThankYouProps {
  guestName: string;
  eventName: string;
  hostName: string;
  hostAvatar?: string;
  startTime: string | Date;
  endTime?: string | Date;
  duration: number;
  meetLink?: string;
  confirmationToken: string;
  thankYouTitle?: string;
  thankYouMessage?: string;
  whatHappens?: WhatHappensItem[];
  nextSteps?: NextStep[];
  onReschedule?: () => void;
  color?: string;
}

const iconMap: Record<string, typeof Check> = {
  check: Check,
  calendar: Calendar,
  mail: Mail,
  message: MessageSquare,
  help: HelpCircle,
  target: Target,
  sparkles: Sparkles,
  'trending-up': TrendingUp,
  clock: Clock,
  video: Video,
};

const defaultWhatHappens: WhatHappensItem[] = [
  { icon: 'target', title: 'Diagnóstico', description: 'Análise do seu cenário atual' },
  { icon: 'sparkles', title: 'Oportunidades', description: 'Identificação de soluções ideais' },
  { icon: 'trending-up', title: 'Plano', description: 'Roadmap personalizado para você' },
];

const defaultNextSteps: NextStep[] = [
  { icon: 'check', text: 'Reunião confirmada' },
  { icon: 'mail', text: 'Você receberá detalhes por e-mail' },
  { icon: 'help', text: 'Prepare 1-2 desafios para discutirmos' },
];

export function BookingThankYou({
  guestName,
  eventName,
  hostName,
  hostAvatar,
  startTime,
  endTime,
  duration,
  meetLink,
  confirmationToken,
  thankYouTitle,
  thankYouMessage,
  whatHappens = defaultWhatHappens,
  nextSteps = defaultNextSteps,
  onReschedule,
  color = '#10b981',
}: BookingThankYouProps) {
  const startDate = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const firstName = guestName.split(' ')[0];

  const generateICSFile = () => {
    const endDate = endTime 
      ? (typeof endTime === 'string' ? parseISO(endTime) : endTime)
      : new Date(startDate.getTime() + duration * 60 * 1000);
    
    const formatDateForICS = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Booking//PT
BEGIN:VEVENT
DTSTART:${formatDateForICS(startDate)}
DTEND:${formatDateForICS(endDate)}
SUMMARY:${eventName} com ${hostName}
DESCRIPTION:Reunião agendada via link de booking.${meetLink ? `\\n\\nLink: ${meetLink}` : ''}
${meetLink ? `URL:${meetLink}` : ''}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${eventName.replace(/\s+/g, '-').toLowerCase()}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="overflow-hidden border-0 shadow-2xl">
          <CardContent className="p-0">
            {/* Header with animated check */}
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent_50%)]" />
              
              {hostAvatar && (
                <Avatar className="h-16 w-16 mx-auto mb-4 ring-4 ring-background shadow-lg">
                  <AvatarImage src={hostAvatar} />
                  <AvatarFallback>{hostName.charAt(0)}</AvatarFallback>
                </Avatar>
              )}

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4 shadow-lg"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <Check className="h-10 w-10 text-white" strokeWidth={3} />
                </motion.div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold"
              >
                {thankYouTitle || `Confirmado, ${firstName}!`}
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-muted-foreground mt-2"
              >
                {thankYouMessage || 'Sua reunião está agendada'}
              </motion.p>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Date/Time Card */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-muted/50"
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: color + '20' }}
                >
                  <Calendar className="h-6 w-6" style={{ color }} />
                </div>
                <div className="flex-1">
                  <p className="font-medium capitalize">
                    {format(startDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(startDate, 'HH:mm')} • {duration} minutos
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={generateICSFile} className="shrink-0">
                  <CalendarPlus className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Adicionar</span>
                </Button>
              </motion.div>

              {/* Countdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="text-center"
              >
                <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide font-medium">
                  Começa em
                </p>
                <BookingCountdown targetDate={startDate} size="sm" />
              </motion.div>

              {/* What Happens Section */}
              {whatHappens.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <h3 className="font-semibold mb-3 text-center">O que vai acontecer</h3>
                  <div className="space-y-2">
                    {whatHappens.map((item, index) => {
                      const Icon = iconMap[item.icon] || Target;
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 + index * 0.1 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: color + '15' }}
                          >
                            <Icon className="h-5 w-5" style={{ color }} />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Next Steps */}
              {nextSteps.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                >
                  <h3 className="font-semibold mb-3 text-center">Próximos passos</h3>
                  <div className="space-y-2">
                    {nextSteps.map((step, index) => {
                      const Icon = iconMap[step.icon] || Check;
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1 + index * 0.1 }}
                          className="flex items-center gap-3 p-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <p className="text-sm">{step.text}</p>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Meet Link */}
              {meetLink && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.1 }}
                  className="p-4 rounded-xl bg-primary/5 border border-primary/20"
                >
                  <div className="flex items-center gap-3">
                    <Video className="h-5 w-5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Link da reunião</p>
                      <a 
                        href={meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate block"
                      >
                        {meetLink}
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Reschedule */}
              {onReschedule && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="pt-4 border-t"
                >
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">Não vai participar?</span>
                    <Button variant="ghost" size="sm" onClick={onReschedule}>
                      Reagendar
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
