import { useMemo, useState } from 'react';
import {
  useQualityEvaluations,
  useTriggerEvaluation,
  usePromptExperiments,
  usePromptVariants,
  useUpsertExperiment,
  useDeleteExperiment,
  useUpsertVariant,
  useDeleteVariant,
  type PromptExperiment,
  type PromptVariant,
} from '@/hooks/useAIQuality';
import { useAllAgents } from '@/hooks/useProductAgents';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart3,
  Sparkles,
  Plus,
  Trash2,
  Play,
  Pause,
  TrendingUp,
  Activity,
  TestTube2,
} from 'lucide-react';

function fmtScore(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toFixed(0);
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: any;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function AIQualityPanel() {
  const { data: evals = [], isLoading } = useQualityEvaluations(200);
  const { data: experiments = [] } = usePromptExperiments();
  const { data: agents = [] } = useAllAgents();
  const trigger = useTriggerEvaluation();
  const upsertExp = useUpsertExperiment();
  const deleteExp = useDeleteExperiment();

  const [editingExp, setEditingExp] = useState<Partial<PromptExperiment> | null>(null);
  const [openExp, setOpenExp] = useState<PromptExperiment | null>(null);

  const stats = useMemo(() => {
    if (evals.length === 0) {
      return {
        total: 0,
        avgOverall: 0,
        avgClarity: 0,
        avgTone: 0,
        avgConversion: 0,
        topIssues: [] as { label: string; count: number }[],
      };
    }
    const avg = (key: keyof (typeof evals)[number]) =>
      evals.reduce((s, e) => s + (Number(e[key]) || 0), 0) / evals.length;

    const issues = new Map<string, number>();
    for (const e of evals) {
      const arr = Array.isArray(e.detected_issues) ? e.detected_issues : [];
      for (const it of arr) {
        const k = String(it).slice(0, 60);
        issues.set(k, (issues.get(k) ?? 0) + 1);
      }
    }
    const topIssues = Array.from(issues.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return {
      total: evals.length,
      avgOverall: Math.round(avg('score_overall')),
      avgClarity: Math.round(avg('score_clarity')),
      avgTone: Math.round(avg('score_tone')),
      avgConversion: Math.round(avg('score_conversion_potential')),
      topIssues,
    };
  }, [evals]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Qualidade da IA</CardTitle>
                <CardDescription>
                  Métricas LLM-as-judge das suas conversas + experimentos A/B de prompts.
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => trigger.mutate(undefined)} disabled={trigger.isPending}>
              <Sparkles className="h-4 w-4 mr-1" />
              {trigger.isPending ? 'Avaliando…' : 'Avaliar últimas 24h'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="experiments">Experimentos A/B</TabsTrigger>
          <TabsTrigger value="evaluations">Avaliações recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Avaliações"
              value={stats.total}
              hint={isLoading ? 'carregando…' : 'últimas 200'}
              icon={Activity}
            />
            <MetricCard
              label="Score geral"
              value={stats.avgOverall || '—'}
              hint="média 0-100"
              icon={TrendingUp}
            />
            <MetricCard
              label="Clareza"
              value={stats.avgClarity || '—'}
              icon={Sparkles}
            />
            <MetricCard
              label="Pot. de conversão"
              value={stats.avgConversion || '—'}
              icon={TrendingUp}
            />
          </div>

          {stats.topIssues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top problemas detectados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.topIssues.map((i) => (
                  <div
                    key={i.label}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                  >
                    <span className="text-sm truncate">{i.label}</span>
                    <Badge variant="secondary">{i.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="experiments" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Crie variantes do prompt do agente e o sistema sortearia automaticamente por lead.
            </p>
            <Button
              size="sm"
              onClick={() =>
                setEditingExp({
                  name: '',
                  status: 'draft',
                  primary_metric: 'score_overall',
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Novo experimento
            </Button>
          </div>

          {experiments.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhum experimento ainda. Crie um para testar variações de prompt em produção.
              </CardContent>
            </Card>
          )}

          {experiments.map((exp) => {
            const agent = agents.find((a) => a.id === exp.agent_id);
            return (
              <Card key={exp.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{exp.name}</CardTitle>
                        <Badge
                          variant={exp.status === 'running' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {exp.status}
                        </Badge>
                        {agent && (
                          <Badge variant="secondary" className="text-xs">
                            {agent.name}
                          </Badge>
                        )}
                      </div>
                      {exp.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {exp.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenExp(exp)}
                      >
                        <TestTube2 className="h-4 w-4 mr-1" /> Variantes
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingExp(exp)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          upsertExp.mutate({
                            id: exp.id,
                            status: exp.status === 'running' ? 'paused' : 'running',
                          })
                        }
                      >
                        {exp.status === 'running' ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover experimento "${exp.name}"?`))
                            deleteExp.mutate(exp.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="evaluations" className="space-y-2">
          {evals.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma avaliação ainda. Clique em "Avaliar últimas 24h" para gerar.
              </CardContent>
            </Card>
          )}
          {evals.slice(0, 30).map((e) => (
            <Card key={e.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default">{fmtScore(e.score_overall)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        clareza {fmtScore(e.score_clarity)} · tom {fmtScore(e.score_tone)} · objetiv. {fmtScore(e.score_objectivity)} · acc. {fmtScore(e.score_accuracy)} · conv. {fmtScore(e.score_conversion_potential)}
                      </span>
                    </div>
                    {e.summary && (
                      <p className="text-sm mt-1 line-clamp-2">{e.summary}</p>
                    )}
                    {e.improvement_suggestions && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        💡 {e.improvement_suggestions}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog Experimento */}
      <Dialog open={!!editingExp} onOpenChange={(o) => !o && setEditingExp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExp?.id ? 'Editar experimento' : 'Novo experimento A/B'}
            </DialogTitle>
            <DialogDescription>
              Defina o agente alvo. Variantes são gerenciadas em "Variantes" depois de criar.
            </DialogDescription>
          </DialogHeader>
          {editingExp && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingExp.name ?? ''}
                  onChange={(e) =>
                    setEditingExp({ ...editingExp, name: e.target.value })
                  }
                  placeholder="Ex: Tom mais consultivo no SDR"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={editingExp.description ?? ''}
                  onChange={(e) =>
                    setEditingExp({ ...editingExp, description: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Agente alvo</Label>
                <Select
                  value={editingExp.agent_id ?? 'all'}
                  onValueChange={(v) =>
                    setEditingExp({ ...editingExp, agent_id: v === 'all' ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editingExp.status ?? 'draft'}
                  onValueChange={(v) =>
                    setEditingExp({ ...editingExp, status: v as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="running">Rodando</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="finished">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExp(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editingExp?.name) return;
                upsertExp.mutate(editingExp as any, {
                  onSuccess: () => setEditingExp(null),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Variantes */}
      <VariantsDialog experiment={openExp} onClose={() => setOpenExp(null)} />
    </div>
  );
}

function VariantsDialog({
  experiment,
  onClose,
}: {
  experiment: PromptExperiment | null;
  onClose: () => void;
}) {
  const { data: variants = [] } = usePromptVariants(experiment?.id ?? null);
  const upsert = useUpsertVariant();
  const remove = useDeleteVariant();
  const [editing, setEditing] = useState<Partial<PromptVariant> | null>(null);

  if (!experiment) return null;

  return (
    <Dialog open={!!experiment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Variantes — {experiment.name}</DialogTitle>
          <DialogDescription>
            Pesos definem a distribuição. A escolha por lead é determinística (mesmo lead → mesma variante).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {variants.map((v) => {
            const avg =
              v.evaluations_count > 0 ? Math.round(v.total_score / v.evaluations_count) : null;
            return (
              <Card key={v.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge>{v.label}</Badge>
                        <Badge variant="outline" className="text-xs">
                          peso {v.weight}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {v.prompt_mode}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {v.impressions} impressões
                          {avg != null ? ` · score médio ${avg}` : ''}
                        </span>
                      </div>
                      {v.prompt_override && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {v.prompt_override}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover variante ${v.label}?`)) remove.mutate(v.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              setEditing({
                experiment_id: experiment.id,
                label: String.fromCharCode(65 + variants.length),
                weight: 50,
                prompt_mode: 'append',
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar variante
          </Button>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Editar variante' : 'Nova variante'}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Rótulo</Label>
                    <Input
                      value={editing.label ?? ''}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Peso</Label>
                    <Input
                      type="number"
                      value={editing.weight ?? 50}
                      onChange={(e) =>
                        setEditing({ ...editing, weight: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Modo</Label>
                  <Select
                    value={editing.prompt_mode}
                    onValueChange={(v) =>
                      setEditing({ ...editing, prompt_mode: v as any })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">Anexar ao prompt do agente</SelectItem>
                      <SelectItem value="replace">Substituir prompt do agente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prompt</Label>
                  <Textarea
                    rows={6}
                    value={editing.prompt_override ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, prompt_override: e.target.value })
                    }
                    placeholder="Texto adicional ou prompt completo dependendo do modo"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!editing?.label) return;
                  upsert.mutate(editing as any, { onSuccess: () => setEditing(null) });
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
