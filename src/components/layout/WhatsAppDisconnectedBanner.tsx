import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

/**
 * Banner global de alerta quando a empresa tem instâncias Evolution
 * configuradas, mas nenhuma está `connected`. Aparece pra qualquer
 * usuário da org — assim quem comprou via Doppus/Cakto/Hotmart e ficou
 * sem mensagem de pós-venda dispara o alerta.
 */
export function WhatsAppDisconnectedBanner() {
  const { profile, roles } = useAuth();
  const navigate = useNavigate();
  const orgId = profile?.organization_id;

  const { data } = useQuery({
    queryKey: ['evolution-instances-health', orgId],
    queryFn: async () => {
      if (!orgId) return { total: 0, connected: 0 };
      const { data: rows } = await supabase
        .from('evolution_instances')
        .select('status')
        .eq('organization_id', orgId);
      const total = rows?.length ?? 0;
      const connected = (rows ?? []).filter((r: any) => r.status === 'connected').length;
      return { total, connected };
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data || data.total === 0 || data.connected > 0) return null;

  const canManage = roles.includes('admin') || roles.includes('manager');

  return (
    <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-destructive">WhatsApp desconectado.</span>{' '}
        <span className="text-foreground/80">
          Mensagens automáticas de pós-venda e atendimento não estão sendo enviadas.
          {canManage ? ' Reconecte a instância para retomar.' : ' Avise um admin.'}
        </span>
      </div>
      {canManage && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => navigate('/admin?tab=integrations')}
        >
          Reconectar
        </Button>
      )}
    </div>
  );
}
