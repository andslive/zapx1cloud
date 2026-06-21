import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, ImageIcon, Mic, FileText, Video, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface FileAndMediaUploadProps {
  value?: string;
  multiple?: boolean;
  values?: string[];
  onChange: (url: string, fileName?: string) => void;
  onRemove?: () => void;
  type: 'image' | 'audio' | 'document' | 'video';
  bucket?: string;
  folder?: string;
  label?: string;
  description?: string;
  maxSizeMB?: number;
  showUrlInput?: boolean;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_TYPES = {
  image: {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
  },
  audio: {
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/ogg': ['.ogg'],
    'audio/aac': ['.aac'],
    'audio/m4a': ['.m4a'],
  },
  document: {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/plain': ['.txt'],
  },
  video: {
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
    'video/webm': ['.webm'],
  },
};

const TYPE_ICONS = {
  image: ImageIcon,
  audio: Mic,
  document: FileText,
  video: Video,
};

export function FileAndMediaUpload({
  value,
  multiple = false,
  values = [],
  onChange,
  onRemove,
  type,
  bucket = 'funnel-assets',
  folder = 'files',
  label,
  description,
  maxSizeMB = 15,
  showUrlInput = true,
  disabled = false,
  className,
}: FileAndMediaUploadProps) {
  const { profile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const maxFileSize = maxSizeMB * 1024 * 1024;
  const Icon = TYPE_ICONS[type];

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const cleanFileName = file.name.replace(/[^\w.-]/g, '_');
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const storagePath = `${profile.organization_id}/${folder}/${uniqueId}-${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);
      
      const fileUrl = publicUrlData.publicUrl;
      
      // Crucial: Use a promise wrapper or small delay if needed to ensure state isn't batch-updated
      // but the main fix is in the caller using the correct block reference.
      onChange(fileUrl, file.name);
      toast.success('Arquivo enviado com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsUploading(false);
    }
  }, [bucket, folder, onChange]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    if (multiple) {
      // Process files sequentially to avoid potential race conditions with state updates
      const processFiles = async () => {
        for (const file of acceptedFiles) {
          if (file.size <= maxFileSize) {
            await uploadFile(file);
          } else {
            toast.error(`Arquivo ${file.name} muito grande. Máximo ${maxSizeMB}MB.`);
          }
        }
      };
      processFiles();
    } else {
      const file = acceptedFiles[0];
      if (file.size > maxFileSize) {
        toast.error(`Arquivo muito grande. Máximo ${maxSizeMB}MB.`);
        return;
      }
      uploadFile(file);
    }
  }, [maxFileSize, maxSizeMB, multiple, uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES[type],
    multiple,
    maxFiles: multiple ? 0 : 1,
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
          "relative border-2 border-dashed rounded-xl transition-all cursor-pointer group min-h-[120px]",
          isDragActive 
            ? 'border-primary bg-primary/10 scale-[1.02]' 
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          (isUploading || disabled) && 'pointer-events-none opacity-60',
          "w-full flex items-center justify-center p-4"
        )}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Enviando...</span>
          </div>
        ) : (value && !multiple) ? (
          <div className="w-full flex flex-col items-center gap-2">
            {type === 'image' ? (
              <img
                src={value}
                alt="Preview"
                className="max-h-[200px] object-contain rounded-md"
              />
            ) : (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg w-full">
                <Icon className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{value.split('/').pop()}</p>
                  <p className="text-xs text-muted-foreground uppercase">{type}</p>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
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
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className={cn(
              "p-3 rounded-full transition-colors",
              isDragActive ? "bg-primary/20" : "bg-muted"
            )}>
              <Icon className={cn(
                "h-6 w-6",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div className="space-y-1">
              <p className={cn(
                "text-sm font-medium",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )}>
                {isDragActive ? 'Solte o arquivo aqui' : 'Arraste ou clique'}
              </p>
              <p className="text-xs text-muted-foreground">
                Até {maxSizeMB}MB
              </p>
            </div>
          </div>
        )}
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
              <Link className="h-3 w-3 mr-1" />
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