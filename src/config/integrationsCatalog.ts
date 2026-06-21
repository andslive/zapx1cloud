import type { LucideIcon } from 'lucide-react';
import {
  Instagram,
  Brain,
  Sparkles,
  Cpu,
  Search as SearchIcon,
  CreditCard,
  DollarSign,
  Wallet,
  Banknote,
  Mail,
  FileText,
  Inbox,
  CalendarDays,
  Calendar as CalIcon,
  Facebook,
  Megaphone,
  Target,
  Building2,
  Boxes,
  Package,
  Globe,
  Webhook,
  Zap,
  Key,
  Smartphone,
} from 'lucide-react';

export type IntegrationStatus = 'active' | 'configurable' | 'coming_soon';

export interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon background tint */
  color: string;
  /** Component key — maps to a configurator in IntegrationConfigDrawer */
  configKey?:
    | 'whatsapp'
    | 'botconversa'
    | 'facebook'
    | 'email-config'
    | 'email-templates'
    | 'mass-email'
    | 'google-calendar'
    | 'sankhya'
    | 'api-keys'
    | 'openai'
    | 'anthropic'
    | 'gemini'
    | 'lovable-ai'
    | 'ai-routing'
    | 'cakto'
    | 'hotmart'
    | 'doppus'
    | 'webhooks-link';
  /** Marks the card visually but still opens config (e.g. native always-on services) */
  alwaysActive?: boolean;
  comingSoon?: boolean;
  /** Optional keywords to improve search matches */
  keywords?: string[];
  /** Optional brand logo (overrides Lucide icon when present) */
  logoSrc?: string;
}

export interface IntegrationCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  items: IntegrationItem[];
}

