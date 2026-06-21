import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload, X, Loader2, CheckCircle, File } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  useKnowledgeSourcesByType, 
  useUploadKnowledgeDocument 
} from '@/hooks/useKnowledgeSources';
import { KnowledgeSourceCard } from './KnowledgeSourceCard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  productId: string;
}

interface PendingFile {
  file: File;
  title: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
};

export function FileUploader({ productId }: FileUploaderProps) {
  const { data: files, isLoading } = useKnowledgeSourcesByType(productId, 'file');
  const uploadDocument = useUploadKnowledgeDocument();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      title: file.name.replace(/\.[^/.]+$/, ''),
      progress: 0,
      status: 'pending' as const,
    }));
    setPendingFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const updatePendingFile = (index: number, updates: Partial<PendingFile>) => {
    setPendingFiles(prev => 
      prev.map((f, i) => i === index ? { ...f, ...updates } : f)
    );
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (index: number) => {
    const pending = pendingFiles[index];
    if (!pending) return;

    updatePendingFile(index, { status: 'uploading', progress: 30 });

    try {
      await uploadDocument.mutateAsync({
        file: pending.file,
        productId,
        title: pending.title,
      });
      
      updatePendingFile(index, { status: 'completed', progress: 100 });
      toast.success(`"${pending.title}" carregado com sucesso`);
      
      // Remove from pending after delay
      setTimeout(() => {
        removePendingFile(index);
      }, 2000);
    } catch (error) {
      updatePendingFile(index, { status: 'error', progress: 0 });
      toast.error(`Erro ao carregar "${pending.title}"`);
    }
  };

  const uploadAll = async () => {
    for (let i = 0; i < pendingFiles.length; i++) {
      if (pendingFiles[i].status === 'pending') {
        await uploadFile(i);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Arquivos
          </CardTitle>
          <CardDescription>
            Faça upload de PDFs, documentos Word, apresentações e outros arquivos para treinar a IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            {isDragActive ? (
              <p className="text-primary font-medium">Solte os arquivos aqui...</p>
            ) : (
              <>
                <p className="font-medium">Arraste arquivos ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  PDF, DOC, DOCX, PPT, PPTX, TXT (máx. 50MB)
                </p>
              </>
            )}
          </div>

          {/* Pending Files */}
          {pendingFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Arquivos para upload</h4>
                <Button size="sm" onClick={uploadAll}>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar Todos
                </Button>
              </div>
              
              {pendingFiles.map((pending, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
                >
                  <File className="h-8 w-8 text-muted-foreground shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <Input
                      value={pending.title}
                      onChange={(e) => updatePendingFile(index, { title: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Nome do arquivo"
                      disabled={pending.status !== 'pending'}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {(pending.file.size / 1024).toFixed(0)} KB
                      </span>
                      {pending.status === 'uploading' && (
                        <Progress value={pending.progress} className="h-1 flex-1" />
                      )}
                      {pending.status === 'completed' && (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Enviado
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {pending.status === 'pending' && (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => uploadFile(index)}
                        >
                          Enviar
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={() => removePendingFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {pending.status === 'uploading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Files */}
      {files && files.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Arquivos Enviados</h3>
          {files.map((file) => (
            <KnowledgeSourceCard key={file.id} source={file} />
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!files || files.length === 0) && pendingFiles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Nenhum arquivo enviado ainda. Arraste arquivos acima para começar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
