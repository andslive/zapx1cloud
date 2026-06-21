import { useState, useEffect } from 'react';
import { Search, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface QuickReply {
  id: string;
  category: string;
  title: string;
  content: string;
  shortcut: string | null;
}

interface QuickRepliesPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (content: string) => void;
  leadName?: string;
  productName?: string;
}

export function QuickRepliesPopover({
  open,
  onOpenChange,
  onSelect,
  leadName = 'Cliente',
  productName = 'nosso produto',
}: QuickRepliesPopoverProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  const { data: quickReplies = [], isLoading } = useQuery({
    queryKey: ['quick-replies', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return data as QuickReply[];
    },
    enabled: !!profile?.organization_id && open,
  });

  // Filter by search
  const filteredReplies = quickReplies.filter(reply =>
    reply.title.toLowerCase().includes(search.toLowerCase()) ||
    reply.content.toLowerCase().includes(search.toLowerCase()) ||
    reply.shortcut?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groupedReplies = filteredReplies.reduce((acc, reply) => {
    if (!acc[reply.category]) {
      acc[reply.category] = [];
    }
    acc[reply.category].push(reply);
    return acc;
  }, {} as Record<string, QuickReply[]>);

  // Replace variables in content
  const processContent = (content: string) => {
    return content
      .replace(/\{\{nome\}\}/gi, leadName)
      .replace(/\{\{produto\}\}/gi, productName)
      .replace(/\{\{name\}\}/gi, leadName)
      .replace(/\{\{product\}\}/gi, productName);
  };

  const handleSelect = (reply: QuickReply) => {
    onSelect(processContent(reply.content));
    onOpenChange(false);
    setSearch('');
  };

  // Default replies if none exist
  const defaultReplies: QuickReply[] = [
    {
      id: 'default-1',
      category: 'Saudações',
      title: 'Boas-vindas',
      content: 'Olá {{nome}}! 👋\n\nSeja bem-vindo(a)! Como posso ajudar você hoje?',
      shortcut: '/ola',
    },
    {
      id: 'default-2',
      category: 'Saudações',
      title: 'Bom dia',
      content: 'Bom dia, {{nome}}! ☀️\n\nEspero que esteja tendo um ótimo dia. Em que posso ajudar?',
      shortcut: '/bomdia',
    },
    {
      id: 'default-3',
      category: 'Vendas',
      title: 'Apresentação do produto',
      content: 'O {{produto}} é a solução perfeita para você! 🎯\n\nPosso te mostrar como ele pode ajudar no seu caso específico?',
      shortcut: '/produto',
    },
    {
      id: 'default-4',
      category: 'Vendas',
      title: 'Próximos passos',
      content: 'Perfeito, {{nome}}! ✅\n\nVamos agendar uma demonstração para você conhecer melhor o {{produto}}?\n\nQual seria o melhor horário para você?',
      shortcut: '/demo',
    },
    {
      id: 'default-5',
      category: 'Encerramento',
      title: 'Despedida',
      content: 'Obrigado pelo contato, {{nome}}! 🙏\n\nFico à disposição para qualquer dúvida. Até mais!',
      shortcut: '/tchau',
    },
  ];

  const displayReplies = quickReplies.length > 0 ? filteredReplies : defaultReplies.filter(reply =>
    reply.title.toLowerCase().includes(search.toLowerCase()) ||
    reply.content.toLowerCase().includes(search.toLowerCase())
  );

  const displayGrouped = displayReplies.reduce((acc, reply) => {
    if (!acc[reply.category]) {
      acc[reply.category] = [];
    }
    acc[reply.category].push(reply);
    return acc;
  }, {} as Record<string, QuickReply[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Respostas Rápidas
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar resposta ou atalho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Replies List */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(displayGrouped).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma resposta encontrada</p>
            </div>
          ) : (
            <div className="p-2">
              {Object.entries(displayGrouped).map(([category, replies]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {replies.map((reply) => (
                      <button
                        key={reply.id}
                        onClick={() => handleSelect(reply)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg transition-colors",
                          "hover:bg-accent group"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{reply.title}</span>
                              {reply.shortcut && (
                                <Badge variant="secondary" className="text-[10px] h-5">
                                  {reply.shortcut}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {processContent(reply.content)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{'{{nome}}'}</kbd> e{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{'{{produto}}'}</kbd> para variáveis dinâmicas
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
