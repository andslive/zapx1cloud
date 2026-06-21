import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Loader2, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioRecorderProps {
  /** Chamado quando o usuário confirma o envio. Retorna o Blob + duração ms. */
  onConfirm: (blob: Blob, durationMs: number) => void;
  onCancel: () => void;
  disabled?: boolean;
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Gravador de áudio inline. Pede permissão do mic, mostra timer,
 * permite cancelar (lixeira) ou confirmar (enviar).
 */
export function AudioRecorder({ onConfirm, onCancel, disabled }: AudioRecorderProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isStarting, setIsStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inicia ao montar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        mediaRecorderRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.start(250);
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setElapsed(Date.now() - startTimeRef.current);
        }, 200);
        setIsStarting(false);
      } catch (e: any) {
        setError(e?.message || 'Permissão de microfone negada.');
        setIsStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try { rec.stop(); } catch { /* noop */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopAndGetBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const rec = mediaRecorderRef.current;
      if (!rec) { reject(new Error('Recorder ausente')); return; }
      if (rec.state === 'inactive') {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        resolve(blob); return;
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        resolve(blob);
      };
      rec.stop();
    });
  };

  const handleConfirm = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = Date.now() - startTimeRef.current;
    try {
      const blob = await stopAndGetBlob();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onConfirm(blob, duration);
    } catch (e: any) {
      setError(e?.message || 'Falha ao finalizar gravação.');
    }
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  };

  if (error) {
    return (
      <div className="px-3 py-2 border-t border-border bg-destructive/10 flex items-center gap-2">
        <span className="text-xs text-destructive flex-1">{error}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>OK</Button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-border bg-muted/40 flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleCancel}
        disabled={disabled || isStarting}
        aria-label="Cancelar gravação"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center gap-2">
        <span className={cn(
          "h-2.5 w-2.5 rounded-full bg-destructive",
          !isStarting && "animate-pulse",
        )} />
        <span className="text-sm font-mono tabular-nums">{formatTime(elapsed)}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {isStarting ? 'Iniciando microfone…' : 'Gravando — toque em enviar para concluir'}
        </span>
      </div>

      <Button
        size="icon"
        className="h-10 w-10 rounded-full"
        onClick={handleConfirm}
        disabled={disabled || isStarting || elapsed < 500}
        aria-label="Enviar áudio"
      >
        {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
