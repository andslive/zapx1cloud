// Tipos para o Flow Builder de Chat

export type FlowBlockType = 
  | 'message' 
  | 'input' 
  | 'buttons' 
  | 'ai_takeover' 
  | 'handoff' 
  | 'tag' 
  | 'video'
  | 'delay';

export type InputType = 'name' | 'phone' | 'email' | 'text' | 'number' | 'cpf';
export type ValidationRule = 'required' | 'email' | 'phone' | 'cpf' | 'none';
export type TriggerType = 'always' | 'first_visit' | 'utm_match' | 'none';
export type HandoffTarget = 'queue' | 'specific_user' | 'squad';

// Tipos de ação para botões do Flow Builder
export type ButtonActionType = 
  | 'next_block'    // Continua para próximo bloco do fluxo
  | 'url'           // Abre link externo
  | 'whatsapp'      // Abre WhatsApp com número e mensagem
  | 'handoff'       // Transfere para atendente
  | 'ai_takeover';  // IA assume a conversa

export interface FlowButton {
  id: string;
  label: string;
  emoji?: string;
  action_type: ButtonActionType;  // Tipo de ação do botão
  next_block_id: string | null;   // Usado quando action_type = 'next_block'
  url?: string;                   // Usado quando action_type = 'url'
  open_in_new_tab?: boolean;      // Abrir link em nova aba
  whatsapp_number?: string;       // Usado quando action_type = 'whatsapp'
  whatsapp_message?: string;      // Mensagem pré-definida para WhatsApp
  ai_context?: string;            // Contexto extra para IA quando action_type = 'ai_takeover'
}

export interface FlowBlockData {
  // Message block
  content?: string;
  delay_ms?: number;
  show_typing?: boolean;
  typing_duration_ms?: number;
  
  // Input block (Captura)
  input_type?: InputType;
  variable_name?: string;
  placeholder?: string;
  validation?: ValidationRule;
  error_message?: string;
  timeout_enabled?: boolean;
  timeout_value?: number;
  timeout_unit?: 'seconds' | 'minutes' | 'hours' | 'days';
  timeout_next_block_id?: string | null;
  wait_indefinitely?: boolean;
  message_buffer_enabled?: boolean;
  message_buffer_seconds?: number;
  reply_to_message?: boolean;
  react_to_message?: boolean;
  reaction_emoji?: string;
  
  // Buttons block
  buttons?: FlowButton[];
  buttons_layout?: 'vertical' | 'horizontal';
  
  // AI Takeover block
  ai_context_prompt?: string;
  transfer_variables?: boolean;
  
  // Handoff block
  handoff_message?: string;
  handoff_target?: HandoffTarget;
  handoff_user_id?: string;
  handoff_squad_id?: string;
  
  // Tag block
  tag_name?: string;
  tag_value?: string;
  
  // Video block
  video_url?: string;
  video_title?: string;
  
  // Delay block
  delay_seconds?: number;
  delay_min?: number;
  delay_max?: number;
  delay_random?: boolean;
}

export interface FlowBlockPosition {
  x: number;
  y: number;
}

export interface FlowBlock {
  id: string;
  type: FlowBlockType;
  position: FlowBlockPosition;
  data: FlowBlockData;
  next_block_id?: string | null;
}

export interface CollectedVariable {
  name: string;
  type: InputType;
  label: string;
}

export interface TriggerConditions {
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  page_path?: string;
}

export interface ChatFlow {
  id: string;
  product_id: string | null;
  organization_id: string;
  name: string;
  description?: string | null;
  blocks: FlowBlock[];
  start_block_id: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_conditions: TriggerConditions;
  collected_variables: CollectedVariable[];
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

// Para o estado da conversa
export interface FlowExecutionState {
  current_flow_id: string | null;
  current_block_id: string | null;
  flow_variables: Record<string, string>;
  flow_completed: boolean;
}

// Bloco com metadados para o editor visual
export interface FlowBlockWithMeta extends FlowBlock {
  isSelected?: boolean;
  isConnecting?: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

// Constantes
export const BLOCK_TYPES: { type: FlowBlockType; label: string; icon: string; color: string }[] = [
  { type: 'message', label: 'Mensagem', icon: 'MessageSquare', color: 'bg-blue-500' },
  { type: 'input', label: 'Captura', icon: 'FormInput', color: 'bg-green-500' },
  { type: 'buttons', label: 'Botões', icon: 'LayoutGrid', color: 'bg-purple-500' },
  { type: 'ai_takeover', label: 'IA Assume', icon: 'Bot', color: 'bg-orange-500' },
  { type: 'handoff', label: 'Atendente', icon: 'UserCheck', color: 'bg-red-500' },
  { type: 'tag', label: 'Tag', icon: 'Tag', color: 'bg-yellow-500' },
  { type: 'video', label: 'Vídeo', icon: 'Video', color: 'bg-pink-500' },
  { type: 'delay', label: 'Aguardar', icon: 'Clock', color: 'bg-gray-500' },
];

export const INPUT_TYPES: { type: InputType; label: string; placeholder: string }[] = [
  { type: 'name', label: 'Nome', placeholder: 'Digite seu nome...' },
  { type: 'phone', label: 'Telefone', placeholder: '(00) 00000-0000' },
  { type: 'email', label: 'E-mail', placeholder: 'seu@email.com' },
  { type: 'text', label: 'Texto Livre', placeholder: 'Digite aqui...' },
  { type: 'number', label: 'Número', placeholder: '0' },
  { type: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
];

export const DEFAULT_BLOCK_DATA: Record<FlowBlockType, FlowBlockData> = {
  message: { content: 'Olá! Como posso ajudar?', delay_ms: 500 },
  input: { input_type: 'name', variable_name: 'nome', placeholder: 'Digite seu nome...', validation: 'required' },
  buttons: { buttons: [], buttons_layout: 'vertical' },
  ai_takeover: { ai_context_prompt: '', transfer_variables: true },
  handoff: { handoff_message: 'Vou te transferir para um de nossos especialistas!', handoff_target: 'queue' },
  tag: { tag_name: '', tag_value: '' },
  video: { video_url: '', video_title: '' },
  delay: { delay_seconds: 5, delay_min: 5, delay_max: 16, delay_random: true },
};

// Constantes para tipos de ação de botões
export const BUTTON_ACTION_TYPES: { type: ButtonActionType; label: string; icon: string }[] = [
  { type: 'next_block', label: 'Continuar no Fluxo', icon: 'ArrowRight' },
  { type: 'url', label: 'Abrir Link', icon: 'ExternalLink' },
  { type: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' },
  { type: 'ai_takeover', label: 'IA Assume', icon: 'Bot' },
  { type: 'handoff', label: 'Transferir para Atendente', icon: 'UserCheck' },
];
