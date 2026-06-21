import { Product, CadenceDay, Objection, Material } from '@/types/sales';

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'PoupeJá White Label',
    description: 'Plataforma de cashback white label para empresas',
    pitch15s: 'PoupeJá é a plataforma que transforma compras dos seus clientes em pontos e cashback. Seu banco, sua marca, seu lucro.',
    pitch30s: 'Imagine oferecer aos seus clientes um programa de cashback completo, com a sua marca, integrado ao seu app. O PoupeJá White Label faz isso em semanas, não meses. Você retém mais, engaja mais e lucra mais.',
    pitch2min: 'O PoupeJá White Label é a solução completa para bancos digitais e fintechs que querem oferecer programas de fidelidade de verdade. Cashback em milhares de lojas parceiras, marketplace integrado, cartão virtual com benefícios. Tudo isso com sua marca, seu domínio, suas cores. Implementação em 4 semanas, suporte dedicado e modelo de receita transparente. Já operamos com mais de 15 instituições e movimentamos R$ 2M em cashback por mês.',
    icp: 'Fintechs e bancos digitais com base de 10k+ clientes ativos buscando diferenciação e retenção',
    differentials: [
      'Implementação em 4 semanas',
      'White label completo',
      '+1.500 lojas parceiras',
      'API robusta e documentada',
      'Suporte dedicado 24/7'
    ],
    pricing: [
      { name: 'Starter', price: 'R$ 2.990/mês', features: ['Até 10k usuários', 'Cashback básico', 'Suporte email'] },
      { name: 'Growth', price: 'R$ 7.990/mês', features: ['Até 50k usuários', 'Marketplace completo', 'API avançada', 'Suporte prioritário'], recommended: true },
      { name: 'Enterprise', price: 'Sob consulta', features: ['Usuários ilimitados', 'Customização total', 'SLA dedicado', 'Account Manager'] }
    ],
    status: 'published',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-06-20')
  },
  {
    id: '2',
    name: 'IsiChat WL',
    description: 'Plataforma de atendimento multicanal white label',
    pitch15s: 'IsiChat unifica WhatsApp, Instagram e Telegram em um só lugar. Atenda mais, venda mais.',
    pitch30s: 'Seus clientes estão em todo lugar. WhatsApp, Instagram, Telegram, e-mail. O IsiChat White Label centraliza tudo, com automações inteligentes, chatbots e relatórios. Sua marca, sua plataforma, seu controle total.',
    pitch2min: 'O IsiChat White Label é a plataforma de atendimento omnichannel que suas equipes precisam. Centralize conversas de WhatsApp Business, Instagram DM, Telegram e e-mail. Configure chatbots sem código, crie fluxos de automação, distribua atendimentos entre equipes e acompanhe métricas em tempo real. Tudo isso com sua identidade visual. Ideal para agências, consultorias e empresas que querem oferecer atendimento profissional aos seus clientes.',
    icp: 'Agências de marketing digital e consultorias com 20+ clientes ativos',
    differentials: [
      'Multicanal real (não é gambiarra)',
      'Chatbot visual drag-and-drop',
      'API oficial do WhatsApp',
      'Relatórios de performance',
      'White label completo'
    ],
    pricing: [
      { name: 'Basic', price: 'R$ 497/mês', features: ['3 canais', '5 atendentes', 'Chatbot básico'] },
      { name: 'Pro', price: 'R$ 1.297/mês', features: ['Canais ilimitados', '20 atendentes', 'Automações avançadas', 'API'], recommended: true },
      { name: 'Agency', price: 'R$ 2.997/mês', features: ['Multi-clientes', 'Atendentes ilimitados', 'White label', 'Revenda'] }
    ],
    status: 'published',
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-06-18')
  },
  {
    id: '3',
    name: 'TucaPay',
    description: 'Gateway de pagamentos com split automático',
    pitch15s: 'TucaPay: receba pagamentos, divida automaticamente entre parceiros. Simples assim.',
    pitch30s: 'Marketplaces, franquias, afiliados. Se você precisa dividir pagamentos de forma automática, o TucaPay resolve. PIX, cartão, boleto com split configurável. Você define as regras, a grana vai pro lugar certo.',
    pitch2min: 'O TucaPay é o gateway de pagamentos pensado para quem precisa de split automático. Ideal para marketplaces, programas de afiliados, franquias e qualquer modelo com múltiplos recebedores. Configure splits fixos ou variáveis, receba em PIX instantâneo, cartão ou boleto. Dashboard completo, conciliação automática e antecipação de recebíveis. Integração simples via API REST com SDKs para as principais linguagens. Taxas competitivas e suporte técnico de verdade.',
    icp: 'Marketplaces e plataformas com modelo de comissionamento ou split de pagamentos',
    differentials: [
      'Split automático configurável',
      'PIX instantâneo',
      'Antecipação de recebíveis',
      'Dashboard de conciliação',
      'API REST moderna'
    ],
    pricing: [
      { name: 'Transacional', price: '2.99% + R$0.49', features: ['PIX', 'Cartão', 'Boleto', 'Split básico'] },
      { name: 'Business', price: '2.49% + R$0.39', features: ['Tudo do Transacional', 'Antecipação', 'Conciliação avançada', 'API priority'], recommended: true },
      { name: 'Enterprise', price: 'Negociável', features: ['Taxas personalizadas', 'SLA dedicado', 'Integração assistida'] }
    ],
    status: 'published',
    createdAt: new Date('2024-03-05'),
    updatedAt: new Date('2024-06-15')
  }
];

