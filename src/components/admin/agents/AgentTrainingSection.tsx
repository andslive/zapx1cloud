import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileText, Trash2, BookOpen, CheckCircle, XCircle, Clock, RefreshCw, Eye, GraduationCap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AgentTrainingSectionProps {
  agentId: string;
  productId: string;
}

interface TrainingMaterial {
  id: string;
  title: string;
  material_type: string;
  category: string;
  description: string | null;
  file_url: string | null;
  is_active: boolean;
  processing_status: string;
  processing_error: string | null;
  extracted_content: string | null;
  created_at: string;
  product_id: string | null;
  agent_id: string | null;
}

const CATEGORIES = [
  { value: 'sales_techniques', label: '🎯 Técnicas de Vendas', description: 'SPIN Selling, Challenger, etc.' },
  { value: 'communication', label: '💬 Comunicação', description: 'Rapport, escuta ativa, linguagem corporal' },
  { value: 'objections', label: '🛡️ Objeções', description: 'Técnicas de contorno de objeções' },
  { value: 'closing', label: '✅ Fechamento', description: 'Técnicas de fechamento de vendas' },
  { value: 'prospecting', label: '🔍 Prospecção', description: 'Como encontrar e abordar leads' },
  { value: 'negotiation', label: '🤝 Negociação', description: 'Táticas de negociação' },
  { value: 'general', label: '📋 Geral', description: 'Outros materiais de treinamento' },
];

export function AgentTrainingSection({ agentId, productId }: AgentTrainingSectionProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [isUploading, setIsUploading] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    title: '',
    category: 'sales_techniques',
    description: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<TrainingMaterial | null>(null);

  // Fetch training materials - FILTERED BY AGENT
  const { data: materials, isLoading } = useQuery({
    queryKey: ['agent-training-materials', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_training_materials')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TrainingMaterial[];
    },
    enabled: !!agentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasProcessing = data?.some(m => m.processing_status === 'processing' || m.processing_status === 'pending');
      return hasProcessing ? 5000 : false;
    },
  });

  // Process material mutation
  const processMaterial = useMutation({
    mutationFn: async ({ materialId, fileUrl, filePath }: { materialId: string; fileUrl: string; filePath: string }) => {
      const { data, error } = await supabase.functions.invoke('process-training-material', {
        body: { 
          material_id: materialId, 
          file_url: fileUrl,
          file_path: filePath,
          product_id: productId,
          agent_id: agentId
        }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
      toast.success('Material processado com sucesso!');
    },
    onError: (error) => {
      console.error('Process error:', error);
      toast.error('Erro ao processar material');
    }
  });

  // Delete material mutation
  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_training_materials')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
      toast.success('Material removido com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao remover material');
    }
  });

  // Toggle active status
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('agent_training_materials')
        .update({ is_active })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
    }
  });

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile || !newMaterial.title || !profile?.organization_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsUploading(true);
    
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `training/${profile.organization_id}/agents/${agentId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-documents')
        .getPublicUrl(filePath);

      const { data: insertData, error: insertError } = await supabase
        .from('agent_training_materials')
        .insert({
          organization_id: profile.organization_id,
          product_id: productId,
          agent_id: agentId,
          title: newMaterial.title,
          material_type: selectedFile.type.includes('pdf') ? 'pdf' : 'text',
          category: newMaterial.category,
          description: newMaterial.description || null,
          file_url: urlData.publicUrl,
          processing_status: 'pending',
          created_by: profile.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setNewMaterial({ title: '', category: 'sales_techniques', description: '' });
      setSelectedFile(null);
      
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
      toast.success('Material enviado! Iniciando processamento...');
      
      if (insertData?.id && urlData.publicUrl) {
        processMaterial.mutate({ 
          materialId: insertData.id, 
          fileUrl: urlData.publicUrl,
          filePath: filePath
        });
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do material');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReprocess = (material: TrainingMaterial) => {
    if (material.file_url) {
      const urlParts = material.file_url.split('/product-documents/');
      const filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : '';
      
      processMaterial.mutate({ 
        materialId: material.id, 
        fileUrl: material.file_url,
        filePath: filePath
      });
      toast.info('Reprocessando material...');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Processado</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processando</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Erro</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pendente</Badge>;
    }
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || '📋 Geral';
  };

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-start gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Treinamento Específico</p>
            <p>Adicione PDFs e documentos que serão usados <strong>apenas por este agente</strong>, além do conhecimento geral do produto.</p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Adicionar Material
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input
                value={newMaterial.title}
                onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                placeholder="Ex: Script de Vendas"
                className="h-8 text-sm"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria *</Label>
              <Select 
                value={newMaterial.category} 
                onValueChange={(value) => setNewMaterial({ ...newMaterial, category: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="flex-1 h-8 text-sm"
            />
            <Button 
              size="sm"
              onClick={handleUpload} 
              disabled={isUploading || !selectedFile || !newMaterial.title}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Materials List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Materiais ({materials?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : materials && materials.length > 0 ? (
            <div className="space-y-2">
              {materials.map((material) => (
                <div 
                  key={material.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    material.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{material.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {getCategoryLabel(material.category)}
                        </span>
                        {getStatusBadge(material.processing_status)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {material.processing_status === 'completed' && material.extracted_content && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPreviewMaterial(material)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    
                    {(material.processing_status === 'failed' || material.processing_status === 'pending') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleReprocess(material)}
                        disabled={processMaterial.isPending}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${processMaterial.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMaterial.mutate(material.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum material específico</p>
              <p className="text-xs">Adicione PDFs acima</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewMaterial} onOpenChange={() => setPreviewMaterial(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewMaterial?.title}
            </DialogTitle>
            <DialogDescription>
              Conteúdo extraído e processado pela IA
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {previewMaterial?.extracted_content}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
