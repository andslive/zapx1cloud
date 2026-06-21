export type AgentType = 'sdr' | 'closer' | 'support' | 'financial' | 'admin' | 'orchestrator' | 'custom';
export type ToneStyle = 'formal' | 'consultive' | 'friendly' | 'technical';
export type MessageStyle = 'short' | 'balanced' | 'detailed';

export interface SupportLink {
  title: string;
  url: string;
  description?: string;
}

export interface SupportQuickAnswer {
  question: string;
  answer: string;
}

export type QuickMenuAction = 'transfer_to_agent' | 'transfer_to_human' | 'start_flow';

export interface QuickMenuOption {
  label: string;
  action: QuickMenuAction;
  target_agent_id?: string | null;
  target_flow_id?: string | null;
  human_queue?: string | null;
}

export type QuickMenuMode = 'off' | 'always' | 'fallback';

export interface AgentToolConfigs {
  allowed_tags?: string[];
  email_template_id?: string;
  email_default_subject?: string;
  allowed_material_ids?: string[];
  allowed_flow_ids?: string[];
  cadence_default_steps?: Array<{ day: number; action: string; template?: string }>;
  max_emails_per_day?: number;
  // Support agent only — populated via "📚 Suporte" tab
  support_links?: SupportLink[];
  support_quick_answers?: SupportQuickAnswer[];
  [key: string]: unknown;
}

// Type-safe version for internal use, JSON-compatible for Supabase
export type AgentToolConfigsJson = Record<string, unknown>;

