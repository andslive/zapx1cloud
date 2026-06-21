import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useReleases, useMarkReleaseRead } from '@/hooks/useReleases';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Sparkles, Wrench, Bug, BookOpen, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TYPE_META: Record<string, { label: string; icon: any; cls: string }> = {
  feature: { label: 'Nova feature', icon: Sparkles, cls: 'bg-primary/10 text-primary border-primary/20' },
  improvement: { label: 'Melhoria', icon: Wrench, cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  fix: { label: 'Correção', icon: Bug, cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

export default function Updates() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<string | null>(null);
  const { data: releases = [] } = useReleases({ published: true });
  const markRead = useMarkReleaseRead();

  const { data: reads } = useQuery({
    queryKey: ['my-release-reads', user?.id],
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data } = await supabase.from('platform_release_reads').select('release_id').eq('user_id', user.id);
      return (data || []).map(r => r.release_id);
    },
    enabled: !!user,
  });
  const readSet = new Set(reads || []);

  const filtered = useMemo(() => {
    if (!filter) return releases;
    return releases.filter(r => (r.release_types || []).includes(filter));
  }, [releases, filter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Novidades</h1>
          </div>
          <div className="ml-auto">
            <Link to="/ajuda">
              <Button variant="outline" size="sm" className="gap-2"><BookOpen className="h-4 w-4" /> Central de Ajuda</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={!filter ? 'default' : 'outline'} onClick={() => setFilter(null)}>Todas</Button>
          {Object.entries(TYPE_META).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} onClick={() => setFilter(key)} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </Button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhuma atualização ainda.</div>
        ) : (
          <div className="space-y-4">
            {filtered.map(release => {
              const unread = !readSet.has(release.id);
              return (
                <Card
                  key={release.id}
                  className={unread ? 'border-primary/40 shadow-sm' : ''}
                  onMouseEnter={() => unread && markRead.mutate(release.id)}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {release.version && <Badge variant="outline" className="font-mono text-xs">v{release.version}</Badge>}
                          {(release.release_types || []).map(t => {
                            const meta = TYPE_META[t];
                            if (!meta) return null;
                            const Icon = meta.icon;
                            return (
                              <Badge key={t} className={`gap-1 border ${meta.cls}`} variant="outline">
                                <Icon className="h-3 w-3" /> {meta.label}
                              </Badge>
                            );
                          })}
                          {unread && <Badge variant="default" className="text-[10px]">Novo</Badge>}
                        </div>
                        <h3 className="text-lg font-semibold">{release.title}</h3>
                        {release.summary && <p className="text-sm text-muted-foreground">{release.summary}</p>}
                        {release.published_at && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(release.published_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </div>
                        )}
                      </div>
                    </div>

                    {release.cover_image_url && (
                      <img src={release.cover_image_url} alt="" className="w-full rounded-lg border" />
                    )}

                    {release.content_html && (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none prose-img:rounded-lg prose-a:text-primary"
                        dangerouslySetInnerHTML={{ __html: release.content_html }}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
