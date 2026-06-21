import { Form, DistributionRule } from '@/types/forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Users, User, Shuffle, Inbox, Palette, Code, BarChart3 } from 'lucide-react';

interface FormSettingsProps {
  form: Form;
  onUpdate: (updates: Partial<Form>) => void;
}

export function FormSettings({ form, onUpdate }: FormSettingsProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
          <CardDescription>Nome, descrição e identificação do formulário</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Formulário</Label>
              <Input
                value={form.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={form.slug}
                onChange={(e) => onUpdate({ slug: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Descrição interna do formulário..."
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Distribution Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Distribuição de Leads
          </CardTitle>
          <CardDescription>
            Defina como os leads serão distribuídos ao serem capturados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: 'manual', label: 'Manual', icon: Inbox, description: 'Leads entram sem atribuição' },
              { value: 'user', label: 'Usuário Específico', icon: User, description: 'Sempre atribuir a um vendedor' },
              { value: 'squad', label: 'Squad', icon: Users, description: 'Distribuir para fila do time' },
              { value: 'round_robin', label: 'Round Robin', icon: Shuffle, description: 'Rotação automática entre vendedores' },
            ].map((rule) => {
              const Icon = rule.icon;
              const isSelected = form.distribution_rule === rule.value;
              
              return (
                <button
                  key={rule.value}
                  onClick={() => onUpdate({ distribution_rule: rule.value as DistributionRule })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{rule.label}</p>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          
          <div className="space-y-2">
            <Label>Temperatura Padrão do Lead</Label>
            <Select
              value={form.default_temperature}
              onValueChange={(value) => onUpdate({ default_temperature: value })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cold">🥶 Frio</SelectItem>
                <SelectItem value="warm">☀️ Morno</SelectItem>
                <SelectItem value="hot">🔥 Quente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rastreamento e Analytics
          </CardTitle>
          <CardDescription>
            Configure pixels e scripts de tracking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Capturar UTMs</Label>
              <p className="text-sm text-muted-foreground">
                Salvar parâmetros UTM automaticamente
              </p>
            </div>
            <Switch
              checked={form.utm_capture}
              onCheckedChange={(checked) => onUpdate({ utm_capture: checked })}
            />
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Facebook Pixel ID</Label>
              <Input
                value={form.facebook_pixel_id || ''}
                onChange={(e) => onUpdate({ facebook_pixel_id: e.target.value })}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-2">
              <Label>Google Tag ID</Label>
              <Input
                value={form.google_tag_id || ''}
                onChange={(e) => onUpdate({ google_tag_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Design */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Identidade Visual
          </CardTitle>
          <CardDescription>
            Personalize as cores e aparência do formulário
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Cor Primária</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.theme?.primary_color || '#8B5CF6'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, primary_color: e.target.value } 
                  })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={form.theme?.primary_color || '#8B5CF6'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, primary_color: e.target.value } 
                  })}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor de Fundo</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.theme?.background_color || '#ffffff'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, background_color: e.target.value } 
                  })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={form.theme?.background_color || '#ffffff'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, background_color: e.target.value } 
                  })}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.theme?.text_color || '#1f2937'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, text_color: e.target.value } 
                  })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={form.theme?.text_color || '#1f2937'}
                  onChange={(e) => onUpdate({ 
                    theme: { ...form.theme, text_color: e.target.value } 
                  })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fonte</Label>
              <Select
                value={form.theme?.font_family || 'Inter'}
                onValueChange={(value) => onUpdate({ 
                  theme: { ...form.theme, font_family: value } 
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Poppins">Poppins</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Open Sans">Open Sans</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estilo do Botão</Label>
              <Select
                value={form.theme?.button_style || 'filled'}
                onValueChange={(value) => onUpdate({ 
                  theme: { ...form.theme, button_style: value as 'filled' | 'outlined' | 'text' } 
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filled">Preenchido</SelectItem>
                  <SelectItem value="outlined">Contorno</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