export const mockCadence: CadenceDay[] = [
  {
    day: 1,
    title: 'Primeira Abordagem',
    trigger: 'Apresentar valor + criar curiosidade',
    blocks: [
      {
        id: '1-1',
        type: 'message',
        variant: 'short',
        content: 'Oi [NOME]! 👋 Vi que você trabalha com [SEGMENTO]. Tenho algo que pode dobrar a retenção dos seus clientes. Posso te mostrar em 2 minutos?'
      },
      {
        id: '1-2',
        type: 'message',
        variant: 'medium',
        content: 'Oi [NOME], tudo bem? 👋\n\nMe chamo [SEU NOME] e trabalho com soluções de cashback para fintechs como a sua.\n\nTemos uma plataforma white label que já ajudou +15 bancos digitais a aumentarem a retenção em 40%.\n\nVocês já têm alguma solução de fidelidade rodando? Queria entender melhor o cenário de vocês.'
      },
      {
        id: '1-3',
        type: 'audio',
        variant: 'short',
        content: 'Áudio de apresentação (20s)',
        audioScript: 'Oi [NOME], aqui é o [SEU NOME]. Trabalho com soluções de cashback white label pra fintechs. Já ajudamos mais de 15 bancos digitais a aumentar retenção em 40%. Queria bater um papo rápido pra entender o cenário de vocês. Me dá um retorno?'
      }
    ]
  },
  {
    day: 2,
    title: 'Prova Social',
    trigger: 'Mostrar resultados reais + quebrar ceticismo',
    blocks: [
      {
        id: '2-1',
        type: 'message',
        variant: 'short',
        content: '[NOME], olha esse case: Banco XYZ aumentou 47% de retenção em 3 meses com nossa plataforma. Quer ver os números?'
      },
      {
        id: '2-2',
        type: 'message',
        variant: 'medium',
        content: '[NOME], queria compartilhar um resultado que acho relevante pro seu contexto:\n\n📊 O Banco XYZ tinha 22% de churn mensal\n📊 Implementaram nosso cashback white label\n📊 Em 3 meses: churn caiu pra 12%\n📊 ROI do programa: 340%\n\nPosso te mandar o case completo?'
      },
      {
        id: '2-3',
        type: 'material',
        variant: 'short',
        content: 'Case Study: Banco XYZ',
        materialId: 'case-xyz'
      }
    ]
  },
  {
    day: 3,
    title: 'Comparativo',
    trigger: 'Ancorar valor vs alternativas',
    blocks: [
      {
        id: '3-1',
        type: 'message',
        variant: 'medium',
        content: '[NOME], sei que existem outras opções no mercado. Fiz uma comparação rápida:\n\n🔴 Desenvolver interno: 6-12 meses + R$500k\n🔴 Concorrente A: 3 meses + sem white label\n🟢 PoupeJá: 4 semanas + white label completo\n\nQual dessas opções vocês estavam considerando?'
      },
      {
        id: '3-2',
        type: 'cta',
        variant: 'short',
        content: 'Agendar demo de 15 minutos'
      }
    ]
  },
  {
    day: 4,
    title: 'Escassez + Bônus',
    trigger: 'Criar urgência legítima',
    blocks: [
      {
        id: '4-1',
        type: 'message',
        variant: 'medium',
        content: '[NOME], temos uma condição especial até sexta:\n\n🎁 Setup gratuito (economia de R$5.000)\n🎁 1 mês free pra testar\n🎁 Migração assistida\n\nIsso vale pros próximos 3 contratos. Faz sentido a gente conversar ainda essa semana?'
      },
      {
        id: '4-2',
        type: 'audio',
        variant: 'short',
        content: 'Áudio de urgência',
        audioScript: 'Oi [NOME], passando aqui porque temos uma condição especial que vai até sexta: setup gratuito mais um mês free. Só pros próximos 3 contratos. Queria ver se faz sentido pra vocês entrarem nessa.'
      }
    ]
  },
  {
    day: 5,
    title: 'Última Chamada',
    trigger: 'Fechamento ou call',
    blocks: [
      {
        id: '5-1',
        type: 'message',
        variant: 'short',
        content: '[NOME], última tentativa: posso te ligar 5 minutos amanhã às 10h ou 15h? Se não der, sem problemas, fico no seu radar.'
      },
      {
        id: '5-2',
        type: 'message',
        variant: 'medium',
        content: '[NOME], entendo que o timing pode não ser agora.\n\nSe fizer sentido no futuro, fico à disposição. Só me chama.\n\nEnquanto isso, vou te mandar um material sobre tendências de fidelização pra 2024. Acho que agrega valor independente de fecharmos agora.\n\nAbraço! 🤝'
      }
    ]
  }
];

