import { ImageUpload } from '@/components/ui/image-upload';

interface SquadIconUploadProps {
  currentIcon?: string | null;
  onIconChange: (url: string | null) => void;
  squadName?: string;
  color?: string;
}

export function SquadIconUpload({ currentIcon, onIconChange, squadName = '' }: SquadIconUploadProps) {
  return (
    <ImageUpload
      value={currentIcon || ''}
      onChange={(url) => onIconChange(url || null)}
      onRemove={() => onIconChange(null)}
      bucket="squad-icons"
      folder="icons"
      label="Ícone do Squad"
      description="PNG, JPG ou WEBP. Máx 1MB."
      aspectRatio="square"
      maxSizeMB={1}
      showUrlInput={false}
    />
  );
}
