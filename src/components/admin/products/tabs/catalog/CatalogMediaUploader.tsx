import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, Image as ImageIcon, Video, FileText, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CatalogDocument {
  url: string;
  name: string;
  type?: string;
}

interface Props {
  organizationId: string;
  productId: string;
  images: string[];
  videos: string[];
  documents: CatalogDocument[];
  thumbnailUrl: string;
  onChange: (patch: {
    images?: string[];
    videos?: string[];
    documents?: CatalogDocument[];
    thumbnailUrl?: string;
  }) => void;
}

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;
const MAX_DOCS = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'application/pdf': ['.pdf'],
};

function classify(file: File): 'image' | 'video' | 'document' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'document';
  return null;
}

function pathFor(orgId: string, productId: string, kind: string, file: File) {
  const ts = Date.now();
  const rnd = Math.random().toString(36).substring(2, 8);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${orgId}/${productId}/${kind}/${ts}-${rnd}-${safeName}`;
}

export function CatalogMediaUploader({
  organizationId,
  productId,
  images,
  videos,
  documents,
  thumbnailUrl,
  onChange,
}: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!organizationId || !productId) {
        toast.error('Salve o produto antes de fazer upload.');
        return;
      }
      setUploading(true);
      const newImages = [...images];
      const newVideos = [...videos];
      const newDocs = [...documents];
      let nextThumb = thumbnailUrl;

      for (const file of files) {
        const kind = classify(file);
        if (!kind) {
          toast.error(`Formato não suportado: ${file.name}`);
          continue;
        }
        if (kind === 'image' && file.size > MAX_IMAGE_BYTES) {
          toast.error(`Imagem muito grande (máx 5MB): ${file.name}`);
          continue;
        }
        if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
          toast.error(`Vídeo muito grande (máx 25MB): ${file.name}`);
          continue;
        }
        if (kind === 'document' && file.size > MAX_DOC_BYTES) {
          toast.error(`PDF muito grande (máx 10MB): ${file.name}`);
          continue;
        }
        if (kind === 'image' && newImages.length >= MAX_IMAGES) {
          toast.error(`Máximo de ${MAX_IMAGES} imagens.`);
          continue;
        }
        if (kind === 'video' && newVideos.length >= MAX_VIDEOS) {
          toast.error(`Máximo de ${MAX_VIDEOS} vídeos.`);
          continue;
        }
        if (kind === 'document' && newDocs.length >= MAX_DOCS) {
          toast.error(`Máximo de ${MAX_DOCS} documentos.`);
          continue;
        }

        const path = pathFor(organizationId, productId, kind, file);
        const { error: upErr } = await supabase.storage
          .from('catalog-media')
          .upload(path, file, { upsert: false, contentType: file.type });

        if (upErr) {
          console.error('upload error', upErr);
          toast.error(`Falha ao enviar ${file.name}: ${upErr.message}`);
          continue;
        }

        const { data } = supabase.storage.from('catalog-media').getPublicUrl(path);
        const url = data.publicUrl;

        if (kind === 'image') {
          newImages.push(url);
          if (!nextThumb) nextThumb = url;
        } else if (kind === 'video') {
          newVideos.push(url);
        } else {
          newDocs.push({ url, name: file.name, type: file.type });
        }
      }

      onChange({
        images: newImages,
        videos: newVideos,
        documents: newDocs,
        thumbnailUrl: nextThumb,
      });
      setUploading(false);
      toast.success('Upload concluído');
    },
    [organizationId, productId, images, videos, documents, thumbnailUrl, onChange]
  );

  const removeFromStorage = async (url: string) => {
    try {
      const marker = '/catalog-media/';
      const idx = url.indexOf(marker);
      if (idx === -1) return;
      const path = url.substring(idx + marker.length);
      await supabase.storage.from('catalog-media').remove([path]);
    } catch (e) {
      console.warn('storage remove failed (non-fatal):', e);
    }
  };

  const removeImage = async (url: string) => {
    await removeFromStorage(url);
    const next = images.filter((u) => u !== url);
    const nextThumb = thumbnailUrl === url ? next[0] || '' : thumbnailUrl;
    onChange({ images: next, thumbnailUrl: nextThumb });
  };

  const removeVideo = async (url: string) => {
    await removeFromStorage(url);
    onChange({ videos: videos.filter((u) => u !== url) });
  };

  const removeDocument = async (url: string) => {
    await removeFromStorage(url);
    onChange({ documents: documents.filter((d) => d.url !== url) });
  };

  const setThumb = (url: string) => onChange({ thumbnailUrl: url });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: ACCEPT,
    multiple: true,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
          isDragActive
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          uploading && 'opacity-60 pointer-events-none'
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Enviando arquivos...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragActive ? 'Solte os arquivos aqui' : 'Arraste fotos, vídeos ou PDFs'}
            </p>
            <p className="text-xs text-muted-foreground">
              📷 JPG/PNG/WEBP até 5MB · 🎬 MP4/MOV até 25MB · 📄 PDF até 10MB
            </p>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">
              📷 Imagens ({images.length}/{MAX_IMAGES})
            </p>
            <p className="text-xs text-muted-foreground">Clique na ⭐ para definir como capa</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((url) => (
              <div key={url} className="relative group rounded-lg overflow-hidden border border-border">
                <img src={url} alt="" className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant={thumbnailUrl === url ? 'default' : 'secondary'}
                    className="h-7 w-7"
                    onClick={() => setThumb(url)}
                    title="Definir como capa"
                  >
                    <Star className={cn('h-3.5 w-3.5', thumbnailUrl === url && 'fill-current')} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    onClick={() => removeImage(url)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {thumbnailUrl === url && (
                  <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded">
                    capa
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            🎬 Vídeos ({videos.length}/{MAX_VIDEOS})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {videos.map((url) => (
              <div key={url} className="relative group rounded-lg overflow-hidden border border-border bg-black">
                <video src={url} controls className="w-full h-32 object-contain" />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeVideo(url)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            📄 Documentos ({documents.length}/{MAX_DOCS})
          </p>
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <div
                key={doc.url}
                className="flex items-center gap-2 p-2 border border-border rounded-lg bg-muted/30"
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm flex-1 truncate hover:underline"
                >
                  {doc.name}
                </a>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeDocument(doc.url)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length === 0 && videos.length === 0 && documents.length === 0 && (
        <div className="flex items-center justify-center gap-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> 0 fotos</span>
          <span className="flex items-center gap-1"><Video className="h-3 w-3" /> 0 vídeos</span>
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 0 docs</span>
        </div>
      )}
    </div>
  );
}
