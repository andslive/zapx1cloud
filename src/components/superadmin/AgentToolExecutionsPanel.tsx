import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useAgentToolExecutions,
  useToolExecutionStats,
  type AgentToolExecution,
} from '@/hooks/useAgentToolExecutions';
import { Activity, AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AgentToolExecutionsPanel() {
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const [selected, setSelected] = useState<AgentToolExecution | null>(null);

  const { data: executions, isLoading } = useAgentToolExecutions({
    successOnly: filter === 'success',
    errorsOnly: filter === 'error',
    limit: 200,
  });
  const { data: stats } = useToolExecutionStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Execuções de Ferramentas (IA)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Auditoria de todas as ações que os agentes executaram nos últimos 7 dias.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Execuções (7d)"
          value={stats?.total ?? 0}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Sucesso"
          value={stats?.successes ?? 0}
          accent="text-emerald-500"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="Erros"
          value={stats?.errors ?? 0}
          accent="text-destructive"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Tempo médio"
          value={`${Math.round(stats?.avgDuration ?? 0)}ms`}
        />
      </div>

      {/* Por ferramenta */}
      {stats?.byTool && Object.keys(stats.byTool).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Uso por ferramenta (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byTool).map(([name, s]) => (
                <Badge key={name} variant="secondary" className="text-xs">
                  {name}: {s.count}
                  {s.errors > 0 && <span className="ml-1 text-destructive">({s.errors} erros)</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="success">Sucessos</TabsTrigger>
          <TabsTrigger value="error">Erros</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ferramenta</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (executions?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma execução registrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {executions?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(e.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.tool_name}</code>
                  </TableCell>
                  <TableCell className="text-sm">{e.agent_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.channel ?? '—'}</TableCell>
                  <TableCell>
                    {e.success ? (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Erro</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.duration_ms ?? 0}ms</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(e)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <code className="text-sm">{selected?.tool_name}</code>
              {selected?.success ? (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                  Sucesso
                </Badge>
              ) : (
                <Badge variant="destructive">Erro</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 text-sm">
              {selected?.error_message && (
                <div>
                  <p className="font-semibold text-destructive mb-1">Erro</p>
                  <pre className="bg-destructive/10 text-destructive text-xs p-3 rounded whitespace-pre-wrap">
                    {selected.error_message}
                  </pre>
                </div>
              )}
              <div>
                <p className="font-semibold mb-1">Input</p>
                <pre className="bg-muted text-xs p-3 rounded whitespace-pre-wrap break-all">
                  {JSON.stringify(selected?.input, null, 2)}
                </pre>
              </div>
              {selected?.output != null && (
                <div>
                  <p className="font-semibold mb-1">Output</p>
                  <pre className="bg-muted text-xs p-3 rounded whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.output, null, 2)}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>Agente: {selected?.agent_name ?? '—'}</div>
                <div>Canal: {selected?.channel ?? '—'}</div>
                <div>Lead: {selected?.lead_id ?? '—'}</div>
                <div>Conversa: {selected?.conversation_id ?? '—'}</div>
                <div>Duração: {selected?.duration_ms}ms</div>
                <div>Custo est.: {(selected?.estimated_cost_cents ?? 0) / 100} BRL</div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <p className={`text-2xl font-bold mt-2 ${accent ?? 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
