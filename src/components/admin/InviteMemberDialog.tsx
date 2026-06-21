import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateInvitation } from '@/hooks/useTeamInvitations';
import { useSquads } from '@/hooks/useSquads';
import { Loader2, Mail, Shield, UserCog, User, Users, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'seller'>('seller');
  const [squadId, setSquadId] = useState<string>('none');
  const [createdInvite, setCreatedInvite] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const createInvitation = useCreateInvitation();
  const { data: squads } = useSquads();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Digite o email do convidado');
      return;
    }
    
    try {
      const result = await createInvitation.mutateAsync({
        email,
        role,
        squadId: squadId !== 'none' ? squadId : null,
      });
      
      setCreatedInvite(result);
      toast.success('Convite criado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar convite');
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('seller');
    setSquadId('none');
    setCreatedInvite(null);
    setCopied(false);
    onOpenChange(false);
  };

  const inviteLink = createdInvite 
    ? `${window.location.origin}/aceitar-convite?token=${createdInvite.token}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Convidar Membro
          </DialogTitle>
          <DialogDescription>
            Envie um convite para adicionar um novo membro à equipe
          </DialogDescription>
        </DialogHeader>
        
        {!createdInvite ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="vendedor@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v: 'admin' | 'manager' | 'seller') => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Vendedor
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <UserCog className="h-4 w-4 text-violet-500" />
                      Gestor
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Squad (opcional)</Label>
              <Select value={squadId} onValueChange={setSquadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Nenhum squad
                    </div>
                  </SelectItem>
                  {squads?.map((squad) => (
                    <SelectItem key={squad.id} value={squad.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: squad.color || '#6366F1' }}
                        />
                        {squad.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createInvitation.isPending}>
                {createInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Convite
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-2">
                Compartilhe este link com <strong>{email}</strong>:
              </p>
              <div className="flex items-center gap-2">
                <Input 
                  value={inviteLink} 
                  readOnly 
                  className="text-xs bg-background"
                />
                <Button size="icon" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              O convite expira em 7 dias
            </p>

            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
