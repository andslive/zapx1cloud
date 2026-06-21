export interface FollowupStep {
  delay_hours: number;
  instruction?: string;
}

export type WebhookActionType = 
  | 'create_lead' 
  | 'update_lead' 
  | 'transfer_user'
  | 'transfer_squad'
  | 'transfer_sector'
  | 'move_stage'
  | 'apply_tags'
  | 'update_field'
  | 'trigger_flow'
  | 'send_email'
  | 'send_email_to_seller'
  | 'notify_user'
  | 'notify_whatsapp'
  | 'set_temperature'
  | 'set_deal_value'
  | 'ai_agent_outreach';

// Actions that require a lead to exist first
export const LEAD_DEPENDENT_ACTIONS: WebhookActionType[] = [
  'update_lead',
  'transfer_user',
  'transfer_squad',
  'transfer_sector',
  'move_stage',
  'apply_tags',
  'update_field',
  'send_email',
  'send_email_to_seller',
  'notify_user',
  'notify_whatsapp',
  'set_temperature',
  'set_deal_value',
  'ai_agent_outreach',
  'trigger_flow'
];

export interface WebhookActionConfig {
  field_mappings?: Record<string, string>;
  target_user_id?: string;
  target_squad_id?: string;
  target_sector_id?: string;
  target_stage_id?: string;
  tags?: string[]; // legado: nomes em texto livre
  tag_ids?: string[]; // novo: ids de etiquetas reais (lead_tags)
  flow_id?: string;
  flow_agent_id?: string;
  flow_channel?: 'whatsapp' | 'webchat';
  flow_evolution_instance_id?: string;
  flow_assigned_user_id?: string;
  flow_sector_id?: string;
  email_template_id?: string;
  email_subject?: string;
  email_message?: string;
  notification_message?: string;
  temperature?: 'hot' | 'warm' | 'cold';
  value_field?: string;
  custom_field_id?: string;
  custom_field_key?: string;
  whatsapp_message?: string;
  whatsapp_target?: 'all_team' | 'specific_user' | 'specific_number';
  whatsapp_user_id?: string;
  whatsapp_number?: string;
  // AI Agent Outreach
  ai_agent_id?: string;
  ai_objective?: string;
  ai_extra_context?: string;
  ai_followup_enabled?: boolean;
  ai_followup_interval_hours?: number;
  ai_max_followups?: number;
  ai_followup_steps?: FollowupStep[];
  ai_business_hours_start?: string;
  ai_business_hours_end?: string;
  ai_business_days?: number[];
}

export interface WebhookAction {
  id: string;
  type: WebhookActionType;
  enabled: boolean;
  config: WebhookActionConfig;
}

export interface WebhookIdentificationConfig {
  phone_field?: string;
  email_field?: string;
  lookup_strategy?: 'phone_first' | 'email_first' | 'create_always';
}

export interface Webhook {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  is_test_mode: boolean;
  secret_key?: string;
  allowed_ips?: string[];
  product_id?: string;
  squad_id?: string;
  actions: WebhookAction[];
  identification_config: WebhookIdentificationConfig;
  requests_count: number;
  requests_this_month: number;
  last_request_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface WebhookLog {
  id: string;
  webhook_id?: string;
  request_method?: string;
  request_headers?: Record<string, string>;
  request_body?: Record<string, any>;
  request_ip?: string;
  parsed_fields?: Record<string, any>;
  status?: 'pending' | 'success' | 'error' | 'skipped';
  actions_executed?: Array<{
    action: WebhookActionType;
    success: boolean;
    result?: any;
    error?: string;
  }>;
  error_message?: string;
  lead_id?: string;
  processing_time_ms?: number;
  created_at: string;
  // UazAPI Webhook extensions
  request_id?: string;
  event_type?: string;
  instance_name?: string;
  owner?: string;
  phone?: string;
  chatid?: string;
  messageid?: string;
  from_me?: boolean;
  message_type?: string;
  raw_payload?: Record<string, any>;
  processing_status?: string;
  conversation_id?: string;
  organization_id?: string;
  processed_at?: string;
}


export interface WebhookSampleRequest {
  id: string;
  webhook_id: string;
  name?: string;
  request_body: Record<string, any>;
  extracted_fields: Record<string, any>;
  is_default: boolean;
  created_at: string;
}

export const ACTION_TYPES: Record<WebhookActionType, { label: string; description: string; icon: string }> = {
  create_lead: {
    label: 'Criar Lead',
    description: 'Cria um novo lead no CRM com os dados do payload',
    icon: 'UserPlus'
  },
  update_lead: {
    label: 'Atualizar Lead',
    description: 'Atualiza um lead existente baseado em email ou telefone',
    icon: 'UserCog'
  },
  transfer_user: {
    label: 'Transferir para Vendedor',
    description: 'Transfere o lead para um vendedor específico',
    icon: 'UserCheck'
  },
  transfer_squad: {
    label: 'Transferir para Squad',
    description: 'Transfere o lead para um squad específico',
    icon: 'Users'
  },
  transfer_sector: {
    label: 'Transferir para Setor',
    description: 'Vincula o lead a um setor da empresa',
    icon: 'Building2'
  },
  move_stage: {
    label: 'Mover no Pipeline',
    description: 'Move o lead para um estágio específico do pipeline',
    icon: 'ArrowRight'
  },
  apply_tags: {
    label: 'Aplicar Etiquetas',
    description: 'Aplica etiquetas (com cor) ao lead',
    icon: 'Tag'
  },
  update_field: {
    label: 'Atualizar Campo',
    description: 'Atualiza um campo específico do lead',
    icon: 'Edit'
  },
  trigger_flow: {
    label: 'Disparar Fluxo',
    description: 'Inicia um fluxo de chat automático',
    icon: 'Zap'
  },
  send_email: {
    label: 'Enviar Email para Lead',
    description: 'Envia um email para o lead usando template configurado',
    icon: 'Mail'
  },
  send_email_to_seller: {
    label: 'Enviar Email para Vendedor',
    description: 'Notifica o vendedor responsável por email com dados do lead',
    icon: 'Mail'
  },
  notify_user: {
    label: 'Notificar Vendedor (App)',
    description: 'Envia notificação no app para o vendedor responsável',
    icon: 'Bell'
  },
  set_temperature: {
    label: 'Definir Temperatura',
    description: 'Define a temperatura do lead (hot/warm/cold)',
    icon: 'Thermometer'
  },
  set_deal_value: {
    label: 'Definir Valor do Deal',
    description: 'Define o valor do deal a partir do payload',
    icon: 'DollarSign'
  },
  notify_whatsapp: {
    label: 'Notificar Equipe (WhatsApp)',
    description: 'Envia mensagem WhatsApp via IsiChat para membro(s) da equipe',
    icon: 'MessageCircle'
  },
  ai_agent_outreach: {
    label: 'Acionar Agente IA (WhatsApp)',
    description: 'Agente IA analisa o lead e envia mensagem estratégica via WhatsApp',
    icon: 'Bot'
  }
};
