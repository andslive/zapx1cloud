import { useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  BarChart3, MessageSquare, Zap, FileText, Webhook, Bot, 
  Users, PieChart, CalendarDays, DollarSign, ChevronRight,
  ArrowRight, CheckCircle2, Sparkles, Shield, Rocket,
  Send, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { usePlatformName } from '@/hooks/usePlatformName';
import { usePlatformBranding } from '@/hooks/usePlatformBranding';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Logo } from '@/components/ui/Logo';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const FEATURES = [
  { icon: BarChart3, title: 'CRM & Pipeline Visual', desc: 'Kanban drag-and-drop com estágios personalizáveis, valores e probabilidade de fechamento.' },
  { icon: MessageSquare, title: 'Inbox Omnichannel', desc: 'WhatsApp, chat web e mais — tudo numa caixa de entrada unificada com IA.' },
  { icon: Zap, title: 'Funis de Captação com IA', desc: 'Landing pages e formulários inteligentes que qualificam e distribuem leads automaticamente.' },
  { icon: FileText, title: 'Formulários Inteligentes', desc: 'Scoring automático, tags condicionais e mapeamento de campos personalizados.' },
  { icon: Webhook, title: 'Automações & Webhooks', desc: 'Conecte com qualquer ferramenta: envie emails, notifique equipes, acione fluxos.' },
  { icon: Bot, title: 'Agentes de IA', desc: 'Atendentes virtuais treinados com seus materiais que respondem 24/7 com contexto.' },
  { icon: Users, title: 'Gestão de Equipes & Squads', desc: 'Distribua leads por equipe, defina permissões granulares e acompanhe performance.' },
  { icon: PieChart, title: 'Relatórios & Dashboards', desc: 'Métricas em tempo real: conversão por etapa, tempo de resposta, ranking de vendedores.' },
  { icon: CalendarDays, title: 'Agendamento Online', desc: 'Links de agendamento personalizados com integração ao Google Calendar e Meet.' },
  { icon: DollarSign, title: 'Sistema de Comissões', desc: 'Regras flexíveis por produto, vendedor ou equipe com aprovação e pagamento.' },
];

const STEPS = [
  { number: '01', title: 'Capture', desc: 'Leads entram por formulários, funis, WhatsApp ou integrações — tudo centralizado.', icon: Sparkles },
  { number: '02', title: 'Qualifique', desc: 'IA e scoring classificam automaticamente. Sua equipe foca no que importa.', icon: Shield },
  { number: '03', title: 'Converta', desc: 'Pipeline visual, automações e agentes de IA aceleram o fechamento.', icon: Rocket },
];

export default function SalesPage() {
  const { platformName } = usePlatformName();
  usePlatformBranding();
  const formRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    company_size: '',
    segment: '',
    main_challenge: '',
  });

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.email.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const { error } = await supabase.from('sales_leads').insert({
        ...form,
        utm_source: params.get('utm_source') || null,
        utm_medium: params.get('utm_medium') || null,
        utm_campaign: params.get('utm_campaign') || null,
      });
      if (error) throw error;
      setIsSubmitted(true);
      toast.success('Mensagem enviada com sucesso!');
    } catch {
      toast.error('Erro ao enviar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <Button onClick={scrollToForm} size="sm">
            Falar com Consultor <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" /> Plataforma completa de vendas
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
              Transforme seu processo de vendas com{' '}
              <span className="text-primary">inteligência artificial</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              CRM, inbox omnichannel, funis de captação, agentes de IA e automações — 
              tudo em uma plataforma integrada para sua equipe vender mais e melhor.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="xl" onClick={scrollToForm}>
                Falar com Consultor <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="xl" variant="outline" onClick={scrollToForm}>
                Solicitar Proposta
              </Button>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que sua equipe precisa para vender mais
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Funcionalidades pensadas para cada etapa do processo comercial.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <Card className="h-full bg-card/50 border-border/50 hover:border-primary/30 transition-colors group">
                  <CardContent className="p-5">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
              Como funciona
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-lg">
              Três passos para revolucionar suas vendas.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <motion.div key={s.number} variants={fadeUp} className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="h-8 w-8 text-primary" />
                </div>
                <span className="text-xs font-bold text-primary uppercase tracking-widest">{s.number}</span>
                <h3 className="text-xl font-bold mt-1 mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Custom Plans */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp}>
              <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-8 sm:p-12 text-center relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-4">
                    <Sparkles className="h-4 w-4" /> Planos sob medida
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                    Cada empresa é única. Seu plano também.
                  </h2>
                  <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                    Não vendemos planos genéricos. Analisamos sua operação comercial e montamos 
                    a configuração ideal para sua equipe — com os módulos, integrações e suporte que você precisa.
                  </p>
                  <Button size="lg" onClick={scrollToForm}>
                    Solicitar Proposta Personalizada <ArrowRight className="h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* Contact Form */}
      <section ref={formRef} id="contato" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-2xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Fale com um consultor
              </h2>
              <p className="text-muted-foreground text-lg">
                Preencha o formulário e nossa equipe entra em contato em até 24h.
              </p>
            </motion.div>

            {isSubmitted ? (
              <motion.div variants={fadeUp}>
                <Card className="border-primary/30">
                  <CardContent className="p-8 text-center">
                    <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
                    <h3 className="text-2xl font-bold mb-2">Mensagem enviada!</h3>
                    <p className="text-muted-foreground">
                      Nosso consultor entrará em contato em breve. Obrigado pelo interesse!
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div variants={fadeUp}>
                <Card>
                  <CardContent className="p-6 sm:p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome da empresa *</Label>
                          <Input
                            value={form.company_name}
                            onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))}
                            placeholder="Sua empresa"
                            required
                            maxLength={100}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Seu nome *</Label>
                          <Input
                            value={form.contact_name}
                            onChange={(e) => setForm(p => ({ ...p, contact_name: e.target.value }))}
                            placeholder="Nome completo"
                            required
                            maxLength={100}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="email@empresa.com"
                            required
                            maxLength={255}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone / WhatsApp</Label>
                          <Input
                            value={form.phone}
                            onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                            placeholder="(11) 99999-9999"
                            maxLength={20}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tamanho da empresa</Label>
                          <Select value={form.company_size} onValueChange={(v) => setForm(p => ({ ...p, company_size: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-5">1 a 5 pessoas</SelectItem>
                              <SelectItem value="6-20">6 a 20 pessoas</SelectItem>
                              <SelectItem value="21-50">21 a 50 pessoas</SelectItem>
                              <SelectItem value="51-200">51 a 200 pessoas</SelectItem>
                              <SelectItem value="200+">Mais de 200</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Segmento</Label>
                          <Input
                            value={form.segment}
                            onChange={(e) => setForm(p => ({ ...p, segment: e.target.value }))}
                            placeholder="Ex: SaaS, Varejo, Serviços..."
                            maxLength={100}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Qual seu principal desafio em vendas?</Label>
                        <Textarea
                          value={form.main_challenge}
                          onChange={(e) => setForm(p => ({ ...p, main_challenge: e.target.value }))}
                          placeholder="Conte um pouco sobre os desafios que sua equipe enfrenta hoje..."
                          rows={4}
                          maxLength={1000}
                        />
                      </div>

                      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <><Loader2 className="h-5 w-5 animate-spin" /> Enviando...</>
                        ) : (
                          <><Send className="h-5 w-5" /> Enviar mensagem</>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {platformName}. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
