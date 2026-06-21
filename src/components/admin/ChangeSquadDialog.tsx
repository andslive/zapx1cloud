import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useSquads } from '@/hooks/useSquads';
import { useAddMemberToSquad, useRemoveMemberFromSquad, TeamMember } from '@/hooks/useTeam';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface ChangeSquadDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeSquadDialog({ member, open, onOpenChange }: ChangeSquadDialogProps) {
  const [selectedSquadId, setSelectedSquadId] = useState<string>('none');
  const [isLoading, setIsLoading] = useState(false);
  
  const { data: squads } = useSquads();
  const addToSquad = useAddMemberToSquad();
  const removeFromSquad = useRemoveMemberFromSquad();

  const currentSquad = member?.squads[0];

  const handleSave = async () => {
    if (!member) return;
    
    setIsLoading(true);
    try {
      // Remove from current squad if exists
      if (currentSquad) {
        await removeFromSquad.mutateAsync({
          userId: member.id,
          squadId: currentSquad.id,
        });
      }
      
      // Add to new squad if selected
      if (selectedSquadId !== 'none') {
        await addToSquad.mutateAsync({
          userId: member.id,
          squadId: selectedSquadId,
        });
      }
      
      toast.success('Squad atualizado!');
      onOpenChange(false);
    } catch (error) {
      toast.error('Erro ao atualizar squad');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && member) {
      setSelectedSquadId(currentSquad?.id || 'none');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Gerenciar Squad
          </DialogTitle>
          <DialogDescription>
            Altere o squad deste membro da equipe
          </DialogDescription>
        </DialogHeader>
        
        {member && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar>
                <AvatarImage src={member.avatar_url || ''} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {member.full_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{member.full_name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>

            {currentSquad && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Squad atual:</p>
                <Badge 
                  variant="outline" 
                  className="text-sm"
                  style={{ 
                    backgroundColor: `${currentSquad.color}15`,
                    borderColor: `${currentSquad.color}40`,
                    color: currentSquad.color || undefined
                  }}
                >
                  <div 
                    className="h-2 w-2 rounded-full mr-2" 
                    style={{ backgroundColor: currentSquad.color || '#6366F1' }}
                  />
                  {currentSquad.name}
                </Badge>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Novo Squad</p>
              <Select value={selectedSquadId} onValueChange={setSelectedSquadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Remover do squad
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
          </div>
        )}

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
