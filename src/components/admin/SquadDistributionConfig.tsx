import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useUserStatus } from '@/hooks/useUserStatus';
import { Zap, Users, Clock, CircleDot } from 'lucide-react';
import { toast } from 'sonner';

interface SquadDistributionConfigProps {
  squadId: string;
  organizationId: string;
}

interface DistConfig {
  method: string;
  auto_reassign: boolean;
  max_accept_time_minutes: number;
}

export function SquadDistributionConfig({ squadId, organizationId }: SquadDistributionConfigProps) {
  const [config, setConfig] = useState<DistConfig>({
    method: 'round_robin',
    auto_reassign: true,
    max_accept_time_minutes: 5,
  });
  const [pendingCount, setPendingCount] = useState(0);
  const { teamStatuses } = useUserStatus();

  const onlineCount = teamStatuses.filter(s => s.status === 'online').length;

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from('distribution_config')
        .select('*')
        .eq('squad_id', squadId)
        .maybeSingle();

      if (data) {
        setConfig({
          method: data.method,
          auto_reassign: data.auto_reassign,
          max_accept_time_minutes: data.max_accept_time_minutes || 5,
        });
      }
    };

    const fetchPending = async () => {
      const { count } = await supabase
        .from('lead_queue')
        .select('*', { count: 'exact', head: true })
        .eq('squad_id', squadId)
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };

    fetchConfig();
    fetchPending();
  }, [squadId]);

  const updateConfig = async (updates: Partial<DistConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    const { error } = await supabase
      .from('distribution_config')
      .upsert({
        squad_id: squadId,
        organization_id: organizationId,
        method: newConfig.method,
        auto_reassign: newConfig.auto_reassign,
        max_accept_time_minutes: newConfig.max_accept_time_minutes,
      }, { onConflict: 'squad_id' });

    if (error) {
      toast.error('Erro ao salvar configuração');
      console.error(error);
    } else {
      toast.success('Configuração salva');
    }
  };

  const methodLabels: Record<string, string> = {
    round_robin: 'Round Robin',
    least_busy: 'Menor Carga',
    performance: 'Por Performance',
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Auto Dispatch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status indicators */}
        <div className="flex gap-3">
          <Badge variant="outline" className="gap-1.5">
            <CircleDot className="h-3 w-3 text-green-500" />
            {onlineCount} online
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Clock className="h-3 w-3 text-yellow-500" />
            {pendingCount} pendentes
          </Badge>
        </div>

        {/* Distribution method */}
        <div className="space-y-2">
          <Label>Método de Distribuição</Label>
          <Select
            value={config.method}
            onValueChange={(v) => updateConfig({ method: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin - Sequencial equilibrado</SelectItem>
              <SelectItem value="least_busy">Menor Carga - Menos leads ativos</SelectItem>
              <SelectItem value="performance">Performance - Ranking por resultados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Auto reassign toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Redistribuir automaticamente</Label>
            <p className="text-xs text-muted-foreground">
              Atribuir leads pendentes quando alguém ficar online
            </p>
          </div>
          <Switch
            checked={config.auto_reassign}
            onCheckedChange={(v) => updateConfig({ auto_reassign: v })}
          />
        </div>

        {/* Max accept time */}
        <div className="space-y-2">
          <Label>Tempo máximo para aceite (min)</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={config.max_accept_time_minutes}
            onChange={(e) => updateConfig({ max_accept_time_minutes: parseInt(e.target.value) || 5 })}
            className="w-24"
          />
        </div>
      </CardContent>
    </Card>
  );
}
