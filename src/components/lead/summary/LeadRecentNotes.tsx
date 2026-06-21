import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StickyNote, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadNotes } from '@/hooks/useLeadNotes';

interface Props {
  leadId: string;
  onSeeAll?: () => void;
}

export function LeadRecentNotes({ leadId, onSeeAll }: Props) {
  const { data: notes = [], isLoading } = useLeadNotes(leadId);
  const recent = notes.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Notas recentes
        </CardTitle>
        {notes.length > 0 && onSeeAll && (
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onSeeAll}>
            Ver todas <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota registrada ainda</p>
        ) : (
          recent.map((n) => (
            <div key={n.id} className="flex gap-2.5">
              <Avatar className="h-7 w-7 mt-0.5">
                <AvatarFallback className="text-[10px]">
                  {n.profiles?.full_name?.split(' ').map((p) => p[0]).join('').slice(0, 2) || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground truncate">
                    {n.profiles?.full_name || 'Usuário'}
                  </span>
                  <span>·</span>
                  <span>{format(parseISO(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                <p className="text-sm mt-0.5 line-clamp-3 whitespace-pre-wrap">{n.content}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
