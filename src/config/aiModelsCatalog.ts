// Catálogo de modelos disponíveis por provedor.
// Atualizar aqui sempre que sair uma versão nova.
// Última atualização: 2025-04

import type { AIProvider, AICapability } from '@/hooks/useAIRouting';

export type ModelTag = 'recommended' | 'cheapest' | 'most_powerful' | 'fastest' | 'new' | 'vision' | 'audio';

export interface AIModelInfo {
  id: string;            // identificador da API
  label: string;         // nome amigável
  description: string;   // 1 linha explicando para o usuário
  tags: ModelTag[];
  // capacidades suportadas (filtra a lista por capability)
  supports: AICapability[];
}

export const TAG_LABELS: Record<ModelTag, { label: string; className: string }> = {
  recommended:    { label: 'Recomendado', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  cheapest:       { label: 'Mais barato', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  most_powerful:  { label: 'Mais potente', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  fastest:        { label: 'Mais rápido', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  new:            { label: 'Novo', className: 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20' },
  vision:         { label: 'Visão', className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' },
  audio:          { label: 'Áudio', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20' },
};

const ALL_TEXT_CAPS: AICapability[] = [
  'agent_chat', 'sales_copilot', 'image_vision', 'content_generation', 'analysis_insights',
];

export const MODELS_BY_PROVIDER: Record<AIProvider, AIModelInfo[]> = {
  // ---------------- LOVABLE AI (gateway) ----------------
  lovable: [
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', description: 'Próxima geração — rápido e equilibrado', tags: ['recommended', 'new', 'fastest', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', description: 'Topo de linha — raciocínio profundo', tags: ['most_powerful', 'new', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Estável — multimodal e contexto grande', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Bom custo-benefício — multimodal', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: 'Mais barato e rápido — tarefas simples', tags: ['cheapest', 'fastest'], supports: ALL_TEXT_CAPS },
    { id: 'openai/gpt-5.2', label: 'GPT-5.2 (via Lovable)', description: 'OpenAI mais recente — raciocínio máximo', tags: ['most_powerful', 'new', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'openai/gpt-5', label: 'GPT-5 (via Lovable)', description: 'Excelente em tudo — preciso e nuançado', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini (via Lovable)', description: 'Equilíbrio entre custo e qualidade', tags: [], supports: ALL_TEXT_CAPS },
    { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano (via Lovable)', description: 'Mais barato da família GPT-5', tags: ['cheapest'], supports: ALL_TEXT_CAPS },
  ],

  // ---------------- OPENAI ----------------
  openai: [
    // Última geração 2025
    { id: 'gpt-5.2', label: 'GPT-5.2', description: 'Mais recente — raciocínio top de linha', tags: ['most_powerful', 'new', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'gpt-5', label: 'GPT-5', description: 'Carro-chefe — multimodal completo', tags: ['recommended', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Custo intermediário — boa para volume', tags: [], supports: ALL_TEXT_CAPS },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano', description: 'Mais barato — para tarefas simples e em massa', tags: ['cheapest', 'fastest'], supports: ALL_TEXT_CAPS },
    // Geração 4o ainda muito usada
    { id: 'gpt-4o', label: 'GPT-4o', description: 'Multimodal estável — visão e áudio', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Barato e ótimo para chat de WhatsApp', tags: [], supports: ALL_TEXT_CAPS },
    // Áudio
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', description: 'Transcrição mais recente — melhor que Whisper', tags: ['recommended', 'new', 'audio'], supports: ['audio_transcription'] },
    { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe', description: 'Transcrição rápida e barata', tags: ['cheapest', 'fastest', 'audio'], supports: ['audio_transcription'] },
    { id: 'whisper-1', label: 'Whisper 1', description: 'Clássico — robusto para vários idiomas', tags: ['audio'], supports: ['audio_transcription'] },
    // Embeddings
    { id: 'text-embedding-3-large', label: 'Text Embedding 3 Large', description: 'Maior precisão — busca semântica avançada', tags: ['most_powerful'], supports: ['embeddings'] },
    { id: 'text-embedding-3-small', label: 'Text Embedding 3 Small', description: 'Padrão — bom custo-benefício', tags: ['recommended', 'cheapest'], supports: ['embeddings'] },
  ],

  // ---------------- ANTHROPIC (Claude) ----------------
  anthropic: [
    // Última geração 2025
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Mais recente — melhor para código e agentes', tags: ['recommended', 'new', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', description: 'Topo de linha — raciocínio profundo', tags: ['most_powerful', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'claude-opus-4', label: 'Claude Opus 4', description: 'Modelo mais poderoso da família 4', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', description: 'Equilíbrio entre qualidade e custo', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Mais rápido e barato da Anthropic', tags: ['cheapest', 'fastest', 'new'], supports: ALL_TEXT_CAPS },
    // Geração 3.5 ainda comum
    { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', description: 'Estável — ótimo para conversas longas', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', description: 'Geração anterior — rápido e econômico', tags: [], supports: ALL_TEXT_CAPS },
  ],

  // ---------------- GOOGLE GEMINI (direto) ----------------
  gemini: [
    // Última geração
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', description: 'Mais recente — raciocínio máximo', tags: ['most_powerful', 'new', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', description: 'Próxima geração — rápido e equilibrado', tags: ['recommended', 'new', 'fastest', 'vision'], supports: ALL_TEXT_CAPS },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Estável — contexto grande e visão', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Custo-benefício multimodal', tags: ['vision'], supports: ALL_TEXT_CAPS },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: 'Mais barato — tarefas simples', tags: ['cheapest', 'fastest'], supports: ALL_TEXT_CAPS },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Geração 2.0 — estável', tags: [], supports: ALL_TEXT_CAPS },
    // Embeddings
    { id: 'text-embedding-004', label: 'Text Embedding 004', description: 'Embeddings da Google — bom custo', tags: ['recommended'], supports: ['embeddings'] },
  ],
};

export function getModelsForCapability(provider: AIProvider, capability: AICapability): AIModelInfo[] {
  return MODELS_BY_PROVIDER[provider].filter((m) => m.supports.includes(capability));
}

export function getDefaultModel(provider: AIProvider, capability: AICapability): string | undefined {
  const models = getModelsForCapability(provider, capability);
  return models.find((m) => m.tags.includes('recommended'))?.id ?? models[0]?.id;
}
