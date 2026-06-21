import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, CheckCircle2, ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { useFunnelBySlug } from '@/hooks/useFunnels';
import { supabase } from '@/integrations/supabase/client';
import { FunnelBlock, VARIABLE_TO_LEAD_FIELD, getChannelAppearance } from '@/types/funnel';
import DOMPurify from 'dompurify';
import { ensureFontLoaded } from '@/lib/funnelAppearance';

// ── Helpers ──

function getOrderedBlocks(funnel: any): FunnelBlock[] {
  if (!funnel?.flow_blocks || funnel.flow_blocks.length === 0) return [];
  const blocks = funnel.flow_blocks as FunnelBlock[];

  let startBlock = blocks.find(b => b.id === funnel.start_block_id);
  if (!startBlock) {
    const targetedIds = new Set(
      blocks.flatMap(b => [
        b.next_block_id,
        b.data.true_next_block_id,
        b.data.false_next_block_id,
        ...(b.data.options?.map(o => o.next_block_id) || []),
        ...(b.data.ai_outputs?.map(o => o.next_block_id) || []),
      ].filter(Boolean))
    );
    startBlock = blocks.find(b => !targetedIds.has(b.id));
  }
  if (!startBlock) {
    const sorted = [...blocks].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    startBlock = sorted[0];
  }
  if (!startBlock) return [];

  const ordered: FunnelBlock[] = [];
  const visited = new Set<string>();
  let current: FunnelBlock | undefined = startBlock;
  while (current && !visited.has(current.id) && ordered.length < blocks.length + 10) {
    ordered.push(current);
    visited.add(current.id);
    if (current.next_block_id) {
      current = blocks.find(b => b.id === current!.next_block_id);
    } else {
      break;
    }
  }
  return ordered;
}

// Only visible blocks count as "steps" for progress
const VISIBLE_BLOCK_TYPES = new Set(['message', 'input', 'buttons', 'video', 'image', 'link', 'quick_form', 'end']);
// Webhook is NOT transparent: it triggers an HTTP call. Other invisible blocks pass through silently.
const TRANSPARENT_BLOCK_TYPES = new Set(['score', 'tag', 'condition', 'delay', 'create_lead', 'update_lead', 'ab_test', 'crm_sync', 'ai_qualify', 'ai_summarize', 'agent_switch']);

// ── Component ──

