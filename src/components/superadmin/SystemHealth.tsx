import { 
  Activity, 
  CheckCircle,
  Database,
  Server,
  Wifi,
  Clock,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function SystemHealth() {
  // In a real app, these would come from actual health checks
  const services = [
    { 
      name: 'API Principal', 
      status: 'operational', 
      uptime: 99.99, 
      latency: '45ms',
      icon: Server 
    },
    { 
      name: 'Banco de Dados', 
      status: 'operational', 
      uptime: 99.95, 
      latency: '12ms',
      icon: Database 
    },
    { 
      name: 'Autenticação', 
      status: 'operational', 
      uptime: 99.99, 
      latency: '35ms',
      icon: Wifi 
    },
    { 
      name: 'Edge Functions', 
      status: 'operational', 
      uptime: 99.90, 
      latency: '120ms',
      icon: Zap 
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Operacional
          </Badge>
        );
      case 'degraded':
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
            <Activity className="h-3 w-3 mr-1" />
            Degradado
          </Badge>
        );
      case 'down':
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            Fora do Ar
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const allOperational = services.every(s => s.status === 'operational');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Saúde do Sistema</h1>
        <p className="text-muted-foreground">Status dos serviços da plataforma</p>
      </div>

      {/* Overall Status */}
      <Card className={allOperational ? 'border-emerald-500/50' : 'border-amber-500/50'}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              allOperational ? 'bg-emerald-500/10' : 'bg-amber-500/10'
            }`}>
              <Activity className={`h-8 w-8 ${
                allOperational ? 'text-emerald-500' : 'text-amber-500'
              }`} />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${
                allOperational ? 'text-emerald-500' : 'text-amber-500'
              }`}>
                {allOperational ? 'Todos os Sistemas Operacionais' : 'Alguns Serviços Degradados'}
              </h2>
              <p className="text-muted-foreground">
                {allOperational 
                  ? 'Não há problemas detectados no momento'
                  : 'Estamos trabalhando para resolver os problemas'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((service) => (
          <Card key={service.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <service.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{service.name}</CardTitle>
                </div>
                {getStatusBadge(service.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Uptime</p>
                  <p className="text-lg font-semibold">{service.uptime}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Latência</p>
                  <p className="text-lg font-semibold">{service.latency}</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Disponibilidade últimos 30 dias</span>
                  <span>{service.uptime}%</span>
                </div>
                <Progress value={service.uptime} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Incidents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Incidentes Recentes
          </CardTitle>
          <CardDescription>Últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
            <p className="text-muted-foreground">Nenhum incidente registrado</p>
            <p className="text-sm text-muted-foreground">
              A plataforma está funcionando normalmente
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
