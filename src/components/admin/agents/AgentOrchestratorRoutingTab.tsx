import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Compass, AlertTriangle, CheckCircle2, Package, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AGENT_TYPE_LABELS, AgentType, ProductAgent } from '@/types/agents';
import { useMemo } from 'react';

interface Props {
  currentAgentId?: string;
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

interface AgentRow {
  id: string;
  name: string;
  agent_type: string;
  product_id: string | null;
  is_active: boolean;
}

interface ProductRow {
  id: string;
  name: string;
  status: string | null;
}

const EXCLUDED_PRODUCT_STATUSES = new Set(['archived', 'deleted', 'inactive']);

export function AgentOrchestratorRoutingTab({ currentAgentId, formData, onChange }: Props) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const { data, isLoading } = useQuery({
    queryKey: ['orchestrator-routing-matrix', orgId],
    queryFn: async (): Promise<{ products: ProductRow[]; agents: AgentRow[] }> => {
      if (!orgId) return { products: [], agents: [] };
      const sb = supabase as any;
      const [productsRes, agentsRes] = await Promise.all([
        sb
          .from('products')
          .select('id, name, status')
          .eq('organization_id', orgId)
          .order('name'),
        sb
          .from('product_agents')
          .select('id, name, agent_type, product_id, is_active')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name'),
      ]);
      // Aceita qualquer status exceto archived/deleted/inactive (e null = ok)
      const products = (productsRes.data || []).filter(
        (p: ProductRow) => !p.status || !EXCLUDED_PRODUCT_STATUSES.has(p.status)
      );
      return {
        products,
        agents: (agentsRes.data || []) as AgentRow[],
      };
    },
    enabled: !!orgId,
  });

  const products = data?.products || [];
  const agents = data?.agents || [];

  // Todos os agentes ativos da org, exceto o próprio e outros orquestradores
  const routableAgents = useMemo(
    () =>
      agents.filter(
        (a) => a.id !== currentAgentId && a.agent_type !== 'orchestrator'
      ),
    [agents, currentAgentId]
  );

  const globalAgents = useMemo(
    () => routableAgents.filter((a) => !a.product_id),
    [routableAgents]
  );

  // Agentes vinculados a produtos, agrupados por produto
  const agentsByProduct = useMemo(() => {
    const grouped = new Map<string, AgentRow[]>();
    routableAgents
      .filter((a) => !!a.product_id)
      .forEach((a) => {
        const list = grouped.get(a.product_id!) || [];
        list.push(a);
        grouped.set(a.product_id!, list);
      });
    // Ordenar por nome do produto, considerando só produtos visíveis
    return products
      .map((p) => ({ product: p, agents: grouped.get(p.id) || [] }))
      .filter((g) => g.agents.length > 0);
  }, [routableAgents, products]);

  const productAgentsCount = useMemo(
    () => routableAgents.filter((a) => !!a.product_id).length,
    [routableAgents]
  );

  // tool_configs.routing_products / routing_agents — array de IDs incluídos no roteamento.
  // Quando o array está ausente (undefined), tratamos como "todos selecionados" por padrão.
  const tc = (formData.tool_configs as any) || {};
  const selectedProductIds: string[] | undefined = tc.routing_products;
  const selectedAgentIds: string[] | undefined = tc.routing_agents;

  const isProductSelected = (id: string) =>
    selectedProductIds === undefined ? true : selectedProductIds.includes(id);
  const isAgentSelected = (id: string) =>
    selectedAgentIds === undefined ? true : selectedAgentIds.includes(id);

  const toggleProduct = (id: string, checked: boolean) => {
    const base =
      selectedProductIds === undefined ? products.map((p) => p.id) : [...selectedProductIds];
    const next = checked ? Array.from(new Set([...base, id])) : base.filter((x) => x !== id);
    onChange({
      tool_configs: { ...tc, routing_products: next },
    });
  };

  const toggleAgent = (id: string, checked: boolean) => {
    const base =
      selectedAgentIds === undefined ? routableAgents.map((a) => a.id) : [...selectedAgentIds];
    const next = checked ? Array.from(new Set([...base, id])) : base.filter((x) => x !== id);
    onChange({
      tool_configs: { ...tc, routing_agents: next },
    });
  };

  const selectAllProducts = () =>
    onChange({ tool_configs: { ...tc, routing_products: products.map((p) => p.id) } });
  const clearProducts = () =>
    onChange({ tool_configs: { ...tc, routing_products: [] } });

  // Helpers para seleção em grupos de agentes
  const setAgentsSelection = (idsToSet: string[], include: boolean) => {
    const base =
      selectedAgentIds === undefined ? routableAgents.map((a) => a.id) : [...selectedAgentIds];
    const set = new Set(base);
    if (include) {
      idsToSet.forEach((id) => set.add(id));
    } else {
      idsToSet.forEach((id) => set.delete(id));
    }
    onChange({ tool_configs: { ...tc, routing_agents: Array.from(set) } });
  };

  const selectAllGlobalAgents = () =>
    setAgentsSelection(globalAgents.map((a) => a.id), true);
  const clearGlobalAgents = () =>
    setAgentsSelection(globalAgents.map((a) => a.id), false);

