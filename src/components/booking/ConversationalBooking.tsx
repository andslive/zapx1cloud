import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ArrowLeft, Clock, Video, Calendar as CalendarIcon, Globe, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format, addDays, startOfDay, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { QuestionField } from '@/hooks/useBookingEventTypes';

interface ConversationalBookingProps {
  eventName: string;
  eventDescription?: string;
  duration: number;
  hostName: string;
  hostAvatar?: string;
  color?: string;
  questions?: QuestionField[];
  minNoticeHours?: number;
  maxDaysAhead?: number;
  slots: { start: string; end: string; available: boolean }[];
  loadingSlots?: boolean;
  selectedDate?: Date;
  onDateSelect: (date: Date | undefined) => void;
  onSubmit: (data: BookingFormData) => void;
  isSubmitting?: boolean;
  onBack?: () => void;
}

export interface BookingFormData {
  name: string;
  email: string;
  phone: string;
  selectedSlot: { start: string; end: string };
  additionalInfo: Record<string, string>;
}

type ConversationStep = 'welcome' | 'name' | 'email' | 'phone' | 'questions' | 'calendar' | 'confirmation';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  isTyping?: boolean;
}

export function ConversationalBooking({
  eventName,
  eventDescription,
  duration,
  hostName,
  hostAvatar,
  color = '#10b981',
  questions = [],
  minNoticeHours = 24,
  maxDaysAhead = 60,
  slots,
  loadingSlots,
  selectedDate,
  onDateSelect,
  onSubmit,
  isSubmitting,
  onBack,
}: ConversationalBookingProps) {
  const [currentStep, setCurrentStep] = useState<ConversationStep>('welcome');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [formData, setFormData] = useState<Partial<BookingFormData>>({
    name: '',
    email: '',
    phone: '',
    additionalInfo: {},
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Initial welcome message
    if (messages.length === 0) {
      setTimeout(() => {
        addBotMessage(`Olá! 👋 Vamos agendar sua ${eventName}?`);
        setTimeout(() => {
          addBotMessage('Para começar, qual é o seu nome?');
          setCurrentStep('name');
        }, 1000);
      }, 500);
    }
  }, []);

  const addBotMessage = (content: string) => {
    const id = Date.now().toString();
    // Add typing indicator
    setMessages(prev => [...prev, { id: id + '-typing', type: 'bot', content: '', isTyping: true }]);
    
    setTimeout(() => {
      setMessages(prev => [
        ...prev.filter(m => m.id !== id + '-typing'),
        { id, type: 'bot', content }
      ]);
    }, 500 + Math.random() * 500);
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), type: 'user', content }]);
  };

  const handleSubmitInput = () => {
    if (!inputValue.trim()) return;
    
    const value = inputValue.trim();
    addUserMessage(value);
    setInputValue('');

    switch (currentStep) {
      case 'name':
        setFormData(prev => ({ ...prev, name: value }));
        setTimeout(() => {
          addBotMessage(`Prazer em conhecê-lo, ${value.split(' ')[0]}! 😊`);
          setTimeout(() => {
            addBotMessage('Qual é o seu melhor e-mail?');
            setCurrentStep('email');
          }, 800);
        }, 300);
        break;

      case 'email':
        if (!value.includes('@')) {
          addBotMessage('Ops! Parece que esse e-mail não é válido. Pode verificar?');
          return;
        }
        setFormData(prev => ({ ...prev, email: value }));
        setTimeout(() => {
          addBotMessage('Perfeito! E qual é o seu telefone? (opcional, pode pular com Enter)');
          setCurrentStep('phone');
        }, 300);
        break;

      case 'phone':
        setFormData(prev => ({ ...prev, phone: value }));
        handleAfterPhone();
        break;

      case 'questions':
        const currentQuestion = questions[currentQuestionIndex];
        setFormData(prev => ({
          ...prev,
          additionalInfo: { ...prev.additionalInfo, [currentQuestion.label]: value }
        }));
        
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setTimeout(() => {
            addBotMessage(questions[currentQuestionIndex + 1].label);
          }, 300);
        } else {
          setTimeout(() => {
            addBotMessage('Ótimo! Agora escolha o melhor dia e horário para nossa reunião:');
            setCurrentStep('calendar');
          }, 300);
        }
        break;
    }
  };

  const handleSkipPhone = () => {
    addUserMessage('Pular');
    handleAfterPhone();
  };

  const handleAfterPhone = () => {
    if (questions.length > 0) {
      setTimeout(() => {
        addBotMessage(questions[0].label);
        setCurrentStep('questions');
      }, 300);
    } else {
      setTimeout(() => {
        addBotMessage('Excelente! Agora escolha o melhor dia e horário para nossa reunião:');
        setCurrentStep('calendar');
      }, 300);
    }
  };

  const handleSelectSlot = (slot: { start: string; end: string }) => {
    setSelectedSlot(slot);
    addUserMessage(`${format(selectedDate!, 'dd/MM')} às ${slot.start}`);
    setTimeout(() => {
      addBotMessage('Perfeito! Vou confirmar os dados do seu agendamento.');
      setShowConfirmDialog(true);
    }, 500);
  };

  const handleConfirm = () => {
    if (!selectedSlot || !formData.name || !formData.email) return;
    
    onSubmit({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || '',
      selectedSlot,
      additionalInfo: formData.additionalInfo || {},
    });
    setShowConfirmDialog(false);
  };

  const minDate = addDays(new Date(), Math.ceil(minNoticeHours / 24));
  const maxDate = addDays(new Date(), maxDaysAhead);

  const isDateDisabled = (date: Date) => {
    return isBefore(startOfDay(date), startOfDay(minDate)) || 
           isAfter(startOfDay(date), startOfDay(maxDate));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentStep === 'phone' && !inputValue.trim()) {
        handleSkipPhone();
      } else {
        handleSubmitInput();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col pb-safe">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-4 flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10">
            <AvatarImage src={hostAvatar} />
            <AvatarFallback style={{ backgroundColor: color + '20', color }}>
              {hostName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="font-semibold">{eventName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{duration} min</span>
              <span>•</span>
              <Video className="h-3.5 w-3.5" />
              <span>Videochamada</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'flex gap-3',
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.type === 'bot' && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={hostAvatar} />
                    <AvatarFallback style={{ backgroundColor: color + '20', color }}>
                      {hostName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted rounded-bl-sm'
                  )}
                >
                  {message.isTyping ? (
                    <div className="flex gap-1 py-1">
                      <motion.span
                        className="w-2 h-2 rounded-full bg-current opacity-60"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                      />
                      <motion.span
                        className="w-2 h-2 rounded-full bg-current opacity-60"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                      />
                      <motion.span
                        className="w-2 h-2 rounded-full bg-current opacity-60"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Calendar Step */}
          {currentStep === 'calendar' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:gap-6">
                    <div>
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={onDateSelect}
                        disabled={isDateDisabled}
                        locale={ptBR}
                        className="rounded-md border"
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
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : slots.filter(s => s.available).length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">
                            Nenhum horário disponível nesta data.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-2">
                            {slots.filter(s => s.available).map((slot) => (
                              <Button
                                key={slot.start}
                                variant={selectedSlot?.start === slot.start ? 'default' : 'outline'}
                                size="sm"
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
                </CardContent>
              </Card>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {currentStep !== 'calendar' && (
        <div className="border-t bg-background/80 backdrop-blur-sm sticky bottom-0 pb-safe">
          <div className="max-w-2xl mx-auto p-3 sm:p-4">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  currentStep === 'name' ? 'Digite seu nome...' :
                  currentStep === 'email' ? 'Digite seu e-mail...' :
                  currentStep === 'phone' ? 'Digite seu telefone (ou Enter para pular)...' :
                  'Digite sua resposta...'
                }
                className="flex-1"
                autoFocus
              />
              <Button 
                onClick={handleSubmitInput} 
                disabled={!inputValue.trim() && currentStep !== 'phone'}
                style={{ backgroundColor: color }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium capitalize">
                    {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedSlot?.start} - {selectedSlot?.end}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm">{eventName} • {duration} min</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome:</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-mail:</span>
                <span className="font-medium">{formData.email}</span>
              </div>
              {formData.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-medium">{formData.phone}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Voltar
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting} style={{ backgroundColor: color }}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Agendamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
