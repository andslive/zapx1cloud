import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Building2, Mail, Phone, Calendar, ArrowLeft, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  new: { label: 'Novo', variant: 'default' },
  contacted: { label: 'Contactado', variant: 'secondary' },
  qualified: { label: 'Qualificado', variant: 'outline' },
  converted: { label: 'Convertido', variant: 'default' },
  lost: { label: 'Perdido', variant: 'destructive' },
};

export function SalesLeadsManager() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [notes, setNotes] = useState('');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['sales-leads', statusFilter],
    queryFn: async () => {
      let query = supabase.from('sales_leads').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from('sales_leads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      toast.success('Lead atualizado');
    },
  });

  const filteredLeads = leads.filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.company_name?.toLowerCase().includes(s) || l.contact_name?.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s);
  });

  const newCount = leads.filter((l: any) => l.status === 'new').length;

  const openDetail = (lead: any) => {
    setSelectedLead(lead);
    setNotes(lead.notes || '');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads Comerciais</h1>
          <p className="text-muted-foreground">Leads capturados pela página de vendas</p>
        </div>
        {newCount > 0 && (
          <Badge variant="default" className="text-sm px-3 py-1">{newCount} novos</Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="new">Novos</SelectItem>
            <SelectItem value="contacted">Contactados</SelectItem>
            <SelectItem value="qualified">Qualificados</SelectItem>
            <SelectItem value="converted">Convertidos</SelectItem>
            <SelectItem value="lost">Perdidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nenhum lead encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredLeads.map((lead: any) => {
            const st = STATUS_MAP[lead.status] || STATUS_MAP.new;
            return (
              <Card
                key={lead.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => openDetail(lead)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{lead.company_name}</h3>
                      <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span>{lead.contact_name}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{lead.email}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(lead.created_at), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(o) => !o && setSelectedLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {selectedLead.company_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> {selectedLead.contact_name}</div>
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {selectedLead.email}</div>
                  {selectedLead.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {selectedLead.phone}</div>}
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> {format(new Date(selectedLead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                </div>

                {(selectedLead.company_size || selectedLead.segment) && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedLead.company_size && <div><span className="text-muted-foreground">Tamanho:</span> {selectedLead.company_size}</div>}
                    {selectedLead.segment && <div><span className="text-muted-foreground">Segmento:</span> {selectedLead.segment}</div>}
                  </div>
                )}

                {selectedLead.main_challenge && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Principal desafio</Label>
                    <p className="text-sm mt-1">{selectedLead.main_challenge}</p>
                  </div>
                )}

                {(selectedLead.utm_source || selectedLead.utm_medium || selectedLead.utm_campaign) && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedLead.utm_source && <Badge variant="outline" className="text-xs">source: {selectedLead.utm_source}</Badge>}
                    {selectedLead.utm_medium && <Badge variant="outline" className="text-xs">medium: {selectedLead.utm_medium}</Badge>}
                    {selectedLead.utm_campaign && <Badge variant="outline" className="text-xs">campaign: {selectedLead.utm_campaign}</Badge>}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={selectedLead.status}
                    onValueChange={(v) => {
                      updateMutation.mutate({ id: selectedLead.id, updates: { status: v } });
                      setSelectedLead({ ...selectedLead, status: v });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_MAP).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Notas internas</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anotações sobre este lead..."
                    rows={3}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateMutation.mutate({ id: selectedLead.id, updates: { notes } });
                      setSelectedLead({ ...selectedLead, notes });
                    }}
                  >
                    Salvar notas
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
