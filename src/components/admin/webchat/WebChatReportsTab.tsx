import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWebChatConversations } from '@/hooks/useWebChat';
import { BarChart3, MessageSquare, Clock, Users, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function WebChatReportsTab() {
  const { data: allConversations, isLoading } = useWebChatConversations({ tab: 'all', limit: 200 });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const conversations = allConversations || [];
  
  // Calculate metrics
  const totalConversations = conversations.length;
  const activeConversations = conversations.filter(c => 
    c.status === 'bot_active' || c.status === 'waiting_human' || c.status === 'human_active'
  ).length;
  const waitingConversations = conversations.filter(c => c.status === 'waiting_human').length;
  const closedConversations = conversations.filter(c => c.status === 'closed').length;

  // Calculate average first response time (for conversations that have first_response_at)
  const conversationsWithResponse = conversations.filter(c => c.first_response_at && c.created_at);
  const avgResponseTime = conversationsWithResponse.length > 0
    ? conversationsWithResponse.reduce((sum, c) => {
        const created = new Date(c.created_at).getTime();
        const firstResponse = new Date(c.first_response_at!).getTime();
        return sum + (firstResponse - created);
      }, 0) / conversationsWithResponse.length / 1000 / 60 // in minutes
    : 0;

  // Bot resolution rate (conversations that stayed with bot and closed)
  const botResolvedCount = conversations.filter(c => 
    c.status === 'closed' && !c.assigned_user_id
  ).length;
  const botResolutionRate = closedConversations > 0 
    ? Math.round((botResolvedCount / closedConversations) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Conversas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConversations}</div>
            <p className="text-xs text-muted-foreground">
              {activeConversations} ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Atendimento</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waitingConversations}</div>
            <p className="text-xs text-muted-foreground">
              visitantes na fila
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Resposta</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgResponseTime > 0 ? `${avgResponseTime.toFixed(1)}min` : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              primeira resposta humana
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolvido pelo Bot</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{botResolutionRate}%</div>
            <p className="text-xs text-muted-foreground">
              das conversas fechadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Distribuição por Status
          </CardTitle>
          <CardDescription>Visão geral do estado das conversas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Com Bot</span>
                <span className="font-medium">
                  {conversations.filter(c => c.status === 'bot_active').length}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ 
                    width: `${totalConversations > 0 
                      ? (conversations.filter(c => c.status === 'bot_active').length / totalConversations) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Aguardando Humano</span>
                <span className="font-medium">{waitingConversations}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-yellow-500 rounded-full transition-all"
                  style={{ 
                    width: `${totalConversations > 0 
                      ? (waitingConversations / totalConversations) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Em Atendimento</span>
                <span className="font-medium">
                  {conversations.filter(c => c.status === 'human_active').length}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ 
                    width: `${totalConversations > 0 
                      ? (conversations.filter(c => c.status === 'human_active').length / totalConversations) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Fechadas</span>
                <span className="font-medium">{closedConversations}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gray-500 rounded-full transition-all"
                  style={{ 
                    width: `${totalConversations > 0 
                      ? (closedConversations / totalConversations) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon */}
      <Card>
        <CardHeader>
          <CardTitle>Mais Relatórios (Em Breve)</CardTitle>
          <CardDescription>
            Estatísticas avançadas serão adicionadas nas próximas versões
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Conversas por hora/dia da semana</li>
            <li>• Performance por atendente</li>
            <li>• Leads gerados via chat</li>
            <li>• Taxa de conversão chat → venda</li>
            <li>• Análise de sentimento das conversas</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
