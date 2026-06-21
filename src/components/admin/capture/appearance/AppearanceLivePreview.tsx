import { useEffect, useRef, useState } from 'react';
import { Bot, Send, MessageCircle, ChevronRight, CheckCircle2, Smile, Paperclip } from 'lucide-react';
import type { ChannelAppearance, ChannelKey, ChatChannelOptions, FormChannelOptions, WidgetChannelOptions, QuizChannelOptions } from '@/types/funnel';
import { applyAppearance, ensureFontLoaded, shadowToCss } from '@/lib/funnelAppearance';
import { pickContrast } from '@/lib/colors';
import { cn } from '@/lib/utils';

interface Props {
  channel: ChannelKey;
  appearance: ChannelAppearance;
  device: 'mobile' | 'desktop';
}

export function AppearanceLivePreview({ channel, appearance, device }: Props) {
  useEffect(() => { ensureFontLoaded(appearance.font_family); }, [appearance.font_family]);

  const frameClass = device === 'mobile'
    ? 'w-full max-w-[360px] aspect-[9/16] sm:h-[640px] sm:aspect-auto'
    : 'w-full max-w-[760px] h-[560px]';

  return (
    <div className="flex justify-center">
      <div
        className={cn('rounded-xl overflow-hidden border bg-card transition-all', frameClass)}
        style={{ boxShadow: '0 24px 48px -16px rgb(0 0 0 / 0.25)' }}
      >
        {channel === 'chat' && <ChatPreview a={appearance} />}
        {channel === 'form' && <FormPreview a={appearance} />}
        {channel === 'widget' && <WidgetPreview a={appearance} />}
        {channel === 'quiz' && <QuizPreview a={appearance} />}
      </div>
    </div>
  );
}

// ===================== CHAT =====================

type ChatMsg = { id: string; side: 'bot' | 'user'; text: string };

const DEMO_REPLIES = [
  'Perfeito! Pode me contar um pouco mais sobre o que você procura?',
  'Anotado. Quer que eu já te mostre os próximos passos?',
  'Ótimo! Posso te enviar agora mesmo um link com mais detalhes.',
  'Entendi 👍 Você prefere falar por aqui ou agendar uma call?',
];

