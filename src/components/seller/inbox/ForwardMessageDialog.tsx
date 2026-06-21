import { useState } from 'react';
import { Forward, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useWebChatConversations } from '@/hooks/useWebChat';
import { cn } from '@/lib/utils';

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetConversationId: string) => void;
  conversationId: string | null;
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  onConfirm,
  conversationId,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState('');
  const { data: conversations } = useWebChatConversations({ tab: 'attending', limit: 100 });

  const filteredConversations = (conversations || [])
    .filter(c => c.id !== conversationId)
    .filter(c => {
      if (!search) return true;
      const name = c.visitor_name || '';
      return name.toLowerCase().includes(search.toLowerCase());
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Encaminhar mensagem
          </DialogTitle>
          <DialogDescription>
            Selecione a conversa para encaminhar
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {filteredConversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma conversa ativa encontrada
              </p>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                  onClick={() => {
                    onConfirm(conv.id);
                    onOpenChange(false);
                  }}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {(conv.visitor_name || 'V').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.visitor_name || 'Visitante'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.channel} • {conv.status}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
