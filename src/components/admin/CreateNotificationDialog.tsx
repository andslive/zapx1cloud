import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Mail, Send, Users, Package, UsersRound, User, Loader2, X } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useSquads } from '@/hooks/useSquads';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { useCreateAdminNotification, useRecipientCount, CreateNotificationData } from '@/hooks/useAdminNotifications';

interface CreateNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const notificationTypes = [
  { value: 'system', label: 'Sistema', color: 'bg-blue-500' },
  { value: 'urgency', label: 'Urgente', color: 'bg-red-500' },
  { value: 'opportunity', label: 'Oportunidade', color: 'bg-green-500' },
  { value: 'cadence', label: 'Cadência', color: 'bg-purple-500' },
  { value: 'audit', label: 'Auditoria', color: 'bg-orange-500' },
];

export function CreateNotificationDialog({ open, onOpenChange }: CreateNotificationDialogProps) {
  const { profile } = useAuth();
  const { data: products = [] } = useProducts();
  const { data: squads = [] } = useSquads();
  const { data: members = [] } = useTeamMembers(profile?.organization_id);
  const createNotification = useCreateAdminNotification();
  
  // Form state
  const [type, setType] = useState<CreateNotificationData['type']>('system');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [scope, setScope] = useState<CreateNotificationData['scope']>('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedSquads, setSelectedSquads] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendApp, setSendApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  
  // Build scope filters
  const scopeFilters = {
    productIds: scope === 'product' ? selectedProducts : undefined,
    squadIds: scope === 'squad' ? selectedSquads : undefined,
    userIds: scope === 'custom' ? selectedUsers : undefined,
  };
  
  // Get recipient count
  const { data: recipientCount = 0 } = useRecipientCount(
    profile?.organization_id,
    scope,
    scopeFilters
  );
  
  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setType('system');
      setTitle('');
      setMessage('');
      setActionUrl('');
      setScope('all');
      setSelectedProducts([]);
      setSelectedSquads([]);
      setSelectedUsers([]);
      setSendApp(true);
      setSendEmail(false);
    }
  }, [open]);
  
  const handleSubmit = async () => {
    if (!title.trim()) return;
    
    await createNotification.mutateAsync({
      type,
      title: title.trim(),
      message: message.trim(),
      action_url: actionUrl.trim() || undefined,
      scope,
      scope_filters: scopeFilters,
      send_app: sendApp,
      send_email: sendEmail,
    });
    
    onOpenChange(false);
  };
  
  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };
  
  const toggleSquad = (squadId: string) => {
    setSelectedSquads(prev => 
      prev.includes(squadId) 
        ? prev.filter(id => id !== squadId)
        : [...prev, squadId]
    );
  };
  
  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };
  
  const sellers = members.filter(m => m.roles?.some(r => r.role === 'seller'));
  const isValid = title.trim() && (sendApp || sendEmail) && recipientCount > 0;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Nova Notificação
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Notification Type */}
            <div className="space-y-2">
              <Label>Tipo da Notificação</Label>
              <Select value={type} onValueChange={(v) => setType(v as CreateNotificationData['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {notificationTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${t.color}`} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Nova meta disponível!"
                maxLength={100}
              />
            </div>
            
            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descrição detalhada da notificação..."
                rows={3}
                maxLength={500}
              />
            </div>
            
            {/* Action URL */}
            <div className="space-y-2">
              <Label htmlFor="actionUrl">Link (opcional)</Label>
              <Input
                id="actionUrl"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </div>
            
            {/* Scope */}
            <div className="space-y-3">
              <Label>Escopo</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as CreateNotificationData['scope'])}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="scope-all" />
                  <Label htmlFor="scope-all" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Toda a organização
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="product" id="scope-product" />
                  <Label htmlFor="scope-product" className="flex items-center gap-2 cursor-pointer">
                    <Package className="h-4 w-4" />
                    Por Produto
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="squad" id="scope-squad" />
                  <Label htmlFor="scope-squad" className="flex items-center gap-2 cursor-pointer">
                    <UsersRound className="h-4 w-4" />
                    Por Squad
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="scope-custom" />
                  <Label htmlFor="scope-custom" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    Usuários específicos
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {/* Scope Filters */}
            {scope === 'product' && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/50">
                <Label className="text-sm">Selecione os produtos:</Label>
                <div className="flex flex-wrap gap-2">
                  {products.map(product => (
                    <Badge
                      key={product.id}
                      variant={selectedProducts.includes(product.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleProduct(product.id)}
                    >
                      {selectedProducts.includes(product.id) && <X className="h-3 w-3 mr-1" />}
                      {product.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {scope === 'squad' && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/50">
                <Label className="text-sm">Selecione os squads:</Label>
                <div className="flex flex-wrap gap-2">
                  {squads.map(squad => (
                    <Badge
                      key={squad.id}
                      variant={selectedSquads.includes(squad.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleSquad(squad.id)}
                    >
                      {selectedSquads.includes(squad.id) && <X className="h-3 w-3 mr-1" />}
                      {squad.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {scope === 'custom' && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/50">
                <Label className="text-sm">Selecione os usuários:</Label>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {sellers.map(member => (
                      <div
                        key={member.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          selectedUsers.includes(member.id) ? 'bg-primary/10' : 'hover:bg-muted'
                        }`}
                        onClick={() => toggleUser(member.id)}
                      >
                        <Checkbox checked={selectedUsers.includes(member.id)} />
                        <span className="text-sm">{member.full_name}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            {/* Channels */}
            <div className="space-y-3">
              <Label>Canais de Envio</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send-app"
                    checked={sendApp}
                    onCheckedChange={(checked) => setSendApp(!!checked)}
                  />
                  <Label htmlFor="send-app" className="flex items-center gap-2 cursor-pointer">
                    <Bell className="h-4 w-4" />
                    Notificação no App
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send-email"
                    checked={sendEmail}
                    onCheckedChange={(checked) => setSendEmail(!!checked)}
                  />
                  <Label htmlFor="send-email" className="flex items-center gap-2 cursor-pointer">
                    <Mail className="h-4 w-4" />
                    Enviar também por Email
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            <Users className="h-4 w-4 inline mr-1" />
            {recipientCount} destinatário(s)
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!isValid || createNotification.isPending}
            >
              {createNotification.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar Notificação
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
