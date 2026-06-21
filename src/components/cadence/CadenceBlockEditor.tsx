import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  MessageSquare, 
  Mic, 
  FileText, 
  MousePointer, 
  Image, 
  Video, 
  Link, 
  Trash2, 
  GripVertical,
  Upload,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';
import { CadenceBlock } from '@/hooks/useCadence';
import { useUploadCadenceMedia } from '@/hooks/useCadenceMutations';
import { toast } from 'sonner';

interface CadenceBlockEditorProps {
  block: CadenceBlock;
  productId: string;
  onUpdate: (block: CadenceBlock) => void;
  onDelete: () => void;
  onGenerateAI: () => void;
}

const blockTypeConfig = {
  message: { icon: MessageSquare, label: 'Mensagem', color: 'text-blue-500' },
  audio: { icon: Mic, label: 'Áudio', color: 'text-purple-500' },
  material: { icon: FileText, label: 'Material', color: 'text-orange-500' },
  cta: { icon: MousePointer, label: 'CTA', color: 'text-green-500' },
  image: { icon: Image, label: 'Imagem', color: 'text-pink-500' },
  video: { icon: Video, label: 'Vídeo', color: 'text-red-500' },
  link: { icon: Link, label: 'Link', color: 'text-cyan-500' },
};

const variantLabels = {
  short: 'Curta',
  medium: 'Média',
  long: 'Longa',
};

export function CadenceBlockEditor({ 
  block, 
  productId, 
  onUpdate, 
  onDelete, 
  onGenerateAI 
}: CadenceBlockEditorProps) {
  const [copied, setCopied] = useState(false);
  const uploadMedia = useUploadCadenceMedia();

  const config = blockTypeConfig[block.type as keyof typeof blockTypeConfig] || blockTypeConfig.message;
  const Icon = config.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(block.content);
    setCopied(true);
    toast.success('Copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadMedia.mutateAsync({ file, productId });
      onUpdate({ ...block, mediaUrl: url });
      toast.success('Upload concluído!');
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="cursor-grab text-muted-foreground hover:text-foreground">
            <GripVertical className="h-5 w-5" />
          </div>

          <div className={`p-2 rounded-lg bg-secondary ${config.color}`}>
            <Icon className="h-4 w-4" />
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{config.label}</span>
                <Select
                  value={block.variant}
                  onValueChange={(value) => onUpdate({ ...block, variant: value as CadenceBlock['variant'] })}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Curta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="long">Longa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Content field */}
            <Textarea
              value={block.content}
              onChange={(e) => onUpdate({ ...block, content: e.target.value })}
              placeholder="Digite a mensagem..."
              className="min-h-[80px] text-sm resize-none"
            />

            {/* Audio script field */}
            {block.type === 'audio' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Script do áudio</Label>
                <Textarea
                  value={block.audioScript || ''}
                  onChange={(e) => onUpdate({ ...block, audioScript: e.target.value })}
                  placeholder="Script para gravar o áudio..."
                  className="min-h-[60px] text-sm resize-none"
                />
              </div>
            )}

            {/* Media URL field */}
            {(block.type === 'image' || block.type === 'video') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={block.mediaUrl || ''}
                    onChange={(e) => onUpdate({ ...block, mediaUrl: e.target.value })}
                    placeholder={block.type === 'video' ? 'URL do vídeo (YouTube, etc.)' : 'URL da imagem'}
                    className="text-sm"
                  />
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept={block.type === 'image' ? 'image/*' : 'video/*'}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                      <span>
                        <Upload className="h-4 w-4" />
                      </span>
                    </Button>
                  </label>
                </div>
                {block.mediaUrl && block.type === 'image' && (
                  <img 
                    src={block.mediaUrl} 
                    alt="Preview" 
                    className="h-20 w-auto rounded-lg object-cover"
                  />
                )}
              </div>
            )}

            {/* Link fields */}
            {block.type === 'link' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Título do link</Label>
                  <Input
                    value={block.linkTitle || ''}
                    onChange={(e) => onUpdate({ ...block, linkTitle: e.target.value })}
                    placeholder="Ex: Saiba mais"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <Input
                    value={block.linkUrl || ''}
                    onChange={(e) => onUpdate({ ...block, linkUrl: e.target.value })}
                    placeholder="https://..."
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={onGenerateAI}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Gerar com IA
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
