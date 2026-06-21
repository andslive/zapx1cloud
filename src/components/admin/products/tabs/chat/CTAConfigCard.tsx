import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Trash2, 
  ShoppingCart, 
  MessageCircle, 
  Calendar, 
  Phone, 
  Link, 
  GripVertical,
  Loader2,
  Sparkles,
  Play
} from 'lucide-react';
import { 
  useProductCTAs, 
  useCreateProductCTA, 
  useUpdateProductCTA, 
  useDeleteProductCTA,
  type ProductCTA 
} from '@/hooks/useProductCTAs';

interface CTAConfigCardProps {
  productId: string;
}

const CTA_TYPES = [
  { value: 'checkout', label: 'Checkout / Compra', icon: ShoppingCart, color: 'bg-green-500' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500' },
  { value: 'calendar', label: 'Agendar Reunião', icon: Calendar, color: 'bg-blue-500' },
  { value: 'callback', label: 'Solicitar Ligação', icon: Phone, color: 'bg-orange-500' },
  { value: 'video', label: 'Vídeo (YouTube/Vimeo)', icon: Play, color: 'bg-red-500' },
  { value: 'custom', label: 'Link Personalizado', icon: Link, color: 'bg-purple-500' },
] as const;

const INTENT_LEVELS = [
  { value: 'high', label: 'Alta (pronto para comprar)', color: 'text-green-600' },
  { value: 'medium', label: 'Média (interessado)', color: 'text-yellow-600' },
  { value: 'low', label: 'Baixa (explorando)', color: 'text-blue-600' },
] as const;

export function CTAConfigCard({ productId }: CTAConfigCardProps) {
  const { data: ctas, isLoading } = useProductCTAs(productId);
  const createCTA = useCreateProductCTA();
  const updateCTA = useUpdateProductCTA();
  const deleteCTA = useDeleteProductCTA();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCTA, setNewCTA] = useState<{
    cta_type: 'checkout' | 'whatsapp' | 'calendar' | 'callback' | 'video' | 'custom';
    label: string;
    action_url: string;
    whatsapp_number: string;
    whatsapp_message: string;
    video_url: string;
    intent_level: 'high' | 'medium' | 'low';
    trigger_keywords: string;
  }>({
    cta_type: 'checkout',
    label: '',
    action_url: '',
    whatsapp_number: '',
    whatsapp_message: '',
    video_url: '',
    intent_level: 'high',
    trigger_keywords: '',
  });

  const handleAddCTA = async () => {
    if (!newCTA.label) return;

    await createCTA.mutateAsync({
      product_id: productId,
      cta_type: newCTA.cta_type,
      label: newCTA.label,
      action_url: newCTA.action_url || undefined,
      whatsapp_number: newCTA.whatsapp_number || undefined,
      whatsapp_message: newCTA.whatsapp_message || undefined,
      video_url: newCTA.video_url || undefined,
      intent_level: newCTA.intent_level,
      trigger_keywords: newCTA.trigger_keywords 
        ? newCTA.trigger_keywords.split(',').map(k => k.trim()).filter(Boolean)
        : undefined,
      display_order: (ctas?.length || 0) + 1,
    });

    setNewCTA({
      cta_type: 'checkout',
      label: '',
      action_url: '',
      whatsapp_number: '',
      whatsapp_message: '',
      video_url: '',
      intent_level: 'high',
      trigger_keywords: '',
    });
    setShowAddForm(false);
  };

  const handleToggleCTA = async (cta: ProductCTA) => {
    await updateCTA.mutateAsync({
      id: cta.id,
      is_active: !cta.is_active,
    });
  };

  const handleDeleteCTA = async (cta: ProductCTA) => {
    if (!confirm('Remover este CTA?')) return;
    await deleteCTA.mutateAsync({ id: cta.id, productId });
  };

  const getTypeConfig = (type: string) => {
    return CTA_TYPES.find(t => t.value === type) || CTA_TYPES[4];
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          CTAs Inteligentes
        </CardTitle>
        <CardDescription>
          Configure botões de ação que a IA pode enviar automaticamente durante a conversa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active CTAs List */}
        {ctas && ctas.length > 0 && (
          <div className="space-y-3">
            {ctas.map((cta) => {
              const typeConfig = getTypeConfig(cta.cta_type);
              const Icon = typeConfig.icon;
              
              return (
                <div 
                  key={cta.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  
                  <div className={`h-8 w-8 rounded-full ${typeConfig.color} flex items-center justify-center`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{cta.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cta.cta_type === 'whatsapp' 
                        ? cta.whatsapp_number 
                        : cta.cta_type === 'video'
                        ? cta.video_url || 'Sem vídeo configurado'
                        : cta.action_url || 'Sem URL configurada'}
                    </p>
                  </div>
                  
                  <Badge variant="outline" className="text-xs">
                    {cta.intent_level === 'high' ? '🔥 Alta' : cta.intent_level === 'medium' ? '⚡ Média' : '💡 Baixa'}
                  </Badge>
                  
                  <Switch
                    checked={cta.is_active}
                    onCheckedChange={() => handleToggleCTA(cta)}
                  />
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteCTA(cta)}
                    disabled={deleteCTA.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {(!ctas || ctas.length === 0) && !showAddForm && (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Nenhum CTA configurado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione CTAs para a IA enviar botões interativos durante o chat
            </p>
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="font-medium">Novo CTA</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de CTA</Label>
                <Select 
                  value={newCTA.cta_type} 
                  onValueChange={(v: any) => setNewCTA({ ...newCTA, cta_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nível de Intenção</Label>
                <Select 
                  value={newCTA.intent_level} 
                  onValueChange={(v: any) => setNewCTA({ ...newCTA, intent_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENT_LEVELS.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        <span className={level.color}>{level.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Texto do Botão</Label>
              <Input
                placeholder="Ex: Garantir Minha Vaga 🛒"
                value={newCTA.label}
                onChange={(e) => setNewCTA({ ...newCTA, label: e.target.value })}
              />
            </div>

            {newCTA.cta_type === 'whatsapp' ? (
              <>
                <div className="space-y-2">
                  <Label>Número do WhatsApp</Label>
                  <Input
                    placeholder="5511999999999 (com código do país)"
                    value={newCTA.whatsapp_number}
                    onChange={(e) => setNewCTA({ ...newCTA, whatsapp_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem Pré-definida (opcional)</Label>
                  <Textarea
                    placeholder="Olá! Vim do chat e gostaria de saber mais..."
                    value={newCTA.whatsapp_message}
                    onChange={(e) => setNewCTA({ ...newCTA, whatsapp_message: e.target.value })}
                    rows={2}
                  />
                </div>
              </>
            ) : newCTA.cta_type === 'video' ? (
              <div className="space-y-2">
                <Label>URL do Vídeo (YouTube ou Vimeo)</Label>
                <Input
                  placeholder="https://www.youtube.com/watch?v=xxxxx ou https://vimeo.com/xxxxx"
                  value={newCTA.video_url}
                  onChange={(e) => setNewCTA({ ...newCTA, video_url: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  🎬 O vídeo será exibido em um player inline quando a IA detectar que o cliente precisa de mais informações visuais
                </p>
              </div>
            ) : newCTA.cta_type !== 'callback' ? (
              <div className="space-y-2">
                <Label>URL de Destino</Label>
                <Input
                  placeholder="https://checkout.com/produto ou https://calendly.com/empresa"
                  value={newCTA.action_url}
                  onChange={(e) => setNewCTA({ ...newCTA, action_url: e.target.value })}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                💡 O botão "Solicitar Ligação" irá coletar os dados do visitante e criar um lead no CRM para que sua equipe possa retornar a ligação.
              </p>
            )}

            <div className="space-y-2">
              <Label>Palavras-gatilho (opcional)</Label>
              <Input
                placeholder="comprar, preço, valor, interessado (separadas por vírgula)"
                value={newCTA.trigger_keywords}
                onChange={(e) => setNewCTA({ ...newCTA, trigger_keywords: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                A IA usará essas palavras para identificar quando mostrar este CTA
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleAddCTA}
                disabled={!newCTA.label || createCTA.isPending}
              >
                {createCTA.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Adicionar CTA
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Add Button */}
        {!showAddForm && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar CTA
          </Button>
        )}

        {/* Info Box */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <h4 className="font-medium text-primary mb-2">💡 Como funciona</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• A IA analisa a conversa e identifica a intenção do cliente</li>
            <li>• Quando detecta alta intenção de compra, exibe botões de checkout</li>
            <li>• Para dúvidas complexas, oferece WhatsApp ou ligação</li>
            <li>• Os botões aparecem como opções clicáveis no chat</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
