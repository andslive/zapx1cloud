// Types for Vendus Forms - Lead Capture Engine

export type FormStatus = 'draft' | 'active' | 'paused' | 'archived';
export type DistributionRule = 'manual' | 'round_robin' | 'squad' | 'user';
export type FormBlockType = 
  | 'text' | 'email' | 'phone' | 'number' | 'textarea'
  | 'select' | 'multi_select' | 'yes_no' | 'scale'
  | 'conditional' | 'score' | 'tag' | 'hidden_field'
  | 'ai_question' | 'ai_followup'
  | 'welcome_screen' | 'end_screen';

export type TemplateCategory = 'general' | 'qualification' | 'diagnostic' | 'pre_sale' | 'feedback' | 'survey';

export interface FormTheme {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  border_radius: string;
  button_style: 'filled' | 'outlined' | 'text';
  logo_url: string | null;
  show_progress: boolean;
  redirect_url: string | null;
}

export interface FormSettings {
  show_branding: boolean;
  allow_multiple_submissions: boolean;
  notify_on_submission: boolean;
  auto_create_lead: boolean;
}

export interface RoundRobinConfig {
  users: string[];
  current_index: number;
}

export interface CustomScripts {
  header: string;
  footer: string;
}

export interface ScoreRule {
  value?: string | boolean | number;
  min?: number;
  max?: number;
  score: number;
}

export interface LogicRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number | boolean;
  action: 'show' | 'hide' | 'skip_to';
  target_block_id?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ScaleOptions {
  min: number;
  max: number;
  min_label?: string;
  max_label?: string;
}

export interface FormBlock {
  id: string;
  form_id: string;
  order_index: number;
  block_type: FormBlockType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options: SelectOption[] | ScaleOptions;
  logic_rules: LogicRule[];
  maps_to?: string;
  score_value: number;
  score_rules: ScoreRule[];
  apply_tags: string[];
  validation: Record<string, unknown>;
  block_settings: Record<string, unknown>;
  created_at?: string;
}

export interface Form {
  id: string;
  organization_id: string;
  product_id: string;
  name: string;
  description?: string;
  slug: string;
  status: FormStatus;
  distribution_rule: DistributionRule;
  assigned_squad_id?: string;
  assigned_user_id?: string;
  default_temperature: string;
  round_robin_config: RoundRobinConfig;
  theme: FormTheme;
  facebook_pixel_id?: string;
  google_tag_id?: string;
  custom_scripts: CustomScripts;
  utm_capture: boolean;
  settings: FormSettings;
  created_by?: string;
  created_at: string;
  updated_at: string;
  views_count: number;
  submissions_count: number;
  // Joined data
  products?: { name: string };
}

export interface FormSubmission {
  id: string;
  form_id: string;
  lead_id?: string;
  responses: Record<string, unknown>;
  total_score: number;
  tags: string[];
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer_url?: string;
  landing_page?: string;
  user_agent?: string;
  ip_address?: string;
  geo_country?: string;
  geo_city?: string;
  status: 'started' | 'abandoned' | 'completed';
  started_at: string;
  completed_at?: string;
  step_analytics: StepAnalytic[];
  time_spent_seconds: number;
  created_at: string;
}

export interface StepAnalytic {
  block_id: string;
  viewed_at: string;
  answered_at?: string;
  time_spent_ms: number;
}

