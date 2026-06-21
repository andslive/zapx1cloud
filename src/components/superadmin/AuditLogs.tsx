import { useState } from 'react';
import { 
  ScrollText, 
  Search,
  User,
  Calendar,
  Filter
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuditLogs } from '@/hooks/useSuperAdmin';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AuditLogs() {
  const [search, setSearch] = useState('');
  const { data: logs, isLoading } = useAuditLogs(100);

  const filteredLogs = logs?.filter((log: any) => {
    return log.action?.toLowerCase().includes(search.toLowerCase()) ||
           log.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
           log.entity_type?.toLowerCase().includes(search.toLowerCase());
  }) || [];

  const getEntityBadge = (type: string) => {
    switch (type) {
      case 'organization':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Empresa</Badge>;
      case 'subscription':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Assinatura</Badge>;
      case 'user':
        return <Badge variant="outline" className="bg-violet-500/10 text-violet-500 border-violet-500/20">Usuário</Badge>;
      case 'platform_settings':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Config</Badge>;
      case 'platform_email_settings':
        return <Badge variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/20">E-mail</Badge>;
      default:
        return type ? <Badge variant="secondary">{type}</Badge> : null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Logs de Auditoria</h1>
        <p className="text-muted-foreground">Histórico de ações realizadas na plataforma</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ação, usuário ou tipo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Atividades Recentes
          </CardTitle>
          <CardDescription>
            Últimas 100 ações registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <ScrollText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum log encontrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log: any) => (
                <div 
                  key={log.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{log.action}</p>
                      {getEntityBadge(log.entity_type)}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {log.profiles?.full_name || 'Sistema'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {log.ip_address && (
                        <span className="text-xs">IP: {log.ip_address}</span>
                      )}
                    </div>
                    
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
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
