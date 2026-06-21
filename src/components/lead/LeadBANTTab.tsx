import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DollarSign, Shield, Target, Clock, CheckCircle2, AlertCircle, TrendingUp, FileText } from 'lucide-react';

interface LeadBANTTabProps {
  lead: {
    id: string;
    bant_budget?: string | null;
    bant_authority?: string | null;
    bant_need?: string | null;
    bant_timing?: string | null;
  };
  onUpdateLead: (updates: Record<string, any>) => Promise<void>;
}

const BANT_CATEGORIES = [
  {
    key: 'bant_budget' as const,
    label: 'Budget (Orçamento)',
    icon: DollarSign,
    weight: 25,
    questions: [
      'Existe orçamento aprovado para este tipo de investimento?',
      'Qual a faixa de investimento prevista?',
      'Já investiram em soluções parecidas antes? Quanto?',
      'Quem controla e libera o orçamento?',
    ],
  },
  {
    key: 'bant_authority' as const,
    label: 'Authority (Autoridade)',
    icon: Shield,
    weight: 25,
    questions: [
      'Você é o decisor final desta compra?',
      'Quem mais participa do processo de decisão?',
      'O decisor já conhece nossa solução?',
      'Existe algum comitê ou processo de aprovação?',
    ],
  },
  {
    key: 'bant_need' as const,
    label: 'Need (Necessidade)',
    icon: Target,
    weight: 30,
    questions: [
      'Qual o principal problema que quer resolver?',
      'Há quanto tempo convive com esse problema?',
      'O que acontece se nada for feito nos próximos meses?',
      'Já tentaram resolver de outra forma? Como foi?',
      'Isso é prioridade para a empresa agora?',
    ],
  },
  {
    key: 'bant_timing' as const,
    label: 'Timing (Tempo)',
    icon: Clock,
    weight: 20,
    questions: [
      'Quando pretendem tomar a decisão?',
      'Existe um prazo ou evento que define a urgência?',
      'Já estão avaliando outras soluções?',
      'O que precisa acontecer para fechar nos próximos 30 dias?',
    ],
  },
];

type CategoryKey = typeof BANT_CATEGORIES[number]['key'];
type AnswersMap = Record<CategoryKey, Record<string, string>>;

function parseField(value: string | null | undefined, questionCount: number): Record<string, string> {
  if (!value) {
    const empty: Record<string, string> = {};
    for (let i = 1; i <= questionCount; i++) empty[`q${i}`] = '';
    return empty;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      // Ensure all keys exist
      for (let i = 1; i <= questionCount; i++) {
        if (!parsed[`q${i}`]) parsed[`q${i}`] = '';
      }
      return parsed;
    }
  } catch {
    // Legacy plain text — put into q1
  }
  const migrated: Record<string, string> = {};
  for (let i = 1; i <= questionCount; i++) migrated[`q${i}`] = i === 1 ? (value || '') : '';
  return migrated;
}

function serializeAnswers(answers: Record<string, string>): string | null {
  const hasContent = Object.values(answers).some(v => v.trim());
  return hasContent ? JSON.stringify(answers) : null;
}

function getFilledCount(answers: Record<string, string>): number {
  return Object.values(answers).filter(v => v.trim()).length;
}

function getScoreColor(score: number): string {
  if (score >= 76) return 'text-emerald-600';
  if (score >= 51) return 'text-amber-600';
  if (score >= 26) return 'text-orange-500';
  return 'text-destructive';
}

function getProgressColor(score: number): string {
  if (score >= 76) return '[&>div]:bg-emerald-500';
  if (score >= 51) return '[&>div]:bg-amber-500';
  if (score >= 26) return '[&>div]:bg-orange-500';
  return '[&>div]:bg-destructive';
}