export interface FormTemplate {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  thumbnail_url?: string;
  blocks: Partial<FormBlock>[];
  theme: Partial<FormTheme>;
  settings: Partial<FormSettings>;
  is_public: boolean;
  is_system: boolean;
  usage_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Block configuration for the palette
export interface BlockConfig {
  type: FormBlockType;
  label: string;
  icon: string;
  category: 'input' | 'selection' | 'logic' | 'advanced' | 'screen';
  defaultProps: Partial<FormBlock>;
}

export const BLOCK_CONFIGS: BlockConfig[] = [
  // Screens
  { type: 'welcome_screen', label: 'Tela de Boas-vindas', icon: 'Hand', category: 'screen', defaultProps: { label: 'Bem-vindo!', description: 'Responda algumas perguntas rápidas.' } },
  { type: 'end_screen', label: 'Tela Final', icon: 'CheckCircle', category: 'screen', defaultProps: { label: 'Obrigado!', description: 'Entraremos em contato em breve.' } },
  
  // Inputs
  { type: 'text', label: 'Texto Curto', icon: 'Type', category: 'input', defaultProps: { label: 'Qual é o seu nome?', placeholder: 'Digite aqui...', maps_to: 'name' } },
  { type: 'email', label: 'Email', icon: 'Mail', category: 'input', defaultProps: { label: 'Qual é o seu email?', placeholder: 'seu@email.com', maps_to: 'email', required: true } },
  { type: 'phone', label: 'Telefone', icon: 'Phone', category: 'input', defaultProps: { label: 'Qual é o seu telefone?', placeholder: '(00) 00000-0000', maps_to: 'phone' } },
  { type: 'number', label: 'Número', icon: 'Hash', category: 'input', defaultProps: { label: 'Quantos funcionários?', placeholder: '0' } },
  { type: 'textarea', label: 'Texto Longo', icon: 'AlignLeft', category: 'input', defaultProps: { label: 'Conte-nos mais sobre sua necessidade', placeholder: 'Descreva aqui...', maps_to: 'notes' } },
  
  // Selection
  { type: 'select', label: 'Seleção Única', icon: 'List', category: 'selection', defaultProps: { label: 'Escolha uma opção', options: [{ value: 'option1', label: 'Opção 1' }, { value: 'option2', label: 'Opção 2' }] } },
  { type: 'multi_select', label: 'Seleção Múltipla', icon: 'ListChecks', category: 'selection', defaultProps: { label: 'Selecione as opções', options: [{ value: 'option1', label: 'Opção 1' }, { value: 'option2', label: 'Opção 2' }] } },
  { type: 'yes_no', label: 'Sim ou Não', icon: 'ToggleLeft', category: 'selection', defaultProps: { label: 'Você tem interesse?' } },
  { type: 'scale', label: 'Escala', icon: 'SlidersHorizontal', category: 'selection', defaultProps: { label: 'De 1 a 10, como avalia?', options: { min: 1, max: 10 } } },
  
  // Logic
  { type: 'conditional', label: 'Condicional', icon: 'GitBranch', category: 'logic', defaultProps: { label: 'Condição' } },
  { type: 'score', label: 'Pontuação', icon: 'Target', category: 'logic', defaultProps: { label: 'Adicionar Score', score_value: 10 } },
  { type: 'tag', label: 'Tag', icon: 'Tag', category: 'logic', defaultProps: { label: 'Adicionar Tag', apply_tags: ['qualificado'] } },
  { type: 'hidden_field', label: 'Campo Oculto', icon: 'EyeOff', category: 'logic', defaultProps: { label: 'UTM Source', maps_to: 'utm_source' } },
  
  // Advanced
  { type: 'ai_question', label: 'Pergunta IA', icon: 'Sparkles', category: 'advanced', defaultProps: { label: 'Pergunta adaptativa da IA' } },
  { type: 'ai_followup', label: 'Follow-up IA', icon: 'MessageSquarePlus', category: 'advanced', defaultProps: { label: 'Pergunta de acompanhamento' } },
];

// Helper to get block config
export function getBlockConfig(type: FormBlockType): BlockConfig | undefined {
  return BLOCK_CONFIGS.find(b => b.type === type);
}

// Helper to create a new block
export function createFormBlock(type: FormBlockType, formId: string, orderIndex: number): FormBlock {
  const config = getBlockConfig(type);
  return {
    id: crypto.randomUUID(),
    form_id: formId,
    order_index: orderIndex,
    block_type: type,
    label: config?.defaultProps.label || 'Nova Pergunta',
    description: config?.defaultProps.description,
    placeholder: config?.defaultProps.placeholder,
    required: config?.defaultProps.required || false,
    options: config?.defaultProps.options || [],
    logic_rules: [],
    maps_to: config?.defaultProps.maps_to,
    score_value: config?.defaultProps.score_value || 0,
    score_rules: [],
    apply_tags: config?.defaultProps.apply_tags || [],
    validation: {},
    block_settings: {},
  };
}

// Generate slug from name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
