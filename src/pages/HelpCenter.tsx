import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHelpCategories, useHelpArticles } from '@/hooks/useHelp';
import { useIsSuperAdmin } from '@/hooks/useSuperAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowLeft, BookOpen, Sparkles, FileText } from 'lucide-react';
import * as Icons from 'lucide-react';

function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && (Icons as any)[name]) || BookOpen;
  return <Cmp className={className} />;
}

export default function HelpCenter() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: rawCategories = [] } = useHelpCategories();
  const { data: articles = [] } = useHelpArticles({ published: true, search: search || undefined });
  const { data: isSuperAdmin = false } = useIsSuperAdmin();

  const categories = useMemo(
    () => rawCategories.filter((c: any) => c.visibility !== 'super_admin_only' || isSuperAdmin),
    [rawCategories, isSuperAdmin]
  );
  const allowedCategoryIds = useMemo(() => new Set(categories.map((c: any) => c.id)), [categories]);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    articles.forEach((a: any) => {
      const key = a.category_id || 'uncategorized';
      if (a.category_id && !allowedCategoryIds.has(a.category_id)) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [articles, allowedCategoryIds]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Central de Ajuda</h1>
          </div>
          <div className="ml-auto">
            <Link to="/novidades">
              <Button variant="outline" size="sm" className="gap-2">
                <Sparkles className="h-4 w-4" /> Novidades
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border p-6 sm:p-8 text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold">Como podemos te ajudar?</h2>
          <p className="text-muted-foreground">Tire suas dúvidas, aprenda novos recursos e descubra dicas.</p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </div>

        {!search && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map(cat => (
              <Card key={cat.id} className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                <CardContent className="p-4 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-lg bg-primary/10 flex items-center justify-center">
                    <CategoryIcon name={cat.icon} className="h-5 w-5 text-primary" />
                  </div>
                  <div className="font-medium text-sm">{cat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(grouped.get(cat.id)?.length || 0)} artigos
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-6">
          {categories.map(cat => {
            const items = grouped.get(cat.id) || [];
            if (items.length === 0) return null;
            return (
              <section key={cat.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <CategoryIcon name={cat.icon} className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{cat.name}</h3>
                  <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map(article => (
                    <Link key={article.id} to={`/ajuda/${article.slug}`} className="block">
                      <Card className="hover:border-primary/40 hover:shadow-sm transition-all">
                        <CardContent className="p-3 sm:p-4 flex items-start gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{article.title}</div>
                            {article.summary && (
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{article.summary}</div>
                            )}
                          </div>
                          {article.related_release_id && (
                            <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                              <Sparkles className="h-3 w-3" /> Novidade
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          {articles.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {search ? 'Nenhum artigo encontrado para sua busca.' : 'Ainda não há artigos publicados.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
