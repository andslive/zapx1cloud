import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Upload, Loader2 } from 'lucide-react';
import { useCompanySettings, useUpdateCompanySettings, uploadCompanyLogo, type CompanyAddress } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { WhatsAppHumanizationSettings } from './WhatsAppHumanizationSettings';

function formatCNPJ(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

function formatCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function CompanySettings() {
  const { data: company } = useCompanySettings();
  const { profile } = useAuth();
  const update = useUpdateCompanySettings();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [address, setAddress] = useState<CompanyAddress>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name ?? '');
      setCnpj(company.cnpj ?? '');
      setEmail(company.email ?? '');
      setPhone(company.phone ?? '');
      setLogoUrl(company.logo_url);
      setAddress(company.address ?? {});
    }
  }, [company]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.organization_id) return;
    setUploading(true);
    try {
      const url = await uploadCompanyLogo(file, profile.organization_id);
      setLogoUrl(url);
      toast({ title: 'Logo enviado' });
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    update.mutate({ name, cnpj, email, phone, logo_url: logoUrl, address });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Dados da sua empresa que aparecem em propostas, recibos e canais de atendimento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Identificação
          </CardTitle>
          <CardDescription>Nome e dados fiscais da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-xl border border-border bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {logoUrl ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG. Recomendado: 512x512.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome fantasia</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={address.cep ?? ''} onChange={(e) => setAddress({ ...address, cep: formatCEP(e.target.value) })} placeholder="00000-000" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Rua</Label>
              <Input value={address.street ?? ''} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={address.number ?? ''} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Complemento</Label>
              <Input value={address.complement ?? ''} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input value={address.neighborhood ?? ''} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={address.city ?? ''} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input value={address.state ?? ''} onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
            </div>
          </div>
        </CardContent>
      </Card>

      <WhatsAppHumanizationSettings />

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={update.isPending}>
          Salvar dados da empresa
        </Button>
      </div>
    </div>
  );
}
