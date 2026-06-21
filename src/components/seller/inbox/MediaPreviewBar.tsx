import { X, FileText, Loader2, Image as ImageIcon, Video as VideoIcon, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MediaKind } from './MediaAttachment';

export interface PendingAttachment {
  file: File;
  kind: MediaKind;
  /** URL local (createObjectURL) para prévia */
  previewUrl: string;
  caption: string;
  /** Para áudios gravados: duração em ms */
  durationMs?: number;
}

interface MediaPreviewBarProps {
  attachment: PendingAttachment;
  onCaptionChange: (v: string) => void;
  onRemove: () => void;
  isUploading: boolean;
  progress: number;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaPreviewBar({
  attachment,
  onCaptionChange,
  onRemove,
  isUploading,
  progress,
}: MediaPreviewBarProps) {
  const { file, kind, previewUrl, caption } = attachment;

  return (
    <div className="px-3 py-2 border-t border-border bg-muted/30">
      <div className="flex items-center gap-3">
        {/* Thumb */}
        <div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden bg-background border border-border flex items-center justify-center">
          {kind === 'image' && (
            <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
          )}
          {kind === 'video' && (
            <>
              <video src={previewUrl} className="h-full w-full object-cover" muted />
              <VideoIcon className="absolute h-5 w-5 text-white drop-shadow" />
            </>
          )}
          {kind === 'audio' && <Mic className="h-6 w-6 text-primary" />}
          {kind === 'document' && <FileText className="h-6 w-6 text-muted-foreground" />}

          {isUploading && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Info + caption */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-medium truncate">{file.name || 'arquivo'}</p>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {formatBytes(file.size)}
            </span>
          </div>
          {(kind === 'image' || kind === 'video' || kind === 'document') && (
            <Input
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Adicionar legenda…"
              className="h-7 text-xs"
              disabled={isUploading}
            />
          )}
          {kind === 'audio' && (
            <audio src={previewUrl} controls className="h-7 w-full" />
          )}
          {isUploading && (
            <div className="h-1 bg-muted rounded mt-1 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Remove */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onRemove}
          disabled={isUploading}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