  const selectAllProductAgents = () =>
    setAgentsSelection(
      agentsByProduct.flatMap((g) => g.agents.map((a) => a.id)),
      true
    );
  const clearProductAgents = () =>
    setAgentsSelection(
      agentsByProduct.flatMap((g) => g.agents.map((a) => a.id)),
      false
    );

  const selectedProductCount = products.filter((p) => isProductSelected(p.id)).length;
  const selectedGlobalAgentCount = globalAgents.filter((a) => isAgentSelected(a.id)).length;
  const selectedProductAgentCount = routableAgents.filter(
    (a) => !!a.product_id && isAgentSelected(a.id)
  ).length;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-start gap-2">
          <Compass className="h-4 w-4 text-primary mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Matriz de Roteamento</p>
            <p>
              Selecione quais produtos e agentes este Orquestrador pode rotear. Itens
              desmarcados serão ignorados na hora de transferir a conversa.
            </p>
          </div>
        </div>
      </div>

      {/* Produtos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos disponíveis ({selectedProductCount}/{products.length})
            </CardTitle>
            {products.length > 0 && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={selectAllProducts}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={clearProducts}
                >
                  Nenhum
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
          ) : products.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum produto cadastrado. Crie produtos primeiro para o Orquestrador ter para onde rotear.
            </p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => {
                const productAgents = agents.filter((a) => a.product_id === p.id);
                const hasSDR = productAgents.some((a) => a.agent_type === 'sdr');
                const hasCloser = productAgents.some((a) => a.agent_type === 'closer');
                const ok = hasSDR && hasCloser;
                const checked = isProductSelected(p.id);
                return (
                  <label
                    key={p.id}
                    htmlFor={`routing-product-${p.id}`}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      id={`routing-product-${p.id}`}
                      checked={checked}
                      onCheckedChange={(v) => toggleProduct(p.id, v === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        {ok ? (
                          <Badge variant="default" className="gap-1 text-xs shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Cobertura completa
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs border-warning text-warning shrink-0"
                          >
                            <AlertTriangle className="h-3 w-3" /> Faltam especialistas
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {productAgents.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">
                            Sem especialistas — Orquestrador atenderá direto.
                          </span>
                        ) : (
                          productAgents.map((a) => (
                            <Badge key={a.id} variant="secondary" className="text-xs">
                              {AGENT_TYPE_LABELS[a.agent_type as AgentType] || a.agent_type}: {a.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agentes Globais */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Agentes Globais ({selectedGlobalAgentCount}/{globalAgents.length})
            </CardTitle>
            {globalAgents.length > 0 && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={selectAllGlobalAgents}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={clearGlobalAgents}
                >
                  Nenhum
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
          ) : globalAgents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Sem agentes globais (Suporte / Financeiro / Administrativo). Crie um para o Orquestrador rotear suporte/financeiro.
            </p>
          ) : (
            <div className="space-y-2">
              {globalAgents.map((a) => {
                const checked = isAgentSelected(a.id);
                return (
                  <label
                    key={a.id}
                    htmlFor={`routing-agent-${a.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      id={`routing-agent-${a.id}`}
                      checked={checked}
                      onCheckedChange={(v) => toggleAgent(a.id, v === true)}
                    />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {AGENT_TYPE_LABELS[a.agent_type as AgentType] || a.agent_type}
                      </Badge>
                      <span className="text-sm font-medium truncate">{a.name}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agentes por Produto */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Agentes por Produto ({selectedProductAgentCount}/{productAgentsCount})
            </CardTitle>
            {productAgentsCount > 0 && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={selectAllProductAgents}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={clearProductAgents}
                >
                  Nenhum
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
          ) : agentsByProduct.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum agente vinculado a produtos. Crie SDRs / Closers nos produtos para o Orquestrador rotear.
            </p>
          ) : (
            <div className="space-y-4">
              {agentsByProduct.map(({ product, agents: prodAgents }) => {
                const groupIds = prodAgents.map((a) => a.id);
                const selectedInGroup = prodAgents.filter((a) => isAgentSelected(a.id)).length;
                return (
                  <div key={product.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {product.name}
                        </span>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {selectedInGroup}/{prodAgents.length}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setAgentsSelection(groupIds, true)}
                        >
                          Todos
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setAgentsSelection(groupIds, false)}
                        >
                          Nenhum
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-1">
                      {prodAgents.map((a) => {
                        const checked = isAgentSelected(a.id);
                        return (
                          <label
                            key={a.id}
                            htmlFor={`routing-agent-${a.id}`}
                            className="flex items-center gap-3 p-2.5 rounded-lg border bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                          >
                            <Checkbox
                              id={`routing-agent-${a.id}`}
                              checked={checked}
                              onCheckedChange={(v) => toggleAgent(a.id, v === true)}
                            />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">
                                {AGENT_TYPE_LABELS[a.agent_type as AgentType] || a.agent_type}
                              </Badge>
                              <span className="text-sm font-medium truncate">{a.name}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
