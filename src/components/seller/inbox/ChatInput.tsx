import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Smile,
  Mic,
  Clock,
  Plus,
  Loader2,
  FileText,
  Camera,
  User as UserIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MediaPreviewBar, type PendingAttachment } from './MediaPreviewBar';
import { AudioRecorder } from './AudioRecorder';
import { ContactPickerDialog } from './ContactPickerDialog';
import { PollComposerDialog } from './PollComposerDialog';
import type { MediaPayload, MediaKind } from './MediaAttachment';

interface ChatInputProps {
  onSend: (content: string, media?: MediaPayload) => void;
  onTyping?: (isTyping: boolean) => void;
  onOpenQuickReplies?: () => void;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  aiSuggestion?: string;
  onClearSuggestion?: () => void;
  onScheduleMessage?: () => void;
}

const EMOJI_CATEGORIES = {
  'Frequentes': ['👍', '❤️', '😊', '🎉', '✅', '👋', '🙏', '💪'],
  'Rostos': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍'],
  'Gestos': ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤙', '👋', '💪', '🙏'],
  'Objetos': ['💼', '📱', '💻', '📧', '📝', '📋', '📊', '💰', '🎯', '🔥', '⭐', '✨'],
};

function inferKindFromFile(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function ChatInput({
  onSend,
  onTyping,
  onOpenQuickReplies,
  disabled = false,
  isSending = false,
  placeholder = "Digite uma mensagem...",
  aiSuggestion,
  onClearSuggestion,
  onScheduleMessage,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptRef = useRef<string>('*/*');
  const kindHintRef = useRef<MediaKind | undefined>(undefined);
  const captureRef = useRef<string | undefined>(undefined);

  const { upload, isUploading, progress, error: uploadError, reset: resetUpload } = useMediaUpload();
  const { toast } = useToast();
  const { profile } = useAuth();

  // Fill input with AI suggestion
  useEffect(() => {
    if (aiSuggestion && !input) {
      setInput(aiSuggestion);
      textareaRef.current?.focus();
    }
  }, [aiSuggestion]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // Liberar object URL ao desmontar / trocar
  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending?.previewUrl]);

  useEffect(() => {
    if (uploadError) {
      toast({ title: 'Falha no envio', description: uploadError, variant: 'destructive' });
    }
  }, [uploadError, toast]);

  // ---------- Texto ----------
  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.endsWith('/') && onOpenQuickReplies) onOpenQuickReplies();
    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setInput(input.substring(0, start) + emoji + input.substring(end));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      }, 0);
    } else {
      setInput(input + emoji);
    }
  };

  // ---------- Anexos ----------
  const openFilePicker = (accept: string, kindHint?: MediaKind, capture?: string) => {
    acceptRef.current = accept;
    kindHintRef.current = kindHint;
    captureRef.current = capture;
    setAttachOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.accept = accept;
      if (capture) {
        fileInputRef.current.setAttribute('capture', capture);
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = kindHintRef.current || inferKindFromFile(file);
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending({
      file,
      kind,
      previewUrl: URL.createObjectURL(file),
      caption: '',
    });
  };

  const handleSend = async () => {
    if (disabled || isSending || isUploading) return;

    // Caso 1: Tem anexo pendente
    if (pending) {
      try {
        const { media } = await upload(pending.file, {
          kind: pending.kind,
          durationMs: pending.durationMs,
        });
        const caption = pending.caption.trim() || input.trim();
        onSend(caption, media);
        // Limpa estado
        URL.revokeObjectURL(pending.previewUrl);
        setPending(null);
        setInput('');
        resetUpload();
        if (onTyping) onTyping(false);
      } catch {
        // toast já disparado pelo useEffect
      }
      return;
    }

    // Caso 2: Texto puro
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
    if (onTyping) onTyping(false);
    textareaRef.current?.focus();
  };

  // ---------- Áudio gravado ----------
  const handleAudioConfirm = async (blob: Blob, durationMs: number) => {
    setIsRecording(false);
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
    try {
      const { media } = await upload(file, { kind: 'audio', durationMs });
      onSend('', media);
    } catch {
      // toast no useEffect
    }
  };

  // ---------- Contato / Enquete / Link de Reunião ----------
  const handleContactConfirm = ({ name, phone }: { name: string; phone: string }) => {
    onSend(`📇 *Contato*\nNome: ${name}\nTelefone: ${phone}`);
  };

  const handlePollConfirm = ({ question, options }: { question: string; options: string[] }) => {
    const lines = options.map((o, i) => `${i + 1}) ${o}`).join('\n');
    onSend(`📊 *Enquete:* ${question}\n\n${lines}\n\n_Responda com o número da opção_`);
  };

  const handleMeetingLink = () => {
    setAttachOpen(false);
    const slug = (profile as any)?.booking_slug;
    if (!slug) {
      toast({
        title: 'Link de reunião indisponível',
        description: 'Configure seu link de agendamento no seu perfil.',
        variant: 'destructive',
      });
      return;
    }
    const url = `${window.location.origin}/agendar/${slug}`;
    setInput((prev) => (prev ? `${prev}\n${url}` : `Olá! Agende um horário comigo: ${url}`));
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const canSend = !!pending || input.trim().length > 0;
  const showRecording = isRecording;
  const composerDisabled = disabled || isSending || isUploading;

  return (
    <div className="w-full min-w-0 flex-shrink-0 border-t border-border bg-background overflow-hidden">
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Pré-visualização do anexo pendente */}
      {pending && (
        <MediaPreviewBar
          attachment={pending}
          onCaptionChange={(v) => setPending((p) => (p ? { ...p, caption: v } : p))}
          onRemove={() => {
            if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
            setPending(null);
            resetUpload();
          }}
          isUploading={isUploading}
          progress={progress}
        />
      )}

      {/* Gravador de áudio inline */}
      {showRecording ? (
        <AudioRecorder
          onConfirm={handleAudioConfirm}
          onCancel={() => setIsRecording(false)}
          disabled={composerDisabled}
        />
      ) : (
        <div className="p-3 min-w-0">
          <div className="flex min-w-0 items-end gap-2">
            {/* Left Actions */}
            <div className="flex flex-shrink-0 items-center gap-1 pb-2">
              {/* Emoji Picker */}
              <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled}
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start" side="top">
                  <div className="p-3 max-h-64 overflow-y-auto">
                    {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                      <div key={category} className="mb-3 last:mb-0">
                        <p className="text-xs text-muted-foreground mb-2 font-medium">{category}</p>
                        <div className="grid grid-cols-8 gap-1">
                          {emojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => { insertEmoji(emoji); setIsEmojiOpen(false); }}
                              className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Unified "+" attach menu (Documento, Câmera, Contato, Mídia, Link de Reunião, Enquete) */}
              <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled || !!pending}
                    title="Anexar / Mais ações"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1.5" align="start" side="top">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf', 'document')}
                  >
                    <span className="h-8 w-8 rounded-full bg-violet-500/15 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-violet-500" />
                    </span>
                    <span>Documento</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('image/*', 'image', 'environment')}
                  >
                    <span className="h-8 w-8 rounded-full bg-rose-500/15 flex items-center justify-center">
                      <Camera className="h-4 w-4 text-rose-500" />
                    </span>
                    <span>Câmera</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => { setAttachOpen(false); setContactOpen(true); }}
                  >
                    <span className="h-8 w-8 rounded-full bg-sky-500/15 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-sky-500" />
                    </span>
                    <span>Contato</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('image/*,video/*', undefined)}
                  >
                    <span className="h-8 w-8 rounded-full bg-fuchsia-500/15 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-fuchsia-500" />
                    </span>
                    <span>Mídia</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={handleMeetingLink}
                  >
                    <span className="h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <VideoIcon className="h-4 w-4 text-emerald-500" />
                    </span>
                    <span>Link de Reunião</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => { setAttachOpen(false); setPollOpen(true); }}
                  >
                    <span className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-amber-500" />
                    </span>
                    <span>Enquete</span>
                  </button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Input Area */}
            <div className="flex-1 min-w-0 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pending ? 'Adicionar mensagem (opcional)…' : 'Mensagem'}
                disabled={composerDisabled}
                className={cn(
                  "min-h-[44px] max-h-[150px] py-3 px-4 resize-none",
                  "text-sm leading-relaxed",
                  "bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50",
                  "rounded-2xl"
                )}
                rows={1}
              />
            </div>

            {/* Right Actions */}
            <div className="flex flex-shrink-0 items-center gap-1 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled}
                    onClick={onScheduleMessage}
                  >
                    <Clock className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agendar mensagem</TooltipContent>
              </Tooltip>

              <AnimatePresence mode="wait" initial={false}>
                {canSend ? (
                  <motion.div
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      onClick={handleSend}
                      disabled={composerDisabled || (!pending && !input.trim())}
                      size="icon"
                      className="h-10 w-10 rounded-full shadow-sm"
                    >
                      {isSending || isUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="mic"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setIsRecording(true)}
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          disabled={composerDisabled}
                        >
                          <Mic className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Gravar áudio</TooltipContent>
                    </Tooltip>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs auxiliares */}
      <ContactPickerDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        onConfirm={handleContactConfirm}
      />
      <PollComposerDialog
        open={pollOpen}
        onOpenChange={setPollOpen}
        onConfirm={handlePollConfirm}
      />
    </div>
  );
}