export default function PublicFunnel() {
  const { slug } = useParams<{ slug: string }>();
  const { data: funnel, isLoading, error } = useFunnelBySlug(slug, 'form');

  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const responsesRef = useRef<Record<string, string>>({});

  const allBlocks = useMemo(() => (funnel?.flow_blocks as FunnelBlock[]) || [], [funnel]);
  const orderedBlocks = useMemo(() => funnel ? getOrderedBlocks(funnel) : [], [funnel]);
  const visibleBlocks = useMemo(() => orderedBlocks.filter(b => VISIBLE_BLOCK_TYPES.has(b.type)), [orderedBlocks]);
  const currentBlock = useMemo(() => allBlocks.find(b => b.id === currentBlockId), [allBlocks, currentBlockId]);
  const currentVisibleIndex = currentBlock ? visibleBlocks.findIndex(b => b.id === currentBlock.id) : 0;
  const progress = visibleBlocks.length > 0 ? ((currentVisibleIndex + 1) / visibleBlocks.length) * 100 : 0;

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  // Aparência efetiva: usa appearance.form se existir, fallback para theme legado
  const appearance = useMemo(
    () => (funnel ? getChannelAppearance(funnel as any, 'form') : null),
    [funnel]
  );
  const theme = funnel?.theme;
  const primaryColor = appearance?.primary_color || theme?.primary_color || '#00C48C';
  const bgColor = appearance?.background_color || theme?.background_color || '#080F0E';
  const textColor = appearance?.text_color || theme?.text_color || '#FFFFFF';
  const fontFamily = appearance?.font_family || theme?.font_family || 'Inter';
  const borderRadius = appearance?.border_radius ?? 12;
  const logoUrl = appearance?.logo_url || theme?.logo_url || null;

  useEffect(() => {
    if (fontFamily) ensureFontLoaded(fontFamily);
  }, [fontFamily]);

  // Derived colors
  const cardBg = adjustBrightness(bgColor, 12);
  const cardBg2 = adjustBrightness(bgColor, 18);
  const borderColor = adjustBrightness(bgColor, 25);
  const mutedColor = adjustOpacity(textColor, 0.55);

  // Track views
  useEffect(() => {
    if (funnel?.id) {
      supabase.rpc('increment_funnel_views', { p_funnel_id: funnel.id, p_channel: 'landing' });
    }
  }, [funnel?.id]);

  // Start on first block
  useEffect(() => {
    if (orderedBlocks.length > 0 && !currentBlockId) {
      advanceToBlock(orderedBlocks[0].id);
    }
  }, [orderedBlocks]);

  const advanceToBlock = useCallback(async (blockId: string, runtimeResponses?: Record<string, string>) => {
    const block = allBlocks.find(b => b.id === blockId);
    if (!block) return;
    const latestResponses = runtimeResponses || responsesRef.current;

    // Webhook block: fire HTTP call (silently) when trigger is on_block, then advance
    if (block.type === 'webhook') {
      const cfg = block.data.webhook_config;
      const isOnBlock = !cfg?.trigger || cfg.trigger === 'on_block';
      if (cfg?.url && isOnBlock && funnel?.id) {
        try {
          const collectedData: Record<string, string> = {};
          for (const [key, value] of Object.entries(latestResponses)) {
            const lf = VARIABLE_TO_LEAD_FIELD[key.toLowerCase()] || key;
            collectedData[lf] = value;
          }
          const urlParams = new URLSearchParams(window.location.search);
          const tracking = {
            utm_source: urlParams.get('utm_source') || undefined,
            utm_medium: urlParams.get('utm_medium') || undefined,
            utm_campaign: urlParams.get('utm_campaign') || undefined,
            utm_term: urlParams.get('utm_term') || undefined,
            utm_content: urlParams.get('utm_content') || undefined,
            referrer_url: document.referrer || undefined,
            landing_page: window.location.href,
          };
          const promise = supabase.functions.invoke('funnel-execute-webhook', {
            body: {
              funnel_id: funnel.id,
              block_id: block.id,
              collected_data: collectedData,
              responses: latestResponses,
              tracking,
              trigger_source: 'on_block',
            },
          });
          if (cfg.wait_for_response) {
            const { error } = await promise;
            if (error) throw error;
          } else {
            promise.then(({ error }) => {
              if (error) console.error('[funnel] webhook error:', error);
            });
          }
        } catch (err) {
          console.error('[funnel] webhook error:', err);
        }
      }
      const nextId = block.next_block_id;
      if (nextId) advanceToBlock(nextId, latestResponses);
      return;
    }

    // Transparent blocks: execute and skip
    if (TRANSPARENT_BLOCK_TYPES.has(block.type)) {
      const nextId = block.next_block_id;
      if (nextId) {
        advanceToBlock(nextId, latestResponses);
      }
      return;
    }

    setCurrentBlockId(blockId);
  }, [allBlocks, funnel?.id]);

  const goNext = useCallback((nextBlockId?: string | null, runtimeResponses?: Record<string, string>) => {
    if (!currentBlock) return;
    setHistory(prev => [...prev, currentBlock.id]);
    const targetId = nextBlockId || currentBlock.next_block_id;
    if (targetId) {
      advanceToBlock(targetId, runtimeResponses);
    }
  }, [currentBlock, advanceToBlock]);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const prevId = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCurrentBlockId(prevId);
  }, [history]);

  const handleInputSubmit = () => {
    if (!inputValue.trim() || !currentBlock) return;
    const varName = currentBlock.data.variable_name || currentBlock.id;
    const nextResponses = { ...responsesRef.current, [varName]: inputValue };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;
    setInputValue('');
    goNext(undefined, nextResponses);
  };

  const handleButtonSelect = (option: { id: string; label: string; next_block_id?: string | null }) => {
    if (!currentBlock) return;
    const varName = currentBlock.data.variable_name || currentBlock.id;
    const nextResponses = { ...responsesRef.current, [varName]: option.label };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;
    goNext(option.next_block_id, nextResponses);
  };

  const handleQuickFormSubmit = () => {
    if (!currentBlock?.data.form_fields) return;
    const newResponses = { ...responsesRef.current };
    for (const field of currentBlock.data.form_fields) {
      if (formValues[field.id]) {
        newResponses[field.variable] = formValues[field.id];
      }
    }
    setResponses(newResponses);
    responsesRef.current = newResponses;
    setFormValues({});
    goNext(undefined, newResponses);
  };

  const handleEnd = async () => {
    if (isComplete) return;
    setIsComplete(true);
    await submitLead();
  };

  // Auto-trigger submit on end block
  useEffect(() => {
    if (currentBlock?.type === 'end' && !isComplete) {
      handleEnd();
    }
  }, [currentBlock]);

  const submitLead = async () => {
    if (isSubmitting || !funnel) return;
    setIsSubmitting(true);
    try {
      const collectedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(responses)) {
        const leadField = VARIABLE_TO_LEAD_FIELD[key.toLowerCase()] || key;
        collectedData[leadField] = value;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const tracking = {
        utm_source: urlParams.get('utm_source') || undefined,
        utm_medium: urlParams.get('utm_medium') || undefined,
        utm_campaign: urlParams.get('utm_campaign') || undefined,
        utm_term: urlParams.get('utm_term') || undefined,
        utm_content: urlParams.get('utm_content') || undefined,
        referrer_url: document.referrer || undefined,
        landing_page: window.location.href,
        user_agent: navigator.userAgent,
      };

      await supabase.functions.invoke('funnel-submit', {
        body: {
          funnel_id: funnel.id,
          channel: 'landing',
          responses,
          collected_data: collectedData,
          tracking,
        },
      });
    } catch (err) {
      console.error('Error submitting lead:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / Error ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bgColor }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (error || !funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bgColor }}>
        <div className="text-center px-6">
          <h1 className="text-xl font-semibold mb-2" style={{ color: textColor }}>Página não encontrada</h1>
          <p style={{ color: mutedColor }}>Este link pode estar inativo ou incorreto.</p>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${primaryColor}18 0%, transparent 70%), ${bgColor}`,
        fontFamily: `'${fontFamily}', system-ui, sans-serif`,
      }}
    >
      <div className="w-full max-w-[480px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-10 object-contain" loading="lazy" decoding="async" />

          ) : (
            <>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-lg"
                style={{ background: primaryColor, color: bgColor }}
              >
                {funnel.name?.charAt(0)?.toUpperCase() || 'B'}
              </div>
              <span className="font-bold text-xl tracking-tight" style={{ color: textColor }}>
                {funnel.products?.name || funnel.name}
              </span>
            </>
          )}
        </div>

        {/* Card */}
        <div
          className="relative overflow-hidden"
          style={{
            background: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: `${Math.max(borderRadius, 16)}px`,
            padding: '36px 32px',
          }}
        >
          {/* Top glow line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${primaryColor}66, transparent)` }}
          />

          {/* Progress bar */}
          {theme?.show_progress !== false && (
            <div className="h-[3px] rounded-full mb-7 overflow-hidden" style={{ background: borderColor }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: primaryColor }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )}

          {/* Block Content */}
          <AnimatePresence mode="wait">
            {currentBlock && (
              <motion.div
                key={currentBlock.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Back button */}
                {history.length > 0 && (
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1.5 text-sm mb-5 transition-colors"
                    style={{ color: mutedColor }}
                    onMouseEnter={e => (e.currentTarget.style.color = primaryColor)}
                    onMouseLeave={e => (e.currentTarget.style.color = mutedColor)}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar
                  </button>
                )}

                {/* ── Message Block ── */}
                {currentBlock.type === 'message' && (
                  <div>
                    <h1
                      className="text-[26px] font-extrabold leading-tight tracking-tight mb-3"
                      style={{ color: textColor }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatContent(currentBlock.data.content || '')) }}
                    />
                    <div className="mt-7">
                      <button
                        onClick={() => goNext()}
                        className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                        style={{
                          background: primaryColor,
                          color: bgColor,
                          boxShadow: `0 8px 24px ${primaryColor}4D`,
                        }}
                      >
                        Continuar <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Input Block ── */}
                {currentBlock.type === 'input' && (
                  <div>
                    <div
                      className="text-xs font-semibold tracking-widest uppercase mb-2.5"
                      style={{ color: primaryColor }}
                    >
                      {getInputTypeLabel(currentBlock.data.input_type)}
                    </div>
                    <h1
                      className="text-[26px] font-extrabold leading-tight tracking-tight mb-2"
                      style={{ color: textColor }}
                    >
                      {currentBlock.data.content || currentBlock.data.placeholder || 'Sua resposta'}
                    </h1>

                    <form onSubmit={e => { e.preventDefault(); handleInputSubmit(); }} className="mt-6 space-y-4">
                      <div>
                        <label className="block text-[13px] font-medium mb-1.5" style={{ color: mutedColor }}>
                          {currentBlock.data.variable_name
                            ? capitalizeFirst(currentBlock.data.variable_name)
                            : getInputTypeLabel(currentBlock.data.input_type)}
                        </label>
                        <input
                          type={mapInputType(currentBlock.data.input_type)}
                          value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          placeholder={currentBlock.data.placeholder || ''}
                          autoFocus
                          className="w-full px-[18px] py-[14px] rounded-xl text-[15px] outline-none transition-all"
                          style={{
                            background: cardBg2,
                            border: `1px solid ${borderColor}`,
                            color: textColor,
                          }}
                          onFocus={e => {
                            e.target.style.borderColor = primaryColor;
                            e.target.style.boxShadow = `0 0 0 3px ${primaryColor}1F`;
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = borderColor;
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                        style={{
                          background: primaryColor,
                          color: bgColor,
                          boxShadow: `0 8px 24px ${primaryColor}4D`,
                        }}
                      >
                        Continuar <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                )}

                {/* ── Buttons Block ── */}
                {currentBlock.type === 'buttons' && (
                  <div>
                    <h1
                      className="text-[26px] font-extrabold leading-tight tracking-tight mb-2"
                      style={{ color: textColor }}
                    >
                      {currentBlock.data.content || 'Escolha uma opção'}
                    </h1>
                    <p className="text-sm leading-relaxed mb-7" style={{ color: mutedColor }}>
                      Escolha o que faz mais sentido pra você agora.
                    </p>

                    <div className="flex flex-col gap-3">
                      {currentBlock.data.options?.map(option => (
                        <button
                          key={option.id}
                          onClick={() => handleButtonSelect(option)}
                          className="px-5 py-[18px] rounded-2xl text-left flex items-center gap-3.5 transition-all hover:-translate-y-0.5"
                          style={{
                            background: cardBg2,
                            border: `1.5px solid ${borderColor}`,
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = primaryColor;
                            e.currentTarget.style.background = `${primaryColor}0D`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = borderColor;
                            e.currentTarget.style.background = cardBg2;
                          }}
                        >
                          {option.emoji && (
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                              style={{ background: `${primaryColor}1A` }}
                            >
                              {option.emoji}
                            </div>
                          )}
                          <div>
                            <strong className="block text-sm font-bold" style={{ color: textColor }}>
                              {option.label}
                            </strong>
                            {option.value && (
                              <span className="text-xs leading-snug" style={{ color: mutedColor }}>
                                {option.value}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Video Block ── */}
                {currentBlock.type === 'video' && (
                  <div>
                    {currentBlock.data.content && (
                      <h1
                        className="text-[26px] font-extrabold leading-tight tracking-tight mb-4"
                        style={{ color: textColor }}
                      >
                        {currentBlock.data.content}
                      </h1>
                    )}
                    <div
                      className="w-full aspect-video rounded-[14px] overflow-hidden mb-6"
                      style={{ border: `1px solid ${borderColor}`, background: '#000' }}
                    >
                      {currentBlock.data.video_type === 'custom_html' && currentBlock.data.embed_code ? (
                        <div
                          className="w-full h-full"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentBlock.data.embed_code, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src'] }) }}
                        />
                      ) : (
                        <iframe
                          src={getEmbedUrl(
                            currentBlock.data.video_url || '',
                            currentBlock.data.video_type
                          )}
                          className="w-full h-full"
                          allow="autoplay; encrypted-media; fullscreen"
                          allowFullScreen
                        />
                      )}
                    </div>
                    <button
                      onClick={() => goNext()}
                      className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                      style={{
                        background: primaryColor,
                        color: bgColor,
                        boxShadow: `0 8px 24px ${primaryColor}4D`,
                      }}
                    >
                      Continuar <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* ── Image Block ── */}
                {currentBlock.type === 'image' && (
                  <div>
                    {currentBlock.data.content && (
                      <h1
                        className="text-[26px] font-extrabold leading-tight tracking-tight mb-4"
                        style={{ color: textColor }}
                      >
                        {currentBlock.data.content}
                      </h1>
                    )}
                    {currentBlock.data.image_url && (
                      <img
                        src={currentBlock.data.image_url}
                        alt={currentBlock.data.image_alt || ''}
                        className="w-full rounded-[14px] object-cover mb-6"
                        style={{ border: `1px solid ${borderColor}` }}
                      />
                    )}
                    <button
                      onClick={() => goNext()}
                      className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                      style={{
                        background: primaryColor,
                        color: bgColor,
                        boxShadow: `0 8px 24px ${primaryColor}4D`,
                      }}
                    >
                      Continuar <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* ── Link Block ── */}
                {currentBlock.type === 'link' && (
                  <div>
                    {currentBlock.data.link_url && (
                      <a
                        href={currentBlock.data.link_url}
                        target={currentBlock.data.link_open_new_tab !== false ? '_blank' : '_self'}
                        rel="noopener noreferrer"
                        className="block px-5 py-5 rounded-2xl transition-all hover:-translate-y-0.5 mb-6"
                        style={{
                          background: cardBg2,
                          border: `1.5px solid ${borderColor}`,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = primaryColor;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = borderColor;
                        }}
                      >
                        <strong className="block text-base font-bold mb-1" style={{ color: primaryColor }}>
                          {currentBlock.data.link_title || currentBlock.data.link_url}
                        </strong>
                        {currentBlock.data.link_description && (
                          <span className="text-sm" style={{ color: mutedColor }}>
                            {currentBlock.data.link_description}
                          </span>
                        )}
                      </a>
                    )}
                    <button
                      onClick={() => goNext()}
                      className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                      style={{
                        background: primaryColor,
                        color: bgColor,
                        boxShadow: `0 8px 24px ${primaryColor}4D`,
                      }}
                    >
                      Continuar <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* ── Quick Form Block ── */}
                {currentBlock.type === 'quick_form' && (
                  <div>
                    <div
                      className="text-xs font-semibold tracking-widest uppercase mb-2.5"
                      style={{ color: primaryColor }}
                    >
                      Seus dados
                    </div>
                    <h1
                      className="text-[26px] font-extrabold leading-tight tracking-tight mb-2"
                      style={{ color: textColor }}
                    >
                      {currentBlock.data.content || 'Preencha seus dados'}
                    </h1>
                    <p className="text-sm leading-relaxed mb-7" style={{ color: mutedColor }}>
                      Campos rápidos para continuar.
                    </p>

                    <form onSubmit={e => { e.preventDefault(); handleQuickFormSubmit(); }} className="space-y-4">
                      {currentBlock.data.form_fields?.map(field => (
                        <div key={field.id}>
                          <label className="block text-[13px] font-medium mb-1.5" style={{ color: mutedColor }}>
                            {field.label}
                          </label>
                          <input
                            type={mapInputType(field.type)}
                            value={formValues[field.id] || ''}
                            onChange={e => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                            required={field.required}
                            className="w-full px-[18px] py-[14px] rounded-xl text-[15px] outline-none transition-all"
                            style={{
                              background: cardBg2,
                              border: `1px solid ${borderColor}`,
                              color: textColor,
                            }}
                            onFocus={e => {
                              e.target.style.borderColor = primaryColor;
                              e.target.style.boxShadow = `0 0 0 3px ${primaryColor}1F`;
                            }}
                            onBlur={e => {
                              e.target.style.borderColor = borderColor;
                              e.target.style.boxShadow = 'none';
                            }}
                          />
                        </div>
                      ))}
                      <button
                        type="submit"
                        className="w-full py-4 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                        style={{
                          background: primaryColor,
                          color: bgColor,
                          boxShadow: `0 8px 24px ${primaryColor}4D`,
                        }}
                      >
                        Continuar <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                )}

                {/* ── End Block ── */}
                {currentBlock.type === 'end' && (
                  <div className="text-center py-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                      style={{ background: `${primaryColor}26` }}
                    >
                      <CheckCircle2 className="h-8 w-8" style={{ color: primaryColor }} />
                    </motion.div>
                    <h1
                      className="text-[26px] font-extrabold leading-tight tracking-tight mb-3"
                      style={{ color: textColor }}
                    >
                      {currentBlock.data.success_message || 'Obrigado! 🎉'}
                    </h1>
                    {currentBlock.data.redirect_url && (
                      <a
                        href={currentBlock.data.redirect_url}
                        className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-[14px] font-bold text-[15px] transition-all hover:-translate-y-0.5"
                        style={{
                          background: primaryColor,
                          color: bgColor,
                          boxShadow: `0 8px 24px ${primaryColor}4D`,
                        }}
                      >
                        Continuar <ArrowRight className="h-4 w-4" />
                      </a>
                    )}
                    {isSubmitting && (
                      <div className="flex items-center justify-center gap-2 mt-4" style={{ color: mutedColor }}>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Salvando...</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 flex items-center justify-center gap-1.5 text-xs" style={{ color: adjustOpacity(textColor, 0.2) }}>
          <Lock className="h-3 w-3" />
          Seus dados ficam protegidos
        </div>
      </div>
    </div>
  );
}

// ── Utility functions ──

function adjustBrightness(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch {
    return hex;
  }
}

function adjustOpacity(hex: string, opacity: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    return `rgba(${r},${g},${b},${opacity})`;
  } catch {
    return hex;
  }
}

function formatContent(content: string): string {
  // Support **bold** and *accent* in content
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

function getInputTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    name: 'Seu nome',
    email: 'Seu e-mail',
    phone: 'Seu telefone',
    text: 'Pergunta',
    number: 'Número',
    cpf: 'Seu CPF',
    textarea: 'Texto',
  };
  return labels[type || 'text'] || 'Pergunta';
}

function mapInputType(type?: string): string {
  const map: Record<string, string> = {
    email: 'email',
    phone: 'tel',
    number: 'number',
    cpf: 'text',
    name: 'text',
    text: 'text',
    textarea: 'text',
  };
  return map[type || 'text'] || 'text';
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function getEmbedUrl(url: string, videoType?: string): string {
  if (videoType === 'embed') return url;
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}
