import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Bell, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdminStatusNotificationConfigProps {
  organizationId?: string;
}

export function AdminStatusNotificationConfig({ organizationId }: AdminStatusNotificationConfigProps) {
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (organizationId && open) {
      loadSettings();
    }
  }, [organizationId, open]);

  async function loadSettings() {
    try {
      setLoading(true);
      // Load from central table admin_status_alert_configs
      const { data, error } = await supabase
        .from('admin_status_alert_configs' as any)
        .select('phone_numbers, enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setPhone((data as any).phone_numbers?.[0] || '');
        setEnabled((data as any).enabled ?? true);
      } else {
        // Fallback to check legacy field in organizations
        const { data: orgData } = await supabase
          .from('organizations')
          .select('admin_status_notify_phone, admin_status_alerts_enabled')
          .eq('id', organizationId)
          .single();
        
        if (orgData?.admin_status_notify_phone) {
          setPhone(orgData.admin_status_notify_phone);
          setEnabled(orgData.admin_status_alerts_enabled ?? true);
        }
      }
    } catch (error: any) {
      console.error('Error loading notification settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!organizationId) return;
    try {
      setLoading(true);
      const cleanPhone = phone.trim();
      
      // Update central table admin_status_alert_configs
      const { error } = await supabase
        .from('admin_status_alert_configs' as any)
        .upsert({ 
          organization_id: organizationId,
          phone_numbers: cleanPhone ? [cleanPhone] : [],
          enabled: enabled
        }, { onConflict: 'organization_id' });

      if (error) throw error;

      // Sync legacy field for compatibility
      await supabase
        .from('organizations')
        .update({ 
          admin_status_notify_phone: cleanPhone,
          admin_status_alerts_enabled: enabled 
        } as any)
        .eq('id', organizationId);

      toast.success('Configuração salva com sucesso');
      setOpen(false);
    } catch (error: any) {
      toast.error('Erro ao salvar configuração: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    const adminStatusNotifyPhone = phone.trim();
    
    if (!adminStatusNotifyPhone) {
      toast.error("Informe um telefone para testar o alerta");
      return;
    }

    try {
      setTesting(true);
      const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
        body: {
          action: "test_admin_alert",
          phone: adminStatusNotifyPhone,
          organization_id: organizationId
        }
      });

      if (error) {
        toast.error(JSON.stringify(error, null, 2));
        return;
      }

      if (data?.success || data?.ok) {
        toast.success("Alerta de teste enviado com sucesso");
      } else {
        toast.error(data?.message || data?.error || "Falha ao enviar alerta");
      }
    } catch (error: any) {
      toast.error("Erro inesperado: " + error.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bell className="h-4 w-4" />
          Notificar Status Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Notificar Status Admin</DialogTitle>
          <DialogDescription>
            Configure o número que receberá alertas críticos de queda de conexões.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Alertas Ativos</Label>
              <p className="text-sm text-muted-foreground">
                Receber notificações de queda
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={loading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="admin_phone">Telefone para alertas</Label>
            <Input
              id="admin_phone"
              placeholder="Ex: 5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Formato: Código do país + DDD + Número.
            </p>
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testing || !phone || loading}
            className="w-full sm:w-auto"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Testar Alerta
          </Button>
          <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