export const mockObjections: Objection[] = [
  {
    id: 'obj-1',
    category: 'price',
    whatTheySay: 'Está muito caro',
    whatTheyMean: 'Não entendi o valor ou estou comparando com algo diferente',
    suggestedResponse: 'Entendo a preocupação com investimento. Me ajuda a entender: você está comparando com desenvolver internamente ou com outra solução do mercado?',
    followUpQuestion: 'Quanto vocês estimam que perdem por mês com churn de clientes?'
  },
  {
    id: 'obj-2',
    category: 'timing',
    whatTheySay: 'Não é o momento certo',
    whatTheyMean: 'Tenho outras prioridades ou preciso de mais informações',
    suggestedResponse: 'Faz total sentido priorizar. Posso perguntar: o que precisaria mudar pro momento ficar certo? É questão de budget, time interno ou estratégia?',
    followUpQuestion: 'Vocês têm uma data específica em mente pra revisitar isso?'
  },
  {
    id: 'obj-3',
    category: 'thinking',
    whatTheySay: 'Preciso pensar / consultar',
    whatTheyMean: 'Preciso de mais segurança ou não sou o decisor',
    suggestedResponse: 'Claro! Pra te ajudar a pensar: qual é a principal dúvida que ficou? Posso preparar um material mais específico sobre esse ponto.',
    followUpQuestion: 'Quem mais estaria envolvido nessa decisão? Posso agendar uma call com todo mundo junto?'
  },
  {
    id: 'obj-4',
    category: 'competitor',
    whatTheySay: 'Já uso outra solução',
    whatTheyMean: 'Preciso de um motivo forte pra mudar',
    suggestedResponse: 'Ótimo que vocês já têm algo rodando! Qual solução vocês usam? Pergunto porque muitos clientes nossos migraram de [X/Y/Z] por causa de [diferencial específico].',
    followUpQuestion: 'O que você mudaria na solução atual se pudesse?'
  },
  {
    id: 'obj-5',
    category: 'trust',
    whatTheySay: 'Nunca ouvi falar de vocês',
    whatTheyMean: 'Preciso de prova de que funciona e é seguro',
    suggestedResponse: 'Faz sentido! Somos mais discretos porque trabalhamos B2B. Posso te mandar nosso case com [Cliente Referência] e também te colocar em contato com um cliente nosso pra você ouvir direto deles.',
    followUpQuestion: 'Prefere que eu mande cases por escrito ou um contato direto com cliente?'
  },
  {
    id: 'obj-6',
    category: 'partner',
    whatTheySay: 'Preciso falar com meu sócio/diretor',
    whatTheyMean: 'Não tenho autonomia total ou preciso de apoio',
    suggestedResponse: 'Perfeito! Quer que eu prepare um resumo executivo pra facilitar a conversa com ele? Ou melhor: posso entrar na call junto pra responder perguntas técnicas?',
    followUpQuestion: 'Quando vocês teriam essa conversa? Posso ligar depois pra tirar dúvidas que surgirem?'
  }
];

export const mockMaterials: Material[] = [
  {
    id: 'case-xyz',
    name: 'Case Study: Banco XYZ',
    type: 'pdf',
    url: '/materials/case-xyz.pdf',
    tags: ['proof'],
    objective: 'Mostrar resultados reais de implementação',
    status: 'active'
  },
  {
    id: 'demo-video',
    name: 'Vídeo Demo - Plataforma',
    type: 'video',
    url: 'https://youtube.com/demo',
    tags: ['presentation'],
    objective: 'Demonstrar funcionalidades principais',
    status: 'active'
  },
  {
    id: 'comparison-table',
    name: 'Comparativo de Mercado',
    type: 'pdf',
    url: '/materials/comparison.pdf',
    tags: ['objection', 'closing'],
    objective: 'Diferenciar de concorrentes',
    status: 'active'
  },
  {
    id: 'roi-calculator',
    name: 'Calculadora de ROI',
    type: 'link',
    url: 'https://app.poupeja.com/roi',
    tags: ['closing'],
    objective: 'Justificar investimento',
    status: 'active'
  },
  {
    id: 'testimonial-1',
    name: 'Depoimento - CEO Fintech Alpha',
    type: 'video',
    url: 'https://youtube.com/testimonial1',
    tags: ['proof'],
    objective: 'Prova social de decisor',
    status: 'active'
  },
  {
    id: 'banner-promo',
    name: 'Banner Promoção Q3',
    type: 'banner',
    url: '/materials/promo-q3.png',
    tags: ['closing'],
    objective: 'Destacar oferta especial',
    status: 'active'
  }
];
