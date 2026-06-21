import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Save, 
  Loader2,
  Users,
  Target,
  Code,
  Brain,
  Package,
  AlertTriangle
} from 'lucide-react';
import { Funnel, DistributionRule } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { useSquads } from '@/hooks/useSquads';
import { useTeamMembers } from '@/hooks/useTeam';
import { toast } from 'sonner';

interface FunnelSettingsTabProps {
  funnel: Funnel;
}

export function FunnelSettingsTab({ funnel }: FunnelSettingsTabProps) {
  const [formData, setFormData] = useState({
    product_id: funnel.product_id,
    name: funnel.name,
    description: funnel.description || '',
    slug: funnel.slug,
    distribution_rule: funnel.distribution_rule,
    assigned_squad_id: funnel.assigned_squad_id || '',
    assigned_user_id: funnel.assigned_user_id || '',
    default_temperature: funnel.default_temperature,
    default_tags: funnel.default_tags.join(', '),
    facebook_pixel_id: funnel.facebook_pixel_id || '',
    google_tag_id: funnel.google_tag_id || '',
    utm_capture: funnel.utm_capture,
    ai_enabled: funnel.ai_enabled,
    ai_context: funnel.ai_context || '',
  });

  const updateFunnel = useUpdateFunnel();
  const { data: products } = useProducts();
  const { data: squads } = useSquads();
  const { data: teamMembers } = useTeamMembers();

  const handleSave = async () => {
    const updates = {
      ...formData,
      product_id: formData.product_id,
      default_tags: formData.default_tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      assigned_squad_id: formData.assigned_squad_id || null,
      assigned_user_id: formData.assigned_user_id || null,
    };

    await updateFunnel.mutateAsync({ id: funnel.id, ...updates });
    toast.success('Configurações salvas!');
  };

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Configurações do Funil</h2>
          <p className="text-muted-foreground text-sm">
            Configure as opções gerais do seu funil de captação
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateFunnel.isPending} className="gap-2">
          {updateFunnel.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Informações Básicas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Selector */}
          <div className="space-y-2">
            <Label>Produto Vinculado</Label>
            <Select
              value={formData.product_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {products?.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A IA usará o conhecimento (Cérebro) deste produto
            </p>
          </div>

          {/* Warning when product changes */}
          {formData.product_id !== funnel.product_id && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Mudança de produto</p>
                <p className="text-muted-foreground">
                  A IA passará a usar o conhecimento do novo produto. 
                  Os agentes vinculados aos blocos de IA também serão do novo produto.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Funil</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Distribution */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Distribuição de Leads</CardTitle>
          </div>
          <CardDescription>Como os leads serão atribuídos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Regra de Distribuição</Label>
            <Select
              value={formData.distribution_rule}
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                distribution_rule: value as DistributionRule,
                assigned_squad_id: '',
                assigned_user_id: '',
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (sem atribuição automática)</SelectItem>
                <SelectItem value="round_robin">Round Robin (rodízio)</SelectItem>
                <SelectItem value="squad">Atribuir a Squad</SelectItem>
                <SelectItem value="user">Atribuir a Usuário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.distribution_rule === 'squad' && (
            <div className="space-y-2">
              <Label>Squad</Label>
              <Select
                value={formData.assigned_squad_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_squad_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  {squads?.map(squad => (
                    <SelectItem key={squad.id} value={squad.id}>
                      {squad.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.distribution_rule === 'user' && (
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select
                value={formData.assigned_user_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_user_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers?.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Qualification */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Qualificação</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperatura Padrão</Label>
              <Select
                value={formData.default_temperature}
                onValueChange={(value) => setFormData(prev => ({ ...prev, default_temperature: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold">🥶 Frio</SelectItem>
                  <SelectItem value="warm">😊 Morno</SelectItem>
                  <SelectItem value="hot">🔥 Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags Padrão (separadas por vírgula)</Label>
              <Input
                value={formData.default_tags}
                onChange={(e) => setFormData(prev => ({ ...prev, default_tags: e.target.value }))}
                placeholder="lead, funil, campanha"
              />
            </div>
          </div>
        </CardContent>
      </Card>



      {/* Tracking */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Rastreamento</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Facebook Pixel ID</Label>
              <Input
                value={formData.facebook_pixel_id}
                onChange={(e) => setFormData(prev => ({ ...prev, facebook_pixel_id: e.target.value }))}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-2">
              <Label>Google Tag ID</Label>
              <Input
                value={formData.google_tag_id}
                onChange={(e) => setFormData(prev => ({ ...prev, google_tag_id: e.target.value }))}
                placeholder="GTM-XXXXXX"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={formData.utm_capture}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, utm_capture: checked }))}
            />
            <Label>Capturar parâmetros UTM automaticamente</Label>
          </div>
        </CardContent>
      </Card>

      {/* AI */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Inteligência Artificial</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.ai_enabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ai_enabled: checked }))}
            />
            <Label>Habilitar IA no funil</Label>
          </div>

          {formData.ai_enabled && (
            <div className="space-y-2">
              <Label>Contexto adicional para a IA</Label>
              <Textarea
                value={formData.ai_context}
                onChange={(e) => setFormData(prev => ({ ...prev, ai_context: e.target.value }))}
                placeholder="Informações que a IA deve considerar ao interagir com visitantes..."
                rows={4}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