export interface ProductAgent {
  id: string;
  organization_id: string;
  product_id: string | null;
  name: string;
  description?: string;
  avatar_url?: string;
  agent_type: AgentType;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  end_conversation_triggers: string[];
  tone_style: ToneStyle;
  message_style: MessageStyle;
  always_end_with_question: boolean;
  additional_prompt?: string;
  required_phrases: string[];
  prohibited_phrases: string[];
  auto_tag_leads: boolean;
  default_tags: string[];
  can_update_pipeline: boolean;
  can_create_tasks: boolean;
  can_schedule_meetings: boolean;
  // New tool permissions
  can_apply_tags: boolean;
  can_update_lead: boolean;
  can_send_emails: boolean;
  can_send_materials: boolean;
  can_trigger_flows: boolean;
  can_transfer: boolean;
  can_notify: boolean;
  can_add_notes: boolean;
  can_start_cadence: boolean;
  can_qualify: boolean;
  tool_configs: Record<string, any>;
  // Channels
  active_in_funnels: boolean;
  active_in_chat: boolean;
  active_in_widget: boolean;
  active_in_inbox: boolean;
  active_in_copilot: boolean;
  active_in_whatsapp: boolean;
  active_in_instagram: boolean;
  active_in_facebook: boolean;
  is_active: boolean;
  is_default: boolean;
  // Handoff (transfer) configuration — applied when this agent transfers to another,
  // or when this agent receives a transferred conversation.
  handoff_outgoing_message?: string | null;   // sent BEFORE handing off. Vars: {{nome}}, {{produto}}, {{proximo_agente}}
  handoff_incoming_message?: string | null;   // sent AUTO when this agent takes over. Vars: {{nome}}, {{produto}}, {{agente_anterior}}, {{resumo}}
  handoff_delay_seconds?: number;             // wait between outgoing msg and the next agent's greeting (default 4)
  message_delay_seconds?: number;             // default delay between consecutive messages from this agent (default 2)
  handoff_include_summary?: boolean;          // when true, generate {{resumo}} of prior conversation
  // Automatic activation triggers (keyword/phrase-based agent switching)
  activation_keywords?: string[];
  activation_phrases?: string[];
  activation_priority?: number;
  activation_scope?: string; // 'all' | 'whatsapp' | 'chat' | 'inbox' | 'funnel'
  takeover_on_match?: boolean;
  // Vínculo opcional com uma conexão WhatsApp específica.
  // null = atende em qualquer conexão (padrão). Preenchido = só atende mensagens
  // recebidas naquela instância Evolution.
  evolution_instance_id?: string | null;
  // Humanization config (timing, splitting, style) — see AgentHumanizationTab
  humanization?: Record<string, any> | null;
  // (Removido) ai_model: o modelo agora é gerenciado globalmente em org_ai_routing
  // (Configurações > Integrações > Roteamento de IA, capability='agent_chat').
  // === Agendamento (booking) ===
  // Anfitrião padrão cuja agenda a IA consulta e onde a reunião é criada.
  default_schedule_user_id?: string | null;
  // Tipos de evento (booking_event_types) que esse agente pode oferecer ao lead.
  allowed_event_type_ids?: string[];
  // Usuários extras que recebem notificação quando a IA confirma uma reunião.
  booking_notification_user_ids?: string[];
  // Se true, notifica todos os admins da organização ao confirmar.
  booking_notify_org_admins?: boolean;
  // Configurações exclusivas do Agente Admin Executivo (persistidas em auto_notification_settings)
  monitored_product_ids?: string[];
  // === Welcome + Quick Menu (Orquestrador) ===
  welcome_enabled?: boolean;
  welcome_message?: string | null;
  quick_menu_mode?: 'off' | 'always' | 'fallback';
  quick_menu_intro?: string | null;
  quick_menu_options?: QuickMenuOption[] | any;
  quick_menu_invalid_message?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplate {
  name: string;
  description: string;
  icon: string;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  tone_style: ToneStyle;
  message_style: MessageStyle;
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  sdr: 'SDR',
  closer: 'Closer',
  support: 'Suporte',
  financial: 'Financeiro',
  admin: 'Administrativo',
  orchestrator: 'Orquestrador',
  custom: 'Personalizado',
};

export const TONE_STYLE_LABELS: Record<ToneStyle, string> = {
  formal: 'Formal',
  consultive: 'Consultivo',
  friendly: 'Amigável',
  technical: 'Técnico',
};

export const MESSAGE_STYLE_LABELS: Record<MessageStyle, string> = {
  short: 'Curtas',
  balanced: 'Equilibradas',
  detailed: 'Detalhadas',
};

export const AGENT_TEMPLATES: Record<AgentType, AgentTemplate> = {
  sdr: {
    name: 'SDR Qualificador',
    description: 'Qualifica leads e encaminha para vendas',
    icon: '🎯',
    primary_objective: 'Qualificar leads e encaminhar para o closer quando houver interesse real',
    can_do: [
      'Fazer perguntas de qualificação',
      'Aplicar tags aos leads',
      'Avançar leads no funil',
      'Coletar informações de contato',
    ],
    cannot_do: [
      'Falar de preço fechado',
      'Fechar vendas',
      'Dar descontos',
    ],
    handoff_triggers: [
      'Lead pede para falar com humano',
      'Lead demonstra alto interesse de compra',
      'Lead tem objeções complexas',
    ],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
  closer: {
    name: 'Closer Premium',
    description: 'Fecha vendas e converte leads qualificados',
    icon: '💼',
    primary_objective: 'Fechar vendas e converter leads qualificados em clientes',
    can_do: [
      'Negociar condições',
      'Apresentar propostas',
      'Falar sobre preços e planos',
      'Enviar links de pagamento',
      'Chamar humano quando necessário',
    ],
    cannot_do: [
      'Dar descontos não autorizados',
      'Prometer prazos irreais',
    ],
    handoff_triggers: [
      'Lead solicita condições especiais',
      'Lead quer falar com gerente',
      'Negociação complexa',
    ],
    tone_style: 'consultive',
    message_style: 'detailed',
  },
  support: {
    name: 'Suporte Técnico',
    description: 'Resolve problemas e dúvidas de clientes',
    icon: '🛠️',
    primary_objective: 'Resolver problemas e dúvidas de clientes de forma eficiente',
    can_do: [
      'Responder dúvidas técnicas',
      'Abrir tickets de suporte',
      'Escalar para equipe técnica',
      'Enviar tutoriais e documentação',
    ],
    cannot_do: [
      'Vender novos produtos',
      'Negociar contratos',
      'Fazer alterações em conta',
    ],
    handoff_triggers: [
      'Problema não resolvido após 3 tentativas',
      'Cliente insatisfeito',
      'Solicitação de reembolso',
    ],
    tone_style: 'friendly',
    message_style: 'detailed',
  },
  financial: {
    name: 'Financeiro',
    description: 'Lida com cobranças e questões financeiras',
    icon: '💰',
    primary_objective: 'Lidar com questões financeiras e cobranças de forma profissional',
    can_do: [
      'Informar sobre faturas',
      'Enviar boletos e links de pagamento',
      'Explicar cobranças',
      'Informar sobre atrasos',
    ],
    cannot_do: [
      'Negociar dívidas sem autorização',
      'Cancelar contratos',
      'Fazer estornos',
    ],
    handoff_triggers: [
      'Solicitação de negociação de dívida',
      'Disputa de cobrança',
      'Cancelamento de serviço',
    ],
    tone_style: 'formal',
    message_style: 'short',
  },
  admin: {
    name: 'Administrativo',
    description: 'Auxilia em questões administrativas',
    icon: '📋',
    primary_objective: 'Auxiliar em questões administrativas e direcionamentos',
    can_do: [
      'Responder sobre processos',
      'Direcionar para áreas corretas',
      'Informar horários e contatos',
      'Agendar reuniões',
    ],
    cannot_do: [
      'Tomar decisões finais',
      'Alterar cadastros',
      'Aprovar solicitações',
    ],
    handoff_triggers: [
      'Solicitação que requer aprovação',
      'Reclamação formal',
    ],
    tone_style: 'formal',
    message_style: 'balanced',
  },
  orchestrator: {
    name: 'Orquestrador Mestre',
    description: 'Classifica produto+intenção e roteia para o especialista',
    icon: '🧭',
    primary_objective: 'Classificar a mensagem recebida (produto + intenção) e rotear o lead para o especialista correto, ou pedir UMA pergunta de esclarecimento quando não conseguir classificar com confiança.',
    can_do: [
      'Identificar de qual produto o lead está falando',
      'Detectar intenção (informação, compra, suporte, financeiro, humano)',
      'Rotear para SDR / Closer / Suporte / Financeiro do produto certo',
      'Fazer UMA pergunta curta para desambiguar quando necessário',
      'Transferir para humano quando for solicitado',
    ],
    cannot_do: [
      'Vender, negociar ou explicar detalhes de produto',
      'Responder dúvidas técnicas (encaminha para Suporte)',
      'Falar de preço, condições ou plano (encaminha para Closer)',
      'Mais de 2 perguntas seguidas — se não classificar, transfere para humano',
    ],
    handoff_triggers: [
      'Lead pede explicitamente para falar com humano',
      'Não consegui classificar produto após 2 perguntas',
      'Mensagem ofensiva ou fora do escopo da empresa',
    ],
    tone_style: 'friendly',
    message_style: 'short',
  },
  custom: {
    name: 'Agente Personalizado',
    description: 'Configure do zero conforme sua necessidade',
    icon: '✨',
    primary_objective: '',
    can_do: [],
    cannot_do: [],
    handoff_triggers: [],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
};

export const CHANNEL_LABELS = {
  active_in_funnels: 'Funis de Captura',
  active_in_chat: 'Chat do Site',
  active_in_widget: 'Widget',
  active_in_inbox: 'Inbox',
  active_in_copilot: 'Copilot do Vendedor',
  active_in_whatsapp: 'WhatsApp',
  active_in_instagram: 'Instagram',
  active_in_facebook: 'Facebook',
};
