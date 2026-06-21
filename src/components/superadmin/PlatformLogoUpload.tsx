import { ImageUpload } from '@/components/ui/image-upload';

interface PlatformLogoUploadProps {
  currentUrl?: string;
  onUpload: (url: string) => void;
  onRemove: () => void;
  type: 'logo' | 'logo_dark' | 'favicon' | 'login_bg';
  label: string;
  description?: string;
  previewBg?: 'light' | 'dark';
  aspectRatio?: 'square' | 'wide';
}

export function PlatformLogoUpload({
  currentUrl,
  onUpload,
  onRemove,
  type,
  label,
  description,
  aspectRatio = 'wide',
}: PlatformLogoUploadProps) {
  return (
    <ImageUpload
      value={currentUrl}
      onChange={onUpload}
      onRemove={onRemove}
      bucket="platform-assets"
      folder={type}
      label={label}
      description={description}
      aspectRatio={aspectRatio === 'square' ? 'square' : 'wide'}
      maxSizeMB={2}
      showUrlInput={false}
    />
  );
}
