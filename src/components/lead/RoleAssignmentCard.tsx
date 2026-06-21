import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { UserX, X } from 'lucide-react';
import { ReactNode } from 'react';

interface ProfileInfo {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  email?: string;
}

interface RoleAssignmentCardProps {
  label: string;
  icon: ReactNode;
  currentUser?: ProfileInfo | null;
  teamMembers: ProfileInfo[];
  onAssign: (userId: string | null) => Promise<void>;
}

export function RoleAssignmentCard({ label, icon, currentUser, teamMembers, onAssign }: RoleAssignmentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {currentUser ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUser.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {currentUser.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{currentUser.full_name}</p>
                {currentUser.email && (
                  <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onAssign(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <UserX className="h-5 w-5" />
              </div>
              <p className="text-sm">Nenhum {label} vinculado</p>
            </div>
            <Select onValueChange={(val) => onAssign(val)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Vincular ${label}`} />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map(member => (
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
  );
}
