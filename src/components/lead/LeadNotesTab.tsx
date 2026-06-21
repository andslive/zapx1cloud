import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  FileText, Plus, X, Save, Loader2, Tag, Clock, Send,
  CheckCircle2, Circle, ListTodo, CalendarIcon, User
} from 'lucide-react';
import { useLeadNotes, useCreateLeadNote } from '@/hooks/useLeadNotes';
import { useLeadTasks, useCreateTask, useCompleteTask, useUncompleteTask } from '@/hooks/useTasks';
import { useUpdateLead } from '@/hooks/useLeads';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadNotesTabProps {
  lead: {
    id: string;
    notes?: string | null;
    product_id?: string | null;
    sdr_id?: string | null;
    closer_id?: string | null;
    metadata?: {
      tags?: string[];
    } | null;
  };
  isAdmin?: boolean;
  teamMembers?: { id: string; full_name: string; avatar_url?: string | null; email?: string }[];
}

export function LeadNotesTab({ lead, isAdmin, teamMembers = [] }: LeadNotesTabProps) {
  const [noteContent, setNoteContent] = useState('');
  const [tags, setTags] = useState<string[]>(lead.metadata?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<string>('medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');

  const { user, isAdmin: userIsAdmin } = useAuth();
  const { data: notes, isLoading: notesLoading } = useLeadNotes(lead.id);
  const createNote = useCreateLeadNote();
  const { data: leadTasks, isLoading: tasksLoading } = useLeadTasks(lead.id);
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const updateLead = useUpdateLead();

  const detectRoleLabel = (): string => {
    if (!user) return 'Vendedor';
    if (lead.sdr_id === user.id) return 'SDR';
    if (lead.closer_id === user.id) return 'Closer';
    if (userIsAdmin || isAdmin) return 'Admin';
    return 'Vendedor';
  };

  const handleSubmitNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await createNote.mutateAsync({
        lead_id: lead.id,
        content: noteContent.trim(),
        role_label: detectRoleLabel()
      });
      setNoteContent('');
      toast.success('Nota registrada com sucesso');
    } catch {
      toast.error('Erro ao registrar nota');
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !user) return;
    try {
      await createTask.mutateAsync({
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
        priority: taskPriority as any,
        due_date: taskDueDate || null,
        user_id: taskAssignee || user.id,
        lead_id: lead.id,
        product_id: lead.product_id || null,
        status: 'pending',
        created_by: user.id
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('medium');
      setTaskDueDate('');
      setTaskAssignee('');
      setIsTaskDialogOpen(false);
      toast.success('Tarefa criada com sucesso');
    } catch {
      toast.error('Erro ao criar tarefa');
    }
  };

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    try {
      if (isCompleted) {
        await uncompleteTask.mutateAsync(taskId);
      } else {
        await completeTask.mutateAsync(taskId);
      }
    } catch {
      toast.error('Erro ao atualizar tarefa');
    }
  };

  const handleSaveTags = async () => {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        metadata: { ...lead.metadata, tags }
      });
      toast.success('Etiquetas salvas');
    } catch {
      toast.error('Erro ao salvar etiquetas');
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updated = [...tags, newTag.trim()];
      setTags(updated);
      setNewTag('');
    }
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-primary/10 text-primary',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    urgent: 'bg-destructive/10 text-destructive',
  };

  const priorityLabels: Record<string, string> = {
    low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente'
  };

  return (
    <div className="space-y-4">
      {/* Nova Nota */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4" />
            Nova Nota de Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Resuma o atendimento com este lead..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-between items-center">
            <Badge variant="outline" className="text-xs">
              {detectRoleLabel()}
            </Badge>
            <Button
              size="sm"
              onClick={handleSubmitNote}
              disabled={!noteContent.trim() || createNote.isPending}
              className="gap-2"
            >
              {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Registrar Nota
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !notes?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma nota registrada ainda. Seja o primeiro a documentar o atendimento.
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={note.profiles?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {(note.profiles?.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{note.profiles?.full_name || 'Usuário'}</span>
                      {note.role_label && (
                        <Badge variant="secondary" className="text-xs">{note.role_label}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tarefas do Lead */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Tarefas deste Lead
          </CardTitle>
          <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" /> Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Tarefa para este Lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    placeholder="Ex: Follow-up por WhatsApp"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="Detalhes da tarefa..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select value={taskPriority} onValueChange={setTaskPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="datetime-local"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Atribuir a</Label>
                  <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                    <SelectTrigger><SelectValue placeholder="Eu mesmo" /></SelectTrigger>
                    <SelectContent>
                      {user && (
                        <SelectItem value={user.id}>Eu mesmo</SelectItem>
                      )}
                      {teamMembers.filter(m => m.id !== user?.id).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateTask}
                  disabled={!taskTitle.trim() || createTask.isPending}
                >
                  {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Criar Tarefa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !leadTasks?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma tarefa vinculada a este lead.
            </p>
          ) : (
            <div className="space-y-2">
              {leadTasks.map((task: any) => {
                const isCompleted = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border border-border ${isCompleted ? 'opacity-60' : ''}`}
                  >
                    <button
                      onClick={() => handleToggleTask(task.id, isCompleted)}
                      className="mt-0.5 shrink-0"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {format(new Date(task.due_date), 'dd/MM', { locale: ptBR })}
                          </span>
                        )}
                        {task.profiles?.full_name && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.profiles.full_name}
                          </span>
                        )}
                        <Badge className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority || 'medium']}`}>
                          {priorityLabels[task.priority || 'medium']}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Etiquetas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Etiquetas
          </CardTitle>
          {JSON.stringify(tags) !== JSON.stringify(lead.metadata?.tags || []) && (
            <Button size="sm" variant="outline" onClick={handleSaveTags} disabled={updateLead.isPending}>
              {updateLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button onClick={() => setTags(tags.filter(t => t !== tag))} className="ml-1 hover:bg-muted rounded p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhuma etiqueta</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nova etiqueta..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
              className="flex-1"
            />
            <Button variant="outline" size="icon" onClick={handleAddTag} disabled={!newTag.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