function ChatPreview({ a }: { a: ChannelAppearance }) {
  const opts = a.channel_options as ChatChannelOptions;
  const bubbleRadius = opts.bubble_style === 'squared' ? 4 : opts.bubble_style === 'bubble' ? 24 : 14;

  const headerBg = opts.header_gradient
    ? `linear-gradient(135deg, ${a.primary_color}, ${a.secondary_color})`
    : a.primary_color;

  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'm1', side: 'bot', text: `Olá! Sou o ${a.bot_name || 'assistente'}. Como posso ajudar você hoje?` },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const replyIdx = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { id: crypto.randomUUID(), side: 'user', text }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const reply = DEMO_REPLIES[replyIdx.current % DEMO_REPLIES.length];
      replyIdx.current += 1;
      setMessages(prev => [...prev, { id: crypto.randomUUID(), side: 'bot', text: reply }]);
      setTyping(false);
    }, 700);
  };

  return (
    <div className="h-full flex flex-col" style={applyAppearance(a)}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 text-white shrink-0"
        style={{ background: headerBg }}
      >
        {a.avatar_enabled && (
          a.avatar_url ? (
            <img
              src={a.avatar_url}
              alt=""
              className={cn('h-9 w-9 object-cover', a.avatar_shape === 'circle' ? 'rounded-full' : 'rounded-md')}
            />
          ) : (
            <div className={cn('h-9 w-9 bg-white/20 flex items-center justify-center', a.avatar_shape === 'circle' ? 'rounded-full' : 'rounded-md')}>
              <Bot className="h-5 w-5" />
            </div>
          )
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{a.bot_name || 'Assistente'}</p>
          {a.show_online_status && (
            <p className="text-[11px] opacity-80 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> online
            </p>
          )}
        </div>
        {a.logo_url && a.logo_position !== 'center' && (
          <img src={a.logo_url} alt="logo" className="h-6 object-contain" />
        )}
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-auto px-3 py-4 space-y-3" style={{ gap: 'var(--fa-gap)' }}>
        {messages.map(m => (
          <Bubble
            key={m.id}
            side={m.side}
            radius={bubbleRadius}
            color={m.side === 'bot' ? opts.bot_bubble_color : opts.user_bubble_color}
            text={pickContrast(m.side === 'bot' ? opts.bot_bubble_color : opts.user_bubble_color)}
          >
            {m.text}
          </Bubble>
        ))}
        {(typing || opts.show_typing) && (
          <div className="flex gap-1.5 items-center pl-2">
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: a.primary_color }} />
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: a.primary_color, animationDelay: '120ms' }} />
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: a.primary_color, animationDelay: '240ms' }} />
          </div>
        )}
      </div>

      {/* Input — interativo */}
      <div className="px-3 py-2 border-t bg-white/40 backdrop-blur-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2 px-3 py-2 bg-white"
          style={{ borderRadius: a.border_radius, boxShadow: shadowToCss(a.shadow) }}
        >
          <Smile className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={opts.input_placeholder || 'Mensagem'}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            style={{ color: a.text_color }}
          />
          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
          <button
            type="submit"
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95"
            style={{ background: a.primary_color, color: pickContrast(a.primary_color) }}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ side, radius, color, text, children }: { side: 'bot' | 'user'; radius: number; color: string; text: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex', side === 'user' && 'justify-end')}>
      <div
        className="max-w-[80%] px-3 py-2 text-sm"
        style={{
          background: color,
          color: text,
          borderRadius: radius,
          borderBottomLeftRadius: side === 'bot' ? 4 : radius,
          borderBottomRightRadius: side === 'user' ? 4 : radius,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ===================== FORM =====================

function FormPreview({ a }: { a: ChannelAppearance }) {
  const opts = a.channel_options as FormChannelOptions;
  const inputCls = opts.input_style === 'filled'
    ? 'bg-black/5 border-0'
    : opts.input_style === 'underline'
    ? 'bg-transparent border-0 border-b-2 rounded-none px-0'
    : 'border bg-white';
  const btnStyle: React.CSSProperties = opts.button_style === 'filled'
    ? { background: a.primary_color, color: pickContrast(a.primary_color) }
    : opts.button_style === 'outlined'
    ? { background: 'transparent', color: a.primary_color, border: `2px solid ${a.primary_color}` }
    : { background: 'transparent', color: a.primary_color };

  return (
    <div className="h-full overflow-auto" style={applyAppearance(a)}>
      <div className={cn('mx-auto h-full flex flex-col', opts.alignment === 'left' ? 'items-start' : 'items-center')}
        style={{ maxWidth: opts.max_width, padding: 'var(--fa-padding)' }}>
        {a.logo_url && (
          <img src={a.logo_url} alt="logo" className={cn('h-10 object-contain mb-4', opts.alignment === 'center' && 'mx-auto')} />
        )}

        {opts.show_progress && (
          <div className="w-full h-1.5 bg-black/10 rounded-full mb-6 overflow-hidden">
            <div className="h-full" style={{ width: '40%', background: a.primary_color }} />
          </div>
        )}

        <div className="w-full" style={{ background: 'rgba(255,255,255,0.7)', borderRadius: a.border_radius, boxShadow: shadowToCss(a.shadow), padding: 'var(--fa-padding)' }}>
          <h2 className="font-bold mb-1" style={{ fontSize: a.font_size_base * 1.5 }}>Vamos começar</h2>
          <p className="text-sm opacity-70 mb-5">Pergunta 2 de 5</p>

          <label className="text-sm font-medium block mb-1.5">Qual seu nome?</label>
          <input
            className={cn('w-full px-3 py-2.5 mb-4 outline-none', inputCls)}
            style={{ borderRadius: opts.input_style === 'underline' ? 0 : a.border_radius * 0.6, borderColor: a.primary_color }}
            placeholder="João da Silva"
            readOnly
          />

          <label className="text-sm font-medium block mb-1.5">Seu e-mail</label>
          <input
            className={cn('w-full px-3 py-2.5 mb-5 outline-none', inputCls)}
            style={{ borderRadius: opts.input_style === 'underline' ? 0 : a.border_radius * 0.6, borderColor: a.primary_color }}
            placeholder="voce@email.com"
            readOnly
          />

          <button
            className="w-full py-2.5 font-semibold flex items-center justify-center gap-1.5"
            style={{ ...btnStyle, borderRadius: a.border_radius * 0.6 }}
          >
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== WIDGET =====================

function WidgetPreview({ a }: { a: ChannelAppearance }) {
  const opts = a.channel_options as WidgetChannelOptions;
  const fabSize = opts.fab_size === 'sm' ? 48 : opts.fab_size === 'lg' ? 72 : 60;
  const pos = opts.position;

  return (
    <div className="relative h-full bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Mock site bg */}
      <div className="absolute inset-0 p-6">
        <div className="h-3 w-1/3 bg-slate-300 rounded mb-3" />
        <div className="h-2 w-2/3 bg-slate-300 rounded mb-2" />
        <div className="h-2 w-1/2 bg-slate-300 rounded mb-6" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="aspect-video bg-slate-300 rounded" />)}
        </div>
      </div>

      {/* Callout + FAB */}
      <div
        className={cn(
          'absolute flex items-end gap-2',
          pos.includes('right') ? 'right-4 flex-row' : 'left-4 flex-row-reverse',
          pos.includes('bottom') ? 'bottom-4' : 'top-4',
        )}
      >
        {opts.callout_text && (
          <div
            className="px-3 py-2 text-sm shadow-lg mb-1"
            style={{
              background: '#fff',
              color: a.text_color,
              borderRadius: a.border_radius,
              fontFamily: `${a.font_family}, system-ui, sans-serif`,
            }}
          >
            {opts.callout_text}
          </div>
        )}
        <button
          className="relative flex items-center justify-center text-white shadow-2xl transition-transform hover:scale-105"
          style={{
            width: fabSize,
            height: fabSize,
            borderRadius: '999px',
            background: `linear-gradient(135deg, ${a.primary_color}, ${a.secondary_color})`,
          }}
        >
          <MessageCircle className="h-6 w-6" />
          {opts.show_notification_badge && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              1
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ===================== QUIZ =====================

function QuizPreview({ a }: { a: ChannelAppearance }) {
  const opts = a.channel_options as QuizChannelOptions;

  return (
    <div className="h-full overflow-auto" style={applyAppearance(a)}>
      <div className="max-w-[640px] mx-auto h-full flex flex-col p-6">
        {a.logo_url && <img src={a.logo_url} alt="" className="h-10 mx-auto mb-4 object-contain" />}

        {opts.show_counter && (
          <p className="text-xs uppercase tracking-wider opacity-70 text-center mb-2">Pergunta 3 de 7</p>
        )}

        <div className="h-1.5 bg-white/15 rounded-full mb-8 overflow-hidden">
          <div className="h-full transition-all" style={{ width: '43%', background: a.primary_color }} />
        </div>

        <h2 className="font-bold text-center mb-8" style={{ fontSize: a.font_size_base * 1.75 }}>
          Qual é o seu maior desafio hoje?
        </h2>

        <div
          className={cn('grid gap-3', opts.option_columns === 1 ? 'grid-cols-1' : opts.option_columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}
        >
          {['Aumentar vendas', 'Gerar mais leads', 'Reter clientes', 'Automatizar processos'].map((opt, i) => (
            <button
              key={i}
              className="text-left p-4 hover:scale-[1.02] transition-transform"
              style={{
                background: i === 1 ? a.primary_color : 'rgba(255,255,255,0.08)',
                color: i === 1 ? pickContrast(a.primary_color) : a.text_color,
                borderRadius: a.border_radius,
                boxShadow: shadowToCss(a.shadow),
                border: `1.5px solid ${i === 1 ? a.primary_color : 'rgba(255,255,255,0.12)'}`,
              }}
            >
              <div className="text-xs opacity-70 mb-1">{String.fromCharCode(65 + i)}</div>
              <div className="font-medium">{opt}</div>
              {i === 1 && <CheckCircle2 className="h-4 w-4 mt-2" />}
            </button>
          ))}
        </div>

        <button
          className="mt-auto w-full py-3 font-semibold mt-8"
          style={{ background: a.primary_color, color: pickContrast(a.primary_color), borderRadius: a.border_radius }}
        >
          Próxima pergunta
        </button>
      </div>
    </div>
  );
}
