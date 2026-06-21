import { useState } from 'react';
import { Plus, StickyNote, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ConversationNote {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  user?: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface InternalNotesProps {
  conversationId: string;
  className?: string;
}

export function InternalNotes({ conversationId, className }: InternalNotesProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Fetch notes
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['conversation-notes', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_notes')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return data.map((note: any) => ({
        ...note,
        user: note.profiles,
      })) as ConversationNote[];
    },
    enabled: !!conversationId,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('conversation_notes')
        .insert({
          conversation_id: conversationId,
          user_id: user?.id,
          content,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversationId] });
      setNoteText('');
      setIsAdding(false);
      toast({
        title: 'Nota adicionada',
        description: 'A nota foi salva com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar a nota.',
        variant: 'destructive',
      });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(noteText.trim());
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Notas Internas
        </h4>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
          <Textarea
            placeholder="Escreva uma nota interna..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[60px] text-sm bg-background"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setNoteText('');
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="flex-1"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nenhuma nota ainda
        </p>
      ) : (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                <Separator className="my-2" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px]">
                      {note.user?.full_name?.charAt(0) || <User className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <span>{note.user?.full_name || 'Usuário'}</span>
                  <span>•</span>
                  <span>
                    {format(new Date(note.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