function getSummary(score: number): { text: string; icon: typeof AlertCircle } {
  if (score >= 76) return { text: 'Lead altamente qualificado. Forte indicação de fechamento. Priorizar atendimento.', icon: TrendingUp };
  if (score >= 51) return { text: 'Lead com bom potencial. Maioria dos critérios atendidos. Avançar com proposta.', icon: TrendingUp };
  if (score >= 26) return { text: 'Lead parcialmente qualificado. Aprofundar nas áreas pendentes antes de avançar.', icon: AlertCircle };
  return { text: 'Lead em fase inicial. Poucas informações coletadas. Necessita mais qualificação.', icon: AlertCircle };
}

export function LeadBANTTab({ lead, onUpdateLead }: LeadBANTTabProps) {
  const [answers, setAnswers] = useState<AnswersMap>(() => {
    const init = {} as AnswersMap;
    for (const cat of BANT_CATEGORIES) {
      init[cat.key] = parseField(lead[cat.key], cat.questions.length);
    }
    return init;
  });

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Sync from prop changes
  useEffect(() => {
    const next = {} as AnswersMap;
    for (const cat of BANT_CATEGORIES) {
      next[cat.key] = parseField(lead[cat.key], cat.questions.length);
    }
    setAnswers(next);
  }, [lead.bant_budget, lead.bant_authority, lead.bant_need, lead.bant_timing]);

  const handleChange = useCallback((catKey: CategoryKey, qKey: string, value: string) => {
    setAnswers(prev => {
      const updated = { ...prev, [catKey]: { ...prev[catKey], [qKey]: value } };
      const timerKey = catKey;
      if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
      debounceTimers.current[timerKey] = setTimeout(() => {
        onUpdateLead({ [catKey]: serializeAnswers(updated[catKey]) });
      }, 1000);
      return updated;
    });
  }, [onUpdateLead]);

  useEffect(() => {
    return () => { Object.values(debounceTimers.current).forEach(clearTimeout); };
  }, []);

  const { score, categoryStats } = useMemo(() => {
    let total = 0;
    const stats: Record<string, { filled: number; total: number; complete: boolean }> = {};
    for (const cat of BANT_CATEGORIES) {
      const filled = getFilledCount(answers[cat.key]);
      const qTotal = cat.questions.length;
      const contribution = cat.weight * (filled / qTotal);
      total += contribution;
      stats[cat.key] = { filled, total: qTotal, complete: filled === qTotal };
    }
    return { score: Math.round(total), categoryStats: stats };
  }, [answers]);

  const summary = getSummary(score);
  const SummaryIcon = summary.icon;

  const completeCats = BANT_CATEGORIES.filter(c => categoryStats[c.key].complete).map(c => c.label);
  const pendingCats = BANT_CATEGORIES.filter(c => !categoryStats[c.key].complete).map(c => c.label);

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Score BANT</span>
            <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}/100</span>
          </div>
          <Progress value={score} className={`h-3 ${getProgressColor(score)}`} />
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="space-y-2">
              <p className="text-sm">{summary.text}</p>
              {completeCats.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-medium">✓ Completos:</span> {completeCats.join(', ')}
                </p>
              )}
              {pendingCats.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-orange-500 font-medium">○ Pendentes:</span> {pendingCats.join(', ')}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accordion Categories */}
      <Accordion type="multiple" defaultValue={[BANT_CATEGORIES[0].key]}>
        {BANT_CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const stats = categoryStats[cat.key];

          return (
            <AccordionItem key={cat.key} value={cat.key}>
              <AccordionTrigger className="hover:no-underline px-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" />
                    {cat.label}
                  </span>
                  <Badge
                    variant={stats.complete ? 'default' : 'secondary'}
                    className={stats.complete ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
                  >
                    {stats.complete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {stats.filled}/{stats.total}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {cat.questions.map((question, idx) => {
                    const qKey = `q${idx + 1}`;
                    return (
                      <div key={qKey} className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">
                          {idx + 1}. {question}
                        </label>
                        <Textarea
                          value={answers[cat.key][qKey] || ''}
                          onChange={e => handleChange(cat.key, qKey, e.target.value)}
                          placeholder="Resposta do cliente..."
                          className="min-h-[60px] resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
