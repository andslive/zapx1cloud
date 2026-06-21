import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSquadMembers, useAddSquadMember, useRemoveSquadMember, useUpdateSquadMemberRole, Squad } from '@/hooks/useSquads';
import { useTeamMembers } from '@/hooks/useTeam';
import { UserPlus, Crown, User, Trash2, Loader2 } from 'lucide-react';

interface SquadMembersDialogProps {
  squad: Squad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SquadMembersDialog({ squad, open, onOpenChange }: SquadMembersDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const { data: members, isLoading } = useSquadMembers(squad?.id);
  const { data: teamMembers } = useTeamMembers();
  const addMember = useAddSquadMember();
  const removeMember = useRemoveSquadMember();
  const updateRole = useUpdateSquadMemberRole();

  if (!squad) return null;

  const memberIds = new Set(members?.map(m => m.user_id) || []);
  const availableMembers = teamMembers?.filter(t => !memberIds.has(t.id)) || [];

  const handleAddMember = () => {
    if (selectedUserId && squad.id) {
      addMember.mutate({ squadId: squad.id, userId: selectedUserId });
      setSelectedUserId('');
    }
  };

  const handleRemoveMember = (memberId: string) => {
    if (squad.id) {
      removeMember.mutate({ squadId: squad.id, memberId });
    }
  };

  const handleToggleLeader = (memberId: string, currentRole: string) => {
    if (squad.id) {
      updateRole.mutate({
        memberId,
        squadId: squad.id,
        role: currentRole === 'leader' ? 'member' : 'leader'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {squad.icon_url ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={squad.icon_url} />
                <AvatarFallback style={{ backgroundColor: squad.color || undefined }}>
                  {squad.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground"
                style={{ backgroundColor: squad.color || 'hsl(var(--primary))' }}
              >
                {squad.name.charAt(0)}
              </div>
            )}
            Membros do {squad.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Add Member */}
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar membro..." />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.length === 0 ? (
                  <div className="py-2 px-3 text-sm text-muted-foreground">
                    Todos os membros já estão no squad
                  </div>
                ) : (
                  availableMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddMember}
              disabled={!selectedUserId || addMember.isPending}
            >
              {addMember.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Members List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : members?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum membro no squad
              </p>
            ) : (
              members?.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {member.profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {member.profile?.full_name || 'Usuário'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.profile?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleLeader(member.id, member.role)}
                    >
                      {member.role === 'leader' ? (
                        <Crown className="h-4 w-4 text-warning" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-warning" /> Líder
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> Membro
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
