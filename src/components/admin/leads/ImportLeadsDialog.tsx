import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseCsv } from '@/lib/leadsExport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: string; name: string }[];
  squads: { id: string; name: string }[];
  onDone?: () => void;
}

const FIELD_OPTIONS = [
  { value: '__skip', label: '— ignorar —' },
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'lead_origin', label: 'Origem' },
  { value: 'lead_channel', label: 'Canal' },
  { value: 'temperature', label: 'Temperatura (hot/warm/cold)' },
  { value: 'deal_value', label: 'Valor' },
  { value: 'notes', label: 'Notas' },
];

function guessField(header: string): string {
  const h = header.toLowerCase().trim();
  if (/(^|\b)(nome|name)\b/.test(h)) return 'name';
  if (/e-?mail/.test(h)) return 'email';
  if (/(telefone|phone|whatsapp|celular)/.test(h)) return 'phone';
  if (/(empresa|company)/.test(h)) return 'company';
  if (/(cargo|position|funcao)/.test(h)) return 'position';
  if (/origem/.test(h)) return 'lead_origin';
  if (/canal|channel/.test(h)) return 'lead_channel';
  if (/temperatura|temperature/.test(h)) return 'temperature';
  if (/valor|price|deal/.test(h)) return 'deal_value';
  if (/notas?|obs/.test(h)) return 'notes';
  return '__skip';
}

export function ImportLeadsDialog({ open, onOpenChange, products, squads, onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState<string>('__none');
  const [squadId, setSquadId] = useState<string>('__none');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; duplicated: number; errors: number } | null>(null);

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setMapping({});
    setProductId('__none'); setSquadId('__none'); setProgress(0); setResult(null);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    if (h.length === 0 || r.length === 0) {
      toast.error('CSV vazio ou inválido');
      return;
    }
    setHeaders(h);
    setRows(r);
    const m: Record<string, string> = {};
    h.forEach((col) => { m[col] = guessField(col); });
    setMapping(m);
    setStep('map');
  };

  const downloadTemplate = () => {
    const csv = 'nome,email,telefone,empresa,cargo,origem,canal,temperatura,valor,notas\nJoão Silva,joao@email.com,11999999999,Acme,Diretor,site,whatsapp,warm,1500,Lead vindo do form';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template-leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const importNow = async () => {
    if (!profile?.organization_id) return;
    setStep('importing');

    const mapped = rows.map((r) => {
      const obj: Record<string, any> = {};
      Object.entries(mapping).forEach(([col, field]) => {
        if (field === '__skip') return;
        const v = r[col];
        if (v == null || v === '') return;
        if (field === 'deal_value') obj.deal_value = parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
        else if (field === 'temperature') {
          const t = v.toLowerCase();
          if (['hot', 'warm', 'cold'].includes(t)) obj.temperature = t;
        }
        else obj[field] = v;
      });
      return obj;
    }).filter((r) => r.name || r.email || r.phone);

    if (productId !== '__none') mapped.forEach((r) => (r.product_id = productId));
    if (squadId !== '__none') mapped.forEach((r) => (r.squad_id = squadId));
    mapped.forEach((r) => (r.organization_id = profile.organization_id));

    let created = 0, duplicated = 0, errors = 0;
    const BATCH = 50;
    for (let i = 0; i < mapped.length; i += BATCH) {
      const slice = mapped.slice(i, i + BATCH);
      const { data, error } = await supabase.from('leads').insert(slice as any).select('id');
      if (error) {
        // try one-by-one to count duplicates
        for (const row of slice) {
          const { error: e } = await supabase.from('leads').insert(row as any);
          if (!e) created++;
          else if ((e as any).code === '23505') duplicated++;
          else errors++;
        }
      } else {
        created += (data?.length || slice.length);
      }
      setProgress(Math.round(((i + slice.length) / mapped.length) * 100));
    }

    setResult({ created, duplicated, errors });
    setStep('done');
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar leads</DialogTitle>
          <DialogDescription>
            Importe leads a partir de um CSV. Mapeie cada coluna ao campo correspondente.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Baixar modelo CSV
            </Button>
            <Label className="block">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
                id="csv-upload"
              />
              <Button asChild className="w-full gap-2 cursor-pointer" variant="default">
                <span onClick={() => document.getElementById('csv-upload')?.click()}>
                  <Upload className="h-4 w-4" /> Selecionar arquivo CSV
                </span>
              </Button>
            </Label>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {rows.length} linhas detectadas. Mapeie as colunas:
            </p>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-2 gap-3 items-center">
                  <Input value={h} disabled />
                  <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <Label className="text-xs">Produto padrão (opcional)</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Sem produto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem produto</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Squad padrão (opcional)</Label>
                <Select value={squadId} onValueChange={setSquadId}>
                  <SelectTrigger><SelectValue placeholder="Sem squad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem squad</SelectItem>
                    {squads.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 space-y-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">Importando... {progress}%</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-medium">Importação concluída</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✓ {result.created} criados</p>
              {result.duplicated > 0 && <p>⊘ {result.duplicated} duplicados (telefone já existe)</p>}
              {result.errors > 0 && <p className="text-destructive flex items-center justify-center gap-1"><AlertTriangle className="h-4 w-4" /> {result.errors} erros</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={importNow}>Importar {rows.length} leads</Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
