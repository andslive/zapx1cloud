import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { 
  User, 
  Package, 
  FileText, 
  MessageSquare,
  BookOpen,
  Search,
  Loader2
} from 'lucide-react';

interface GlobalSearchProps {
  onSelectLead?: (leadId: string) => void;
  onSelectProduct?: (productId: string) => void;
}

export function GlobalSearch({ onSelectLead, onSelectProduct }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { profile } = useAuth();

  // Handle keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Search query
  const { data: results, isLoading } = useQuery({
    queryKey: ['global-search', searchQuery, profile?.organization_id],
    queryFn: async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        return { leads: [], products: [], materials: [], objections: [], knowledge: [] };
      }

      const searchTerm = `%${searchQuery.toLowerCase()}%`;

      const [leadsResult, productsResult, materialsResult, objectionsResult, knowledgeResult] = await Promise.all([
        supabase
          .from('leads')
          .select('id, name, company, email')
          .or(`name.ilike.${searchTerm},company.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from('products')
          .select('id, name, description')
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from('materials')
          .select('id, name, type')
          .ilike('name', searchTerm)
          .limit(5),
        supabase
          .from('objections')
          .select('id, what_they_say, category')
          .or(`what_they_say.ilike.${searchTerm},category.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from('ai_knowledge_base')
          .select('id, title, category')
          .or(`title.ilike.${searchTerm},category.ilike.${searchTerm}`)
          .limit(5)
      ]);

      return {
        leads: leadsResult.data || [],
        products: productsResult.data || [],
        materials: materialsResult.data || [],
        objections: objectionsResult.data || [],
        knowledge: knowledgeResult.data || []
      };
    },
    enabled: searchQuery.length >= 2
  });

  const hasResults = results && (
    results.leads.length > 0 ||
    results.products.length > 0 ||
    results.materials.length > 0 ||
    results.objections.length > 0 ||
    results.knowledge.length > 0
  );

  const handleSelect = useCallback((type: string, id: string) => {
    setOpen(false);
    setSearchQuery('');
    
    if (type === 'lead' && onSelectLead) {
      onSelectLead(id);
    } else if (type === 'product' && onSelectProduct) {
      onSelectProduct(id);
    }
  }, [onSelectLead, onSelectProduct]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-64 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-secondary border border-border rounded-md hover:bg-secondary/80 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Buscar...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Buscar leads, produtos, materiais..." 
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          {isLoading && searchQuery.length >= 2 && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && searchQuery.length >= 2 && !hasResults && (
            <CommandEmpty>
              Nenhum resultado para "{searchQuery}"
            </CommandEmpty>
          )}

          {searchQuery.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar
            </div>
          )}

          {results?.leads && results.leads.length > 0 && (
            <CommandGroup heading="Leads">
              {results.leads.map((lead) => (
                <CommandItem 
                  key={lead.id} 
                  value={`lead-${lead.id}`}
                  onSelect={() => handleSelect('lead', lead.id)}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4 text-blue-500" />
                  <div className="flex flex-col">
                    <span>{lead.name}</span>
                    {lead.company && (
                      <span className="text-xs text-muted-foreground">{lead.company}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results?.products && results.products.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Produtos">
                {results.products.map((product) => (
                  <CommandItem 
                    key={product.id} 
                    value={`product-${product.id}`}
                    onSelect={() => handleSelect('product', product.id)}
                    className="cursor-pointer"
                  >
                    <Package className="mr-2 h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <span>{product.name}</span>
                      {product.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {product.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results?.materials && results.materials.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Materiais">
                {results.materials.map((material) => (
                  <CommandItem 
                    key={material.id} 
                    value={`material-${material.id}`}
                    className="cursor-pointer"
                  >
                    <FileText className="mr-2 h-4 w-4 text-green-500" />
                    <div className="flex flex-col">
                      <span>{material.name}</span>
                      <span className="text-xs text-muted-foreground">{material.type}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results?.objections && results.objections.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Objeções">
                {results.objections.map((objection) => (
                  <CommandItem 
                    key={objection.id} 
                    value={`objection-${objection.id}`}
                    className="cursor-pointer"
                  >
                    <MessageSquare className="mr-2 h-4 w-4 text-orange-500" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{objection.what_they_say}</span>
                      <span className="text-xs text-muted-foreground">{objection.category}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results?.knowledge && results.knowledge.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Base de Conhecimento">
                {results.knowledge.map((item) => (
                  <CommandItem 
                    key={item.id} 
                    value={`knowledge-${item.id}`}
                    className="cursor-pointer"
                  >
                    <BookOpen className="mr-2 h-4 w-4 text-purple-500" />
                    <div className="flex flex-col">
                      <span>{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.category}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
