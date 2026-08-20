import type { LucideIcon } from 'lucide-react';
import { META_CLOUD_API_ENABLED } from './metaCloudApiFeatureFlag';
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
    | 'meta-cloud-api'
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
    | 'webhooks-link'
    | 'hookcloud-onboarding';
  /** Marks the card visually but still opens config (e.g. native always-on services) */
  alwaysActive?: boolean;
  comingSoon?: boolean;
  /** Optional keywords to improve search matches */
  keywords?: string[];
  /** Optional brand logo (overrides Lucide icon when present) */
  logoSrc?: string;
  /**
   * FASE 18A — quando presente, substitui completamente o badge padrão
   * (Ativo/Configurar/Em breve) por este texto (ex.: "Piloto"). Usado só
   * pelo card HookCloud — garante estruturalmente que ele nunca mostre o
   * badge verde "Ativo", mesmo que uma conexão pending exista (uma
   * conexão pending nunca deve parecer ativa/conectada).
   */
  pilotLabel?: string;
}

export interface IntegrationCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  items: IntegrationItem[];
}

/**
 * Fase 5E — catálogo bruto (inclui o item Meta incondicionalmente). Nunca
 * consumir isto diretamente na UI — use `integrationsCatalog` (abaixo),
 * já filtrado pela feature flag. Mantido exportado só para o filtro puro
 * poder ser testado com os dois estados da flag sem depender da constante
 * hardcoded.
 */
export const rawIntegrationsCatalog: IntegrationCategory[] = [
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
      {
        // FASE 2A / Fase 5E — fundação técnica pronta, mas a direção
        // comercial atual é NÃO oferecer Meta Cloud API direta agora
        // (UazAPI é o provedor produtivo; a segunda opção futura é
        // HookCloud, não Meta). Por isso este item só entra no catálogo
        // renderizado quando `META_CLOUD_API_ENABLED === true` — ver
        // `filterIntegrationsCatalogByMetaFlag` no final deste arquivo.
        // Com a flag `false` (padrão), o item é removido da fonte antes
        // de qualquer renderização/busca/filtro — não é `comingSoon`
        // (que ainda mostraria o card com badge "Em breve"), é ausência
        // completa. Mantido aqui no catálogo bruto para que, quando a
        // flag for ligada no futuro, o card volte com a definição
        // completa já pronta.
        id: 'meta-cloud-api-config',
        name: 'WhatsApp Cloud API (Meta Oficial)',
        description: 'Conecte números pela API oficial da Meta, com suporte à Coexistência.',
        icon: Facebook,
        color: 'bg-blue-500/10 text-blue-500',
        configKey: 'meta-cloud-api',
        keywords: ['meta', 'cloud api', 'oficial', 'embedded signup', 'coexistência', 'whatsapp business platform'],
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

/**
 * Fase 5E — remove o item Meta Cloud API do catálogo quando a feature
 * flag está desligada (falha fechada: `metaCloudEnabled` não booleano ou
 * ausente também oculta o item, nunca o inclui por omissão). Categorias
 * que ficarem sem nenhum item após a filtragem são removidas também, para
 * nunca deixar espaço vazio na grade. Função pura — recebe o estado da
 * flag como parâmetro em vez de ler a constante diretamente, para que os
 * dois estados sejam testáveis sem depender do valor hardcoded.
 *
 * Não duplica uma segunda flag: usa a mesma `META_CLOUD_API_ENABLED` já
 * existente (importada abaixo, no único ponto de leitura real).
 */
export function filterIntegrationsCatalogByMetaFlag(
  catalog: IntegrationCategory[],
  metaCloudEnabled: boolean,
): IntegrationCategory[] {
  if (metaCloudEnabled === true) return catalog;
  return catalog
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => item.id !== 'meta-cloud-api-config'),
    }))
    .filter((cat) => cat.items.length > 0);
}

/**
 * Catálogo pronto para a UI — já filtrado pela feature flag real. Todo
 * consumidor existente (`IntegrationsManager.tsx`, busca, filtros,
 * contagens) continua importando `integrationsCatalog` sem nenhuma
 * mudança de código: o item Meta simplesmente não existe aqui quando a
 * flag está desligada.
 */
export const integrationsCatalog: IntegrationCategory[] = filterIntegrationsCatalogByMetaFlag(
  rawIntegrationsCatalog,
  META_CLOUD_API_ENABLED,
);

// ══════════════════════════════════════════════════════════════════════
// FASE 18A — card comercial "HookCloud — WhatsApp Oficial"
// ══════════════════════════════════════════════════════════════════════
//
// Deliberadamente NÃO adicionado a `rawIntegrationsCatalog` acima: sua
// visibilidade depende de uma consulta ASSÍNCRONA por organização
// (`useHookCloudPilotAccess`, tabela real `meta_cloud_feature_flags` +
// papel admin/super_admin do usuário autenticado) — não de uma constante
// síncrona conhecida no carregamento do módulo, como `META_CLOUD_API_ENABLED`.
// `IntegrationsManager.tsx` injeta este item via `injectHookCloudItem`
// (abaixo) só depois que a consulta resolve `visible=true`. Nunca reaparece
// como uma "terceira opção" ao lado do card técnico Meta (que continua
// oculto, inalterado) — é a ÚNICA opção comercial de API oficial da Meta
// disponível, com nome comercial próprio.

export const hookCloudOnboardingItem: IntegrationItem = {
  id: 'hookcloud-onboarding',
  name: 'HookCloud — WhatsApp Oficial',
  description: 'Conecte um número pela API oficial do WhatsApp, com configuração assistida pela HookCloud.',
  icon: Facebook,
  color: 'bg-blue-500/10 text-blue-500',
  configKey: 'hookcloud-onboarding',
  pilotLabel: 'Piloto',
  keywords: ['hookcloud', 'meta', 'oficial', 'cloud api', 'whatsapp business platform'],
};

/**
 * Insere `hookCloudOnboardingItem` na categoria `whatsapp` de `catalog`
 * quando `visible=true` — nunca quando `false` (ausência completa, mesmo
 * idioma de `filterIntegrationsCatalogByMetaFlag`: não é "coming soon",
 * é inexistente). Função pura, testável com os dois estados sem
 * depender de nenhuma consulta real ao Supabase.
 */
export function injectHookCloudItem(
  catalog: IntegrationCategory[],
  visible: boolean,
): IntegrationCategory[] {
  if (!visible) return catalog;
  const alreadyPresent = catalog.some((cat) => cat.items.some((item) => item.id === hookCloudOnboardingItem.id));
  if (alreadyPresent) return catalog;

  let injected = false;
  const next = catalog.map((cat) => {
    if (cat.id !== 'whatsapp') return cat;
    injected = true;
    return { ...cat, items: [hookCloudOnboardingItem, ...cat.items] };
  });
  if (injected) return next;

  // Categoria 'whatsapp' ausente do catálogo (não deveria acontecer,
  // mas nunca perde o item silenciosamente): cria a categoria mínima.
  const whatsappCategory = rawIntegrationsCatalog.find((c) => c.id === 'whatsapp');
  if (!whatsappCategory) return catalog;
  return [...catalog, { ...whatsappCategory, items: [hookCloudOnboardingItem] }];
}
