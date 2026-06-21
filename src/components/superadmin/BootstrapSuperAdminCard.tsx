import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function BootstrapSuperAdminCard() {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bootstrap-super-admin');
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao sincronizar');

      if (data.promoted) {
        toast.success(`Promovido a Super Admin: ${data.email}`);
      } else if (data.already_had) {
        toast.info(`${data.email} já era Super Admin`);
      } else {
        toast.warning(data.message || 'Usuário não encontrado ainda');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao sincronizar Super Admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Super Admin do Sistema
        </CardTitle>
        <CardDescription>
          Promove o e-mail definido no segredo <code className="text-xs bg-muted px-1 py-0.5 rounded">SUPER_ADMIN_EMAIL</code> a Super Admin.
          Útil quando o usuário foi criado antes da configuração do segredo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleSync} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Sincronizar Super Admin
        </Button>
      </CardContent>
    </Card>
  );
}