export const integrationsCatalog: IntegrationCategory[] = [
  {
    id: 'ai',
    label: 'Inteligência Artificial',
    icon: Brain,
    description: 'Provedores de modelos de IA para os agentes',
    items: [
      {
        id: 'lovable-ai',
        name: 'Lovable AI',
        description: 'Gateway nativo (Gemini + GPT) — já ativo',
        icon: Sparkles,
        color: 'bg-violet-500/10 text-violet-500',
        configKey: 'lovable-ai',
        alwaysActive: true,
        keywords: ['gemini', 'gpt', 'nativo', 'padrão'],
      },
      {
        id: 'ai-routing',
        name: 'Roteamento de IA',
        description: 'Escolha qual IA atende cada parte da plataforma',
        icon: Brain,
        color: 'bg-violet-500/10 text-violet-500',
        configKey: 'ai-routing',
        keywords: ['roteamento', 'provedor', 'capacidade', 'whatsapp', 'audio', 'imagem'],
      },
      {
        id: 'openai',
        name: 'OpenAI (ChatGPT)',
        description: 'Use sua própria chave da OpenAI',
        icon: Cpu,
        color: 'bg-teal-500/10 text-teal-500',
        configKey: 'openai',
        keywords: ['gpt', 'chatgpt', 'gpt-4', 'gpt-5'],
      },
      {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        description: 'Conecte sua conta Claude',
        icon: Brain,
        color: 'bg-orange-500/10 text-orange-500',
        configKey: 'anthropic',
        keywords: ['claude', 'sonnet', 'opus'],
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Use sua chave da Google AI',
        icon: Sparkles,
        color: 'bg-blue-500/10 text-blue-500',
        configKey: 'gemini',
        keywords: ['google', 'bard', 'gemini'],
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        description: 'Busca avançada com IA',
        icon: SearchIcon,
        color: 'bg-cyan-500/10 text-cyan-500',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'payments',
    label: 'Pagamentos',
    icon: CreditCard,
    description: 'Gateways de pagamento e cobrança',
    items: [
      {
        id: 'cakto',
        name: 'Cakto',
        description: 'Checkout, PIX, cartão e split (BR)',
        icon: CreditCard,
        color: 'bg-emerald-500/10 text-emerald-500',
        configKey: 'cakto',
        logoSrc: '/integrations/logos/cakto.svg',
        keywords: ['cakto', 'checkout', 'pix', 'split', 'infoproduto'],
      },
      {
        id: 'hotmart',
        name: 'Hotmart',
        description: 'Vendas, PIX, boletos, reembolsos e assinaturas',
        icon: CreditCard,
        color: 'bg-orange-500/10 text-orange-500',
        configKey: 'hotmart',
        logoSrc: '/integrations/logos/hotmart.png',
        keywords: ['hotmart', 'infoproduto', 'curso', 'postback', 'webhook', 'assinatura'],
      },
      {
        id: 'doppus',
        name: 'Doppus',
        description: 'Vendas, PIX, cartão e assinaturas (BR)',
        icon: CreditCard,
        color: 'bg-orange-500/10 text-orange-500',
        configKey: 'doppus',
        logoSrc: '/integrations/logos/doppus.png',
        keywords: ['doppus', 'infoproduto', 'postback', 'webhook', 'assinatura', 'pagamento'],
      },
      {
        id: 'stripe',
        name: 'Stripe',
        description: 'Pagamentos internacionais e assinaturas',
        icon: CreditCard,
        color: 'bg-indigo-500/10 text-indigo-500',
        logoSrc: '/integrations/logos/stripe.svg',
        comingSoon: true,
      },
      {
        id: 'mercadopago',
        name: 'Mercado Pago',
        description: 'PIX, boleto e cartão (BR)',
        icon: Wallet,
        color: 'bg-yellow-500/10 text-yellow-500',
        logoSrc: '/integrations/logos/mercadopago.svg',
        comingSoon: true,
      },
      {
        id: 'asaas',
        name: 'Asaas',
        description: 'Cobrança recorrente e split (BR)',
        icon: Banknote,
        color: 'bg-emerald-500/10 text-emerald-500',
        logoSrc: '/integrations/logos/asaas.svg',
        comingSoon: true,
      },
      {
        id: 'pagarme',
        name: 'Pagar.me',
        description: 'Cartão, boleto e PIX (BR)',
        icon: DollarSign,
        color: 'bg-green-500/10 text-green-500',
        logoSrc: '/integrations/logos/pagarme.svg',
        comingSoon: true,
      },
      {
        id: 'pix-direto',
        name: 'PIX Direto',
        description: 'Integração via banco (Sicredi, Bradesco, etc)',
        icon: Zap,
        color: 'bg-teal-500/10 text-teal-500',
        logoSrc: '/integrations/logos/pix.svg',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'email',
    label: 'E-mail & Comunicação',
    icon: Mail,
    description: 'Envio transacional, templates e campanhas',
    items: [
      {
        id: 'email-config',
        name: 'Configuração de E-mail',
        description: 'Remetente, assinatura e logo',
        icon: Mail,
        color: 'bg-blue-500/10 text-blue-500',
        configKey: 'email-config',
        keywords: ['resend', 'remetente'],
      },
      {
        id: 'email-templates',
        name: 'Templates de E-mail',
        description: 'Modelos reutilizáveis de mensagens',
        icon: FileText,
        color: 'bg-purple-500/10 text-purple-500',
        configKey: 'email-templates',
      },
      {
        id: 'mass-email',
        name: 'E-mail em Massa',
        description: 'Campanhas para listas segmentadas',
        icon: Inbox,
        color: 'bg-pink-500/10 text-pink-500',
        configKey: 'mass-email',
        keywords: ['marketing', 'campanha'],
      },
      {
        id: 'smtp-custom',
        name: 'SMTP Customizado',
        description: 'Use seu próprio servidor de e-mail',
        icon: Mail,
        color: 'bg-slate-500/10 text-slate-500',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'productivity',
    label: 'Agenda & Produtividade',
    icon: CalendarDays,
    items: [
      {
        id: 'google-calendar',
        name: 'Google Calendar',
        description: 'Sincronize agenda dos vendedores',
        icon: CalendarDays,
        color: 'bg-blue-500/10 text-blue-500',
        configKey: 'google-calendar',
        keywords: ['google', 'agenda'],
      },
      {
        id: 'outlook',
        name: 'Microsoft Outlook',
        description: 'Sincronização com calendário Outlook',
        icon: CalIcon,
        color: 'bg-cyan-500/10 text-cyan-500',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing & Captura',
    icon: Megaphone,
    description: 'Capture leads de campanhas pagas',
    items: [
      {
        id: 'facebook',
        name: 'Facebook Lead Ads',
        description: 'Receba leads do Facebook automaticamente',
        icon: Facebook,
        color: 'bg-blue-600/10 text-blue-600',
        configKey: 'facebook',
        keywords: ['meta', 'lead ads'],
      },
      {
        id: 'google-ads',
        name: 'Google Ads',
        description: 'Importação de leads do Google',
        icon: Target,
        color: 'bg-red-500/10 text-red-500',
        comingSoon: true,
      },
      {
        id: 'tiktok-ads',
        name: 'TikTok Ads',
        description: 'Lead Generation do TikTok',
        icon: Megaphone,
        color: 'bg-rose-500/10 text-rose-500',
        comingSoon: true,
      },
      {
        id: 'instagram-leads',
        name: 'Instagram Leads',
        description: 'Capture leads de campanhas no Instagram',
        icon: Instagram,
        color: 'bg-pink-500/10 text-pink-500',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'erp',
    label: 'ERP & Sistemas',
    icon: Building2,
    description: 'Sincronize com sistemas de gestão',
    items: [
      {
        id: 'sankhya',
        name: 'Sankhya ERP',
        description: 'Sync de clientes, produtos e pedidos',
        icon: Building2,
        color: 'bg-emerald-500/10 text-emerald-500',
        configKey: 'sankhya',
        keywords: ['erp', 'pedido'],
      },
      {
        id: 'bling',
        name: 'Bling',
        description: 'ERP para PMEs',
        icon: Boxes,
        color: 'bg-orange-500/10 text-orange-500',
        comingSoon: true,
      },
      {
        id: 'omie',
        name: 'Omie',
        description: 'Gestão financeira e comercial',
        icon: Building2,
        color: 'bg-green-500/10 text-green-500',
        comingSoon: true,
      },
      {
        id: 'tiny',
        name: 'Tiny ERP',
        description: 'Controle de estoque e pedidos',
        icon: Package,
        color: 'bg-blue-500/10 text-blue-500',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: Smartphone,
    description: 'Conecte seus números para atendimento e automação',
    items: [
      {
        id: 'whatsapp-config',
        name: 'WhatsApp (Uazapi)',
        description: 'Configure seu provedor de mensagens',
        icon: Smartphone,
        color: 'bg-green-500/10 text-green-500',
        configKey: 'whatsapp',
        keywords: ['uazapi', 'evolution', 'whatsapp', 'api'],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Ferramentas & Webhooks',
    icon: Zap,
    description: 'Automações, scraping e integrações customizadas',
    items: [
      {
        id: 'api-keys',
        name: 'Chaves de API',
        description: 'Resend, Firecrawl, Zapier e outros',
        icon: Key,
        color: 'bg-amber-500/10 text-amber-500',
        configKey: 'api-keys',
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Web scraping com IA',
        icon: Globe,
        color: 'bg-orange-500/10 text-orange-500',
        configKey: 'api-keys',
        keywords: ['scraping', 'crawl', 'uazapi', 'whatsapp'],
      },
      {
        id: 'zapier',
        name: 'Zapier',
        description: 'Conecte com mais de 5000 apps',
        icon: Zap,
        color: 'bg-yellow-500/10 text-yellow-500',
        configKey: 'api-keys',
      },
      {
        id: 'webhooks',
        name: 'Webhooks Customizados',
        description: 'Configure webhooks em Automação → Webhooks',
        icon: Webhook,
        color: 'bg-violet-500/10 text-violet-500',
        configKey: 'webhooks-link',
      },
    ],
  },
];
