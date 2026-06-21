import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Link2, MessageSquareText, BookOpen, ExternalLink } from 'lucide-react';
import { ProductAgent, SupportLink, SupportQuickAnswer } from '@/types/agents';
import { AgentTrainingSection } from './AgentTrainingSection';

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
  agentId?: string;
}

export function AgentSupportTab({ formData, onChange, agentId }: Props) {
  const tc = (formData.tool_configs || {}) as Record<string, unknown>;
  const links: SupportLink[] = Array.isArray(tc.support_links) ? (tc.support_links as SupportLink[]) : [];
  const quick: SupportQuickAnswer[] = Array.isArray(tc.support_quick_answers) ? (tc.support_quick_answers as SupportQuickAnswer[]) : [];

  const [newLink, setNewLink] = useState<SupportLink>({ title: '', url: '', description: '' });
  const [newQA, setNewQA] = useState<SupportQuickAnswer>({ question: '', answer: '' });

  const updateToolConfigs = (patch: Record<string, unknown>) => {
    onChange({ tool_configs: { ...(formData.tool_configs || {}), ...patch } });
  };

  const addLink = () => {
    if (!newLink.title.trim() || !newLink.url.trim()) return;
    updateToolConfigs({ support_links: [...links, { ...newLink }] });
    setNewLink({ title: '', url: '', description: '' });
  };
  const removeLink = (i: number) =>
    updateToolConfigs({ support_links: links.filter((_, idx) => idx !== i) });

  const addQA = () => {
    if (!newQA.question.trim() || !newQA.answer.trim()) return;
    updateToolConfigs({ support_quick_answers: [...quick, { ...newQA }] });
    setNewQA({ question: '', answer: '' });
  };
  const removeQA = (i: number) =>
    updateToolConfigs({ support_quick_answers: quick.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-start gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Base de Suporte deste Agente</p>
            <p>Materiais técnicos, links úteis e respostas rápidas que serão usados <strong>exclusivamente por este agente de Suporte</strong> ao responder dúvidas.</p>
          </div>
        </div>
      </div>

      {/* Materiais (PDFs, docs) */}
      {agentId ? (
        <AgentTrainingSection agentId={agentId} productId={formData.product_id || ''} />
      ) : (
        <Card>
          <CardContent className="text-center py-6 text-sm text-muted-foreground">
            Salve o agente primeiro para subir PDFs e documentos.
          </CardContent>
        </Card>
      )}

      {/* Links úteis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Links Úteis ({links.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Título (ex: Tutorial de setup)"
              value={newLink.title}
              onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="https://docs.empresa.com/..."
              value={newLink.url}
              onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Descrição curta (opcional)"
                value={newLink.description || ''}
                onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                className="h-8 text-sm flex-1"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={addLink}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {links.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhum link cadastrado. O agente só usará PDFs.
            </p>
          ) : (
            <div className="space-y-1.5">
              {links.map((l, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-background gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{l.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{l.url}</p>
                    {l.description && <p className="text-xs text-muted-foreground italic">{l.description}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => removeLink(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick answers / FAQ inline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" />
            Respostas Rápidas / FAQ ({quick.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Pergunta</Label>
              <Input
                placeholder="Ex: Como faço para resetar minha senha?"
                value={newQA.question}
                onChange={(e) => setNewQA({ ...newQA, question: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Resposta</Label>
              <Textarea
                placeholder="Resposta direta que o agente vai usar..."
                value={newQA.answer}
                onChange={(e) => setNewQA({ ...newQA, answer: e.target.value })}
                rows={2}
                className="text-sm"
              />
            </div>
            <Button size="sm" onClick={addQA} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar resposta
            </Button>
          </div>

          {quick.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Sem FAQ inline. Use para perguntas batidas que não precisam virar PDF.
            </p>
          ) : (
            <div className="space-y-2">
              {quick.map((q, i) => (
                <div key={i} className="p-2 rounded-lg border bg-background space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-xs">P</Badge>
                    <span className="text-sm font-medium flex-1">{q.question}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeQA(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-start gap-2 pl-1">
                    <Badge variant="secondary" className="text-xs">R</Badge>
                    <span className="text-xs text-muted-foreground">{q.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
