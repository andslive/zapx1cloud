import { useState, useCallback, useEffect } from 'react';
import { useMaterials, useCreateMaterial, useDeleteMaterial } from '@/hooks/useMaterials';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Loader2, FileText, Image as ImageIcon, Video, Link as LinkIcon, Plus, ExternalLink, 
  Download, Upload, X, Trash2, File as FileIcon, Presentation
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

// Compressão de imagens usando Canvas API
const compressImage = async (file: File, maxSizeMB: number = 2): Promise<File> => {
  if (!file.type.startsWith('image/') || file.size <= maxSizeMB * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    
    img.onload = () => {
      let { width, height } = img;
      const maxDimension = 2048;
      
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
            resolve(new File([blob], newFileName, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.85
      );
    };
    
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

// Validação de URL de vídeo (YouTube/Vimeo)
const isValidVideoUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  const vimeoRegex = /^(https?:\/\/)?(www\.)?vimeo\.com\/.+/;
  return youtubeRegex.test(url) || vimeoRegex.test(url);
};

interface MaterialsTabProps {
  productId: string;
}

const typeIcons: Record<string, any> = {
  pdf: FileText,
  image: ImageIcon,
  video: Video,
  link: LinkIcon,
  banner: Presentation,
};

const typeLabels: Record<string, string> = {
  pdf: 'PDF',
  image: 'Imagem',
  video: 'Vídeo',
  link: 'Link',
  banner: 'Banner/Apresentação',
};

const tagOptions = [
  { value: 'proof', label: 'Prova Social' },
  { value: 'presentation', label: 'Apresentação' },
  { value: 'objection', label: 'Objeção' },
  { value: 'closing', label: 'Fechamento' },
];

export function MaterialsTab({ productId }: MaterialsTabProps) {
  const { profile } = useAuth();
  const { data: materials, isLoading } = useMaterials(productId);
  const createMaterial = useCreateMaterial();
  const deleteMaterial = useDeleteMaterial();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    type: 'pdf' as 'pdf' | 'video' | 'image' | 'link' | 'banner',
    url: '',
    objective: '',
    tags: [] as string[],
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    let file = acceptedFiles[0];
    if (file) {
      // Comprime imagens automaticamente
      if (file.type.startsWith('image/')) {
        toast.info('Comprimindo imagem...');
        file = await compressImage(file, 2);
        toast.success('Imagem comprimida!');
      }
      
      setSelectedFile(file);
      setNewMaterial(prev => ({
        ...prev,
        name: prev.name || file.name.replace(/\.[^/.]+$/, ''),
        type: getFileType(file),
      }));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const getFileType = (file: File): 'pdf' | 'image' | 'banner' => {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('image/')) return 'image';
    return 'pdf';
  };

  // Auto-switch para link quando tipo for vídeo
  useEffect(() => {
    if (newMaterial.type === 'video') {
      setUploadMode('link');
    }
  }, [newMaterial.type]);

  const handleUpload = async () => {
    if (!profile?.organization_id) {
      toast.error('Organização não encontrada');
      return;
    }

    if (uploadMode === 'file' && !selectedFile) {
      toast.error('Selecione um arquivo');
      return;
    }

    if (uploadMode === 'link' && !newMaterial.url) {
      toast.error('Informe a URL do material');
      return;
    }

    // Validação específica para vídeo
    if (newMaterial.type === 'video' && !isValidVideoUrl(newMaterial.url)) {
      toast.error('Para vídeos, informe uma URL do YouTube ou Vimeo');
      return;
    }

    if (!newMaterial.name.trim()) {
      toast.error('Informe o nome do material');
      return;
    }

    setIsUploading(true);

    try {
      let fileUrl = newMaterial.url;

      if (uploadMode === 'file' && selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${profile.organization_id}/${productId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('materials')
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('materials')
          .getPublicUrl(fileName);

        fileUrl = publicUrl;
      }

      await createMaterial.mutateAsync({
        product_id: productId,
        organization_id: profile.organization_id,
        name: newMaterial.name,
        type: newMaterial.type,
        url: fileUrl,
        objective: newMaterial.objective || null,
        tags: newMaterial.tags.length > 0 ? newMaterial.tags : null,
        status: 'active',
      });

      toast.success('Material adicionado com sucesso!');
      resetForm();
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast.error(error.message || 'Erro ao adicionar material');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este material?')) return;

    try {
      await deleteMaterial.mutateAsync(id);
      toast.success('Material excluído');
    } catch (error) {
      toast.error('Erro ao excluir material');
    }
  };

  const resetForm = () => {
    setNewMaterial({
      name: '',
      type: 'pdf',
      url: '',
      objective: '',
      tags: [],
    });
    setSelectedFile(null);
    setUploadMode('file');
  };

  const toggleTag = (tag: string) => {
    setNewMaterial(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const productMaterials = materials || [];

  // Group by type
  const materialsByType = productMaterials.reduce((acc, material) => {
    const type = material.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(material);
    return acc;
  }, {} as Record<string, typeof productMaterials>);

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {productMaterials.length} materiais
          </h2>
          <p className="text-sm text-muted-foreground">
            Biblioteca de materiais de apoio para vendas
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Material
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Material</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {/* Upload Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg">
                <Button
                  type="button"
                  variant={uploadMode === 'file' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUploadMode('file')}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === 'link' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUploadMode('link')}
                >
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Link Externo
                </Button>
              </div>

              {/* File Upload Zone */}
              {uploadMode === 'file' && (
                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                    transition-colors
                    ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                    ${selectedFile ? 'bg-muted/50' : ''}
                  `}
                >
                  <input {...getInputProps()} />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileIcon className="h-8 w-8 text-primary" />
                      <div className="text-left">
                        <p className="font-medium text-sm">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {isDragActive
                          ? 'Solte o arquivo aqui...'
                          : 'Arraste um arquivo ou clique para selecionar'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF (máx. 10MB), Imagens (comprimidas automaticamente)
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Link URL Input */}
              {uploadMode === 'link' && (
                <div className="space-y-2">
                  <Label>
                    {newMaterial.type === 'video' ? 'URL do YouTube ou Vimeo' : 'URL do Material'}
                  </Label>
                  <Input
                    placeholder={newMaterial.type === 'video' 
                      ? 'https://youtube.com/watch?v=... ou https://vimeo.com/...' 
                      : 'https://exemplo.com/material.pdf'}
                    value={newMaterial.url}
                    onChange={(e) => setNewMaterial(prev => ({ ...prev, url: e.target.value }))}
                  />
                  {newMaterial.type === 'video' && (
                    <p className="text-xs text-muted-foreground">
                      Apenas links do YouTube ou Vimeo são aceitos
                    </p>
                  )}
                </div>
              )}

              {/* Material Name */}
              <div className="space-y-2">
                <Label>Nome do Material *</Label>
                <Input
                  placeholder="Ex: Apresentação Institucional"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* Material Type */}
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={newMaterial.type}
                  onValueChange={(value: any) => setNewMaterial(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Objective */}
              <div className="space-y-2">
                <Label>Objetivo / Descrição</Label>
                <Textarea
                  placeholder="Descreva o objetivo ou momento ideal para usar este material..."
                  value={newMaterial.objective}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, objective: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags (momento de uso)</Label>
                <div className="flex flex-wrap gap-2">
                  {tagOptions.map((tag) => (
                    <Badge
                      key={tag.value}
                      variant={newMaterial.tags.includes(tag.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleTag(tag.value)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={isUploading || (!selectedFile && uploadMode === 'file') || !newMaterial.name.trim()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Material
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {productMaterials.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum material</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Adicione materiais de apoio como PDFs, apresentações, cases e propostas
            </p>
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Primeiro Material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(materialsByType).map(([type, mats]) => (
            <Card key={type} className="bg-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {typeIcons[type] && (() => {
                    const Icon = typeIcons[type];
                    return <Icon className="h-4 w-4" />;
                  })()}
                  {typeLabels[type] || type}
                  <Badge variant="outline" className="ml-2">{mats.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mats.map((material) => (
                    <div 
                      key={material.id}
                      className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm text-foreground truncate flex-1">
                          {material.name}
                        </h4>
                        <div className="flex items-center gap-1">
                          {material.status && (
                            <Badge 
                              variant="outline" 
                              className={material.status === 'active' 
                                ? 'bg-success/10 text-success' 
                                : 'bg-muted text-muted-foreground'
                              }
                            >
                              {material.status === 'active' ? 'Ativo' : material.status}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={() => handleDelete(material.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {material.objective && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {material.objective}
                        </p>
                      )}

                      {material.tags && material.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {material.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tagOptions.find(t => t.value === tag)?.label || tag}
                            </Badge>
                          ))}
                          {material.tags.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{material.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          asChild
                          className="flex-1"
                        >
                          <a 
                            href={material.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            Abrir
                          </a>
                        </Button>
                        {(material.type === 'pdf' || material.type === 'image') && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            asChild
                          >
                            <a 
                              href={material.url} 
                              download
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
