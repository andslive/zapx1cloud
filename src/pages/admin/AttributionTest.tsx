import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, TestTube2, Send } from "lucide-react";

export default function AttributionTest() {
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [audit, setAudit] = useState<any>(null);
  const [testEventCode, setTestEventCode] = useState("");
  const [leadId, setLeadId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [blockId, setBlockId] = useState("pixel_test_block");
  const [eventName, setEventName] = useState("Purchase");

  const runTest = async () => {
    setLoading(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('attribution-test', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setResults({
        lead_id: data.lead_id,
        conversation_id: data.conversation_id,
        lead_tracking: data.lead_tracking,
        lead_data: data.lead_data,
        conversation_data: data.conversation_data,
      });

      toast.success("Teste de atribuição executado com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao executar teste: " + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

  const runAudit = async (sendForReal: boolean) => {
    setAuditing(true);
    setAudit(null);
    try {
      let path = 'purchase-audit';
      const params = new URLSearchParams();
      if (!sendForReal) params.append('dry_run', 'true');
      else params.append('dry_run', 'false');
      
      if (testEventCode) params.append('test_event_code', testEventCode);
      if (leadId) params.append('lead_id', leadId);
      if (conversationId) params.append('conversation_id', conversationId);
      if (blockId) params.append('block_id', blockId);
      if (eventName) params.append('event_name', eventName);

      const { data, error } = await supabase.functions.invoke(
        `${path}?${params.toString()}`,
        { body: {} },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAudit(data);
      toast.success(`Auditoria concluída: ${data.status}`);
    } catch (e: any) {
      toast.error("Erro na auditoria: " + (e?.message || String(e)));
    } finally {
      setAuditing(false);
    }
  };

  const statusColor = (s: string) =>
    s === "VERDE" ? "bg-green-500" : s === "AMARELO" ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="container mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Teste de Atribuição Completo</CardTitle>
          <CardDescription>
            Injeta um lead fake com parâmetros de anúncio do Facebook para validar o fluxo de rastreamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button onClick={runTest} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Disparar Lead de Teste"}
          </Button>


          {results && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Lead ID</p>
                  <p className="text-sm font-mono truncate">{results.lead_id}</p>
                </div>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Conversation ID</p>
                  <p className="text-sm font-mono truncate">{results.conversation_id}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Validação de Campos Persistidos
                </h3>
                
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Campo</th>
                        <th className="p-2 text-left">lead_tracking</th>
                        <th className="p-2 text-left">leads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="p-2 font-medium">fbclid</td>
                        <td className="p-2 text-muted-foreground">{results.lead_tracking.fbclid}</td>
                        <td className="p-2 text-muted-foreground">{results.lead_data.fbclid}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">ctwa_clid</td>
                        <td className="p-2 text-muted-foreground">{results.lead_tracking.referral_ctwa_clid}</td>
                        <td className="p-2 text-muted-foreground">{results.lead_data.ctwa_clid}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">campaign_id</td>
                        <td className="p-2 text-muted-foreground">{results.lead_tracking.campaign_id}</td>
                        <td className="p-2 text-muted-foreground">{results.lead_data.campaign_id}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">adset_id</td>
                        <td className="p-2 text-muted-foreground">{results.lead_tracking.adset_id}</td>
                        <td className="p-2 text-muted-foreground">{results.lead_data.adset_id}</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">ad_id</td>
                        <td className="p-2 text-muted-foreground">{results.lead_tracking.ad_id}</td>
                        <td className="p-2 text-muted-foreground">{results.lead_data.ad_id}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Conversations Metadata</h3>
                <pre className="p-4 bg-slate-950 text-slate-50 rounded-md overflow-auto text-xs max-h-40">
                  {JSON.stringify(results.conversation_data.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria do Purchase (Meta CAPI)</CardTitle>
          <CardDescription>
            Replica exatamente o código que dispara o Purchase no fluxo e mostra o payload real enviado para a Meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead_id">Lead ID (Opcional)</Label>
              <Input 
                id="lead_id"
                placeholder="Último lead de teste se vazio" 
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conv_id">Conversation ID (Opcional)</Label>
              <Input 
                id="conv_id"
                placeholder="UUID" 
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block_id">Block ID</Label>
              <Input 
                id="block_id"
                placeholder="pixel_test_block" 
                value={blockId}
                onChange={(e) => setBlockId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_name">Event Name</Label>
              <Input 
                id="event_name"
                placeholder="Purchase, Lead, etc." 
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test_code">test_event_code (Opcional)</Label>
            <div className="flex gap-2">
              <Input 
                id="test_code"
                placeholder="TEST12345" 
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                className="font-mono"
              />
              {testEventCode && (
                <Button variant="ghost" size="sm" onClick={() => setTestEventCode("")}>
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use este código para ver o evento em tempo real no Gerenciador de Eventos da Meta (Eventos de Teste).
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => runAudit(false)} disabled={auditing} variant="outline" className="flex-1">
              {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
              Simular Purchase
            </Button>
            <Button onClick={() => runAudit(true)} disabled={auditing} className="flex-1">
              {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {testEventCode ? "Enviar para Meta (modo teste)" : "Enviar de verdade para Meta"}
            </Button>
          </div>

          {audit && (
            <div className="space-y-4">
              <div className={`p-4 rounded-md text-white ${statusColor(audit.status)}`}>
                <div className="font-bold text-lg">{audit.status}</div>
                <div className="text-sm">{audit.status_message}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Lead ID</p>
                  <p className="text-sm font-mono truncate">{audit.lead_id}</p>
                </div>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Conversation ID</p>
                  <p className="text-sm font-mono truncate">{audit.conversation_id || '—'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Campos no Lead vs. Enviados para Meta</h3>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Campo</th>
                        <th className="p-2 text-left">Valor no Lead</th>
                        <th className="p-2 text-center">Foi para Meta?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(audit.attribution_fields_in_lead).map(([k, v]) => (
                        <tr key={k}>
                          <td className="p-2 font-medium">{k}</td>
                          <td className="p-2 font-mono text-xs">{String(v || '—')}</td>
                          <td className="p-2 text-center">
                            {audit.attribution_in_payload[k]
                              ? <span className="text-green-600">✓</span>
                              : <span className="text-red-600">✗</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Payload enviado para Meta</h3>
                <pre className="p-4 bg-slate-950 text-slate-50 rounded-md overflow-auto text-xs max-h-80">
                  {JSON.stringify(audit.payload_sent_to_meta, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Resposta da Meta</h3>
                
                {audit.meta_response?.body && (
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div className="p-3 bg-muted rounded-md col-span-2 md:col-span-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">fbtrace_id</p>
                      <p className="text-sm font-mono truncate">{audit.meta_response.body.fbtrace_id || '—'}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Events Received</p>
                      <p className="text-sm font-bold">{audit.meta_response.body.events_received ?? 0}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Pixel ID</p>
                      <p className="text-sm font-mono truncate">{audit.pixel_id || '—'}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs font-medium text-muted-foreground uppercase">test_event_code</p>
                      <p className="text-sm font-mono truncate">{audit.payload_sent_to_meta?.test_event_code || '—'}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <pre className="p-4 bg-slate-950 text-slate-50 rounded-md overflow-auto text-xs max-h-60">
                    {JSON.stringify(audit.meta_response, null, 2)}
                  </pre>

                  {audit.payload_sent_to_meta?.data?.[0]?.event_id && (
                    <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded text-xs font-mono">
                      <span>event_id: {audit.payload_sent_to_meta.data[0].event_id}</span>
                      <a 
                        href={`/admin/logs?search=${audit.payload_sent_to_meta.data[0].event_id}`}
                        className="text-blue-600 hover:underline font-sans"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver no Log Interno
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {audit.diagnostic?.issue && (
                <div className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-950 rounded">
                  <p className="font-semibold text-sm">Diagnóstico</p>
                  <p className="text-xs mt-1"><code>{audit.diagnostic.function}</code></p>
                  <p className="text-sm mt-2">{audit.diagnostic.issue}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
