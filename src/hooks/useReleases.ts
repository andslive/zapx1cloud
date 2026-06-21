import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';

export type PlatformRelease = Tables<'platform_releases'>;

export function useReleases(opts?: { published?: boolean }) {
  return useQuery({
    queryKey: ['platform-releases', opts],
    queryFn: async () => {
      let q = supabase.from('platform_releases').select('*').order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      if (opts?.published !== undefined) q = q.eq('is_published', opts.published);
      const { data, error } = await q;
      if (error) throw error;
      return data as PlatformRelease[];
    },
  });
}

export function useRelease(id: string | undefined) {
  return useQuery({
    queryKey: ['platform-release', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('platform_releases').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as PlatformRelease | null;
    },
    enabled: !!id,
  });
}

export function useUnreadReleasesCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['unread-releases-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data: releases } = await supabase.from('platform_releases').select('id').eq('is_published', true);
      const { data: reads } = await supabase.from('platform_release_reads').select('release_id').eq('user_id', user.id);
      const readSet = new Set((reads || []).map(r => r.release_id));
      return (releases || []).filter(r => !readSet.has(r.id)).length;
    },
    enabled: !!user,
    refetchInterval: 300_000, // 60s -> 5min
    refetchIntervalInBackground: false,
  });
}

export function useMarkReleaseRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: string) => {
      if (!user) return;
      await supabase.from('platform_release_reads').upsert({ user_id: user.id, release_id: releaseId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unread-releases-count'] }),
  });
}

interface UpsertReleaseInput extends TablesInsert<'platform_releases'> {
  id?: string;
  publish_as_article?: boolean;
  article_category_id?: string | null;
}

export function useUpsertRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertReleaseInput) => {
      const { publish_as_article, article_category_id, id, ...rest } = input;
      let release: PlatformRelease;
      if (id) {
        const { data, error } = await supabase.from('platform_releases').update(rest as TablesUpdate<'platform_releases'>).eq('id', id).select().single();
        if (error) throw error;
        release = data as PlatformRelease;
      } else {
        const { data, error } = await supabase.from('platform_releases').insert(rest).select().single();
        if (error) throw error;
        release = data as PlatformRelease;
      }

      if (publish_as_article && release.is_published) {
        // Verifica se já existe artigo vinculado
        const { data: existing } = await supabase.from('help_articles').select('id').eq('related_release_id', release.id).maybeSingle();
        const slug = `release-${(release.version || release.id).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${release.id.slice(0, 6)}`;
        const articlePayload = {
          title: release.title,
          slug,
          summary: release.summary,
          content_json: release.content_json,
          content_html: release.content_html,
          cover_image_url: release.cover_image_url,
          tags: release.release_types,
          is_published: true,
          published_at: new Date().toISOString(),
          related_release_id: release.id,
          category_id: article_category_id || null,
        };
        if (existing?.id) {
          await supabase.from('help_articles').update(articlePayload).eq('id', existing.id);
        } else {
          await supabase.from('help_articles').insert(articlePayload);
        }
      }
      return release;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-releases'] });
      qc.invalidateQueries({ queryKey: ['help-articles'] });
      qc.invalidateQueries({ queryKey: ['unread-releases-count'] });
    },
  });
}

export function useDeleteRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_releases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-releases'] });
      qc.invalidateQueries({ queryKey: ['unread-releases-count'] });
    },
  });
}
