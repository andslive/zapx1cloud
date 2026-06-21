import { useState } from 'react';
import { Sparkles, Send, Loader2, Bot, User, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useKnowledgeSourcesByType, 
  useCreateKnowledgeSource,
  useDeleteKnowledgeSource 
} from '@/hooks/useKnowledgeSources';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AITrainingWidgetProps {
  productId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AITrainingWidget({ productId }: AITrainingWidgetProps) {
  const { data: trainings, isLoading } = useKnowledgeSourcesByType(productId, 'training');
  const createTraining = useCreateKnowledgeSource();
  const deleteTraining = useDeleteKnowledgeSource();
  
  const [activeTab, setActiveTab] = useState('teach');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSaveTraining = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Preencha o título e o conteúdo');
      return;
    }

    try {
      await createTraining.mutateAsync({
        product_id: productId,
        source_type: 'training',
        title,
        description: 'Treinamento manual',
        extracted_content: content,
        raw_content: content,
        processing_status: 'completed',
      });
      
      toast.success('Treinamento salvo com sucesso');
      setTitle('');
      setContent('');
    } catch (error) {
      toast.error('Erro ao salvar treinamento');
    }
  };

  const handleDeleteTraining = async (id: string) => {
    try {
      await deleteTraining.mutateAsync({ id, productId });
      toast.success('Treinamento removido');
    } catch (error) {
      toast.error('Erro ao remover treinamento');
    }
  };

  const handleSimulateChat = async () => {
    if (!userInput.trim()) return;

    const userMessage: Message = { role: 'user', content: userInput };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsSimulating(true);

    // Simulate AI response (in production, this would call the sales-copilot function)
    setTimeout(() => {
      const aiResponse: Message = {
        role: 'assistant',
        content: 'Esta é uma simulação. Em produção, a resposta seria baseada em todo o conhecimento treinado para este produto, incluindo documentos, FAQs e treinamentos manuais.',
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsSimulating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="teach">Ensinar a IA</TabsTrigger>
          <TabsTrigger value="simulate">Simular Conversa</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="teach" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Ensine a IA
              </CardTitle>
              <CardDescription>
                Adicione informações específicas que você quer que a IA saiba sobre o produto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="training-title">Título do Treinamento</Label>
                <Input
                  id="training-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Processo de onboarding, Casos de sucesso..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="training-content">Conteúdo</Label>
                <Textarea
                  id="training-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Escreva tudo que você quer que a IA saiba sobre este tópico. Pode incluir exemplos, scripts, casos de uso, etc..."
                  className="min-h-[200px]"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveTraining} disabled={createTraining.isPending}>
                  {createTraining.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Treinamento
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20 mt-4">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">O que ensinar para a IA?</h4>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• Scripts de vendas que funcionam bem</li>
                    <li>• Como lidar com objeções específicas</li>
                    <li>• Casos de sucesso detalhados com números</li>
                    <li>• Diferenciais competitivos profundos</li>
                    <li>• Processo de implementação passo a passo</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulate" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Simulador de Conversa
              </CardTitle>
              <CardDescription>
                Teste como a IA responde baseado no conhecimento atual do produto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] border rounded-lg p-4 mb-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Faça uma pergunta para iniciar a simulação</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={cn(
                          'flex gap-3',
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {message.role === 'assistant' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            'max-w-[80%] rounded-lg px-4 py-2',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                        </div>
                        {message.role === 'user' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    {isSimulating && (
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-lg px-4 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2">
                <Input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Faça uma pergunta sobre o produto..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSimulateChat();
                    }
                  }}
                />
                <Button onClick={handleSimulateChat} disabled={isSimulating}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Treinamentos</CardTitle>
              <CardDescription>
                Todos os treinamentos manuais adicionados para este produto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : trainings && trainings.length > 0 ? (
                <div className="space-y-4">
                  {trainings.map((training) => (
                    <Card key={training.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h4 className="font-medium">{training.title}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {training.extracted_content}
                            </p>
                            <Badge variant="secondary" className="text-xs mt-2">
                              {new Date(training.created_at).toLocaleDateString('pt-BR')}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteTraining(training.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    Nenhum treinamento manual ainda. Vá para "Ensinar a IA" para começar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
