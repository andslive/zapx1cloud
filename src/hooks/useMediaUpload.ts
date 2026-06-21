import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MediaKind, MediaPayload } from '@/components/seller/inbox/MediaAttachment';

const BUCKET = 'chat-media';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — alinhado ao limite prático do WhatsApp

export interface UploadResult {
  media: MediaPayload;
  path: string;
}

export interface UseMediaUploadReturn {
  upload: (file: File, opts?: { kind?: MediaKind; durationMs?: number }) => Promise<UploadResult>;
  isUploading: boolean;
  progress: number; // 0..100 (best effort — Supabase não dá progresso real, então oscila entre 0/50/100)
  error: string | null;
  reset: () => void;
}

function inferKind(file: File, hint?: MediaKind): MediaKind {
  if (hint) return hint;
  const m = file.type;
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

function safeFilename(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

async function probeImage(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function probeMediaDuration(file: File, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const ms = isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      resolve(ms);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

export function useMediaUpload(): UseMediaUploadReturn {
  const { user, profile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback<UseMediaUploadReturn['upload']>(async (file, opts) => {
    setError(null);
    if (!file) throw new Error('Arquivo inválido');
    if (file.size > MAX_BYTES) {
      const msg = `Arquivo muito grande (máx ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`;
      setError(msg);
      throw new Error(msg);
    }
    const userId = user?.id;
    if (!userId) {
      const msg = 'Sessão inválida para upload. Faça login novamente.';
      setError(msg);
      throw new Error(msg);
    }
    // organization_id pode estar ausente para super_admins — usa "_" como fallback no path
    const orgId = profile?.organization_id || '_';

    setIsUploading(true);
    setProgress(10);

    try {
      const kind = inferKind(file, opts?.kind);
      const ext = file.name.includes('.') ? file.name.split('.').pop() : kind === 'audio' ? 'webm' : 'bin';
      const baseName = safeFilename(file.name.replace(/\.[^.]+$/, '')) || kind;
      const path = `${orgId}/${userId}/${Date.now()}-${baseName}.${ext}`;

      setProgress(40);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;

      setProgress(80);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      // Probes leves de metadados (best effort)
      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = opts?.durationMs ?? null;

      if (kind === 'image') {
        const dim = await probeImage(file);
        if (dim) { width = dim.width; height = dim.height; }
      } else if (kind === 'audio' && durationMs == null) {
        durationMs = await probeMediaDuration(file, false);
      } else if (kind === 'video') {
        durationMs = durationMs ?? (await probeMediaDuration(file, true));
      }

      const media: MediaPayload = {
        kind,
        url,
        mime: file.type || null,
        filename: file.name || null,
        size_bytes: file.size,
        duration_ms: durationMs,
        width,
        height,
        caption: null,
        thumbnail_url: null,
      };

      setProgress(100);
      return { media, path };
    } catch (e: any) {
      const msg = e?.message || 'Falha no upload.';
      setError(msg);
      throw e;
    } finally {
      setIsUploading(false);
    }
  }, [profile?.organization_id, user?.id]);

  return { upload, isUploading, progress, error, reset };
}
