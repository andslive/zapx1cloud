import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  bucket?: string;
  folder?: string;
  label?: string;
  description?: string;
  aspectRatio?: 'square' | 'wide' | 'banner';
  maxSizeMB?: number;
  showUrlInput?: boolean;
  disabled?: boolean;
  className?: string;
}

const MAX_FILE_SIZE_DEFAULT = 2 * 1024 * 1024; // 2MB

const ACCEPTED_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/svg+xml': ['.svg'],
};

const aspectClasses = {
  square: 'aspect-square max-w-[160px]',
  wide: 'aspect-[3/1] max-w-[320px]',
  banner: 'aspect-[16/9] max-w-[400px]',
};

export function ImageUpload({
  value,
  onChange,
  onRemove,
  bucket = 'product-documents',
  folder = 'images',
  label,
  description,
  aspectRatio = 'square',
  maxSizeMB = 2,
  showUrlInput = true,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const maxFileSize = maxSizeMB * 1024 * 1024;

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Check if bucket is public by trying to get public URL
      const { data: bucketData } = await supabase.storage.getBucket(bucket);
      
      let imageUrl: string;
      
      if (bucketData?.public) {
        // Use public URL for public buckets
        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      } else {
        // Use signed URL for private buckets (valid for 1 year)
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(fileName, 60 * 60 * 24 * 365);
        
        if (error) throw error;
        imageUrl = data.signedUrl;
      }

      onChange(imageUrl);
      toast.success('Imagem enviada com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar imagem: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > maxFileSize) {
      toast.error(`Arquivo muito grande. Máximo ${maxSizeMB}MB.`);
      return;
    }

    uploadFile(file);
  }, [maxFileSize, maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: isUploading || disabled,
  });

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    } else {
      onChange('');
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}

      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-xl transition-all cursor-pointer group",
          aspectClasses[aspectRatio],
          isDragActive 
            ? 'border-primary bg-primary/10 scale-[1.02]' 
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          (isUploading || disabled) && 'pointer-events-none opacity-60',
          "w-full"
        )}
      >
        <input {...getInputProps()} />

        <div className="absolute inset-0 flex items-center justify-center rounded-xl overflow-hidden bg-muted/30">
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Enviando...</span>
            </div>
          ) : value ? (
            <>
              <img
                src={value}
                alt={label || 'Upload'}
                className="object-contain w-full h-full p-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                }}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  className="h-8"
                >
                  <X className="h-4 w-4 mr-1" />
                  Remover
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <div className={cn(
                "p-3 rounded-full transition-colors",
                isDragActive ? "bg-primary/20" : "bg-muted"
              )}>
                <ImageIcon className={cn(
                  "h-6 w-6",
                  isDragActive ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div className="space-y-1">
                <p className={cn(
                  "text-sm font-medium",
                  isDragActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {isDragActive ? 'Solte a imagem aqui' : 'Arraste ou clique'}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WEBP até {maxSizeMB}MB
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {showUrlInput && (
        <div className="space-y-2">
          {!showUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUrl(true)}
              className="text-xs h-7"
            >
              Ou cole uma URL
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowUrl(false)}
                className="h-8 px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
