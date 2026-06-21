import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Palette, MessageSquare, Clock, Eye } from 'lucide-react';
import { useUpdateWebChatWidget, WebChatWidget } from '@/hooks/useWebChat';
import { toast } from 'sonner';

interface WidgetSettingsCardProps {
  widget: WebChatWidget;
  productId: string;
}

export function WidgetSettingsCard({ widget, productId }: WidgetSettingsCardProps) {
  const updateWidget = useUpdateWebChatWidget();
  
  const [formData, setFormData] = useState({
    name: widget.name || '',
    is_active: widget.is_active ?? true,
    primary_color: widget.primary_color || '#6366f1',
    secondary_color: widget.secondary_color || '#ffffff',
    welcome_message: widget.welcome_message || 'Olá! Como posso ajudá-lo hoje?',
    placeholder_text: widget.placeholder_text || 'Digite sua mensagem...',
    position: widget.position || 'bottom-right',
    auto_open_delay: widget.auto_open_delay || 0,
    offline_message: widget.offline_message || 'No momento não estamos disponíveis. Deixe sua mensagem que retornaremos.',
  });

  useEffect(() => {
    setFormData({
      name: widget.name || '',
      is_active: widget.is_active ?? true,
      primary_color: widget.primary_color || '#6366f1',
      secondary_color: widget.secondary_color || '#ffffff',
      welcome_message: widget.welcome_message || 'Olá! Como posso ajudá-lo hoje?',
      placeholder_text: widget.placeholder_text || 'Digite sua mensagem...',
      position: widget.position || 'bottom-right',
      auto_open_delay: widget.auto_open_delay || 0,
      offline_message: widget.offline_message || 'No momento não estamos disponíveis. Deixe sua mensagem que retornaremos.',
    });
  }, [widget]);

  const handleSave = async () => {
    try {
      await updateWidget.mutateAsync({
        id: widget.id,
        ...formData,
      });
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Settings Column */}
      <div className="space-y-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Configurações Básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Widget Ativo</Label>
                <p className="text-xs text-muted-foreground">Exibir widget no site</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Widget</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Chat de Vendas"
              />
            </div>

            <div className="space-y-2">
              <Label>Posição</Label>
              <Select 
                value={formData.position} 
                onValueChange={(value) => setFormData({ ...formData, position: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">Canto inferior direito</SelectItem>
                  <SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Aparência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cor Primária</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primary_color}
                    onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                    className="h-10 w-12 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.primary_color}
                    onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cor Secundária</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.secondary_color}
                    onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                    className="h-10 w-12 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.secondary_color}
                    onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem de Boas-vindas</Label>
              <Textarea
                value={formData.welcome_message}
                onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
                placeholder="Olá! Como posso ajudá-lo?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Placeholder do Input</Label>
              <Input
                value={formData.placeholder_text}
                onChange={(e) => setFormData({ ...formData, placeholder_text: e.target.value })}
                placeholder="Digite sua mensagem..."
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem Offline</Label>
              <Textarea
                value={formData.offline_message}
                onChange={(e) => setFormData({ ...formData, offline_message: e.target.value })}
                placeholder="Não estamos disponíveis..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Timing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Delay para Abrir Automaticamente (segundos)</Label>
              <p className="text-xs text-muted-foreground">0 = não abrir automaticamente</p>
              <Input
                type="number"
                min={0}
                value={formData.auto_open_delay}
                onChange={(e) => setFormData({ ...formData, auto_open_delay: parseInt(e.target.value) || 0 })}
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={updateWidget.isPending} className="w-full">
          {updateWidget.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar Configurações
        </Button>
      </div>

      {/* Preview Column */}
      <div className="lg:sticky lg:top-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
            <CardDescription>Visualização do widget</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative bg-muted/50 rounded-lg h-[400px] overflow-hidden">
              {/* Simulated page content */}
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded"></div>
                <div className="h-4 w-1/2 bg-muted rounded"></div>
                <div className="h-24 w-full bg-muted rounded mt-4"></div>
              </div>
              
              {/* Widget preview */}
              <div 
                className={`absolute bottom-4 ${formData.position === 'bottom-left' ? 'left-4' : 'right-4'}`}
              >
                {/* Chat window preview */}
                <div 
                  className="w-72 rounded-xl shadow-2xl overflow-hidden mb-4"
                  style={{ backgroundColor: formData.secondary_color }}
                >
                  {/* Header */}
                  <div 
                    className="p-4 text-white"
                    style={{ backgroundColor: formData.primary_color }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Assistente Virtual</p>
                        <p className="text-xs opacity-80">Online</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Messages */}
                  <div className="p-3 space-y-2 bg-white min-h-[120px]">
                    <div 
                      className="rounded-lg p-2 text-sm max-w-[85%] text-white"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      {formData.welcome_message || 'Olá! Como posso ajudá-lo?'}
                    </div>
                  </div>
                  
                  {/* Input */}
                  <div className="p-3 border-t bg-white">
                    <div className="flex gap-2">
                      <div className="flex-1 text-sm text-muted-foreground bg-muted rounded-full px-3 py-2">
                        {formData.placeholder_text || 'Digite sua mensagem...'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Toggle button preview */}
                <div 
                  className="h-14 w-14 rounded-full shadow-lg flex items-center justify-center ml-auto"
                  style={{ backgroundColor: formData.primary_color }}
                >
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
