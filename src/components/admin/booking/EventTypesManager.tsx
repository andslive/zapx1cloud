import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  Copy, 
  MoreHorizontal, 
  Clock, 
  Video, 
  MapPin, 
  Phone,
  Pencil,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { useBookingEventTypes, BookingEventType } from '@/hooks/useBookingEventTypes';
import { EventTypeEditor } from './EventTypeEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { ensureBookingSlug } from '@/lib/bookingSlug';

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video,
  zoom: Video,
  phone: Phone,
  in_person: MapPin,
};

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  phone: 'Telefone',
  in_person: 'Presencial',
};

export function EventTypesManager() {
  const { profile } = useAuth();
  const { eventTypes, isLoading, toggleActive, deleteEventType } = useBookingEventTypes();
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEventType, setEditingEventType] = useState<BookingEventType | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<BookingEventType | null>(null);

  const filteredEventTypes = eventTypes.filter(et =>
    et.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    et.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resolveSlug = async (): Promise<string | null> => {
    if (!profile?.id) return null;
    const slug = await ensureBookingSlug({
      userId: profile.id,
      fullName: profile.full_name,
      currentSlug: profile.booking_slug,
    });
    if (!slug) {
      toast.error('Não foi possível gerar seu link público. Tente novamente.');
    }
    return slug;
  };

  const handleCopyLink = async (eventType: BookingEventType) => {
    const slug = await resolveSlug();
    if (!slug) return;
    const url = `${window.location.origin}/agendar/${slug}/${eventType.slug}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const handleOpenLink = async (eventType: BookingEventType) => {
    const slug = await resolveSlug();
    if (!slug) return;
    window.open(`/agendar/${slug}/${eventType.slug}`, '_blank');
  };

  const handleEdit = (eventType: BookingEventType) => {
    setEditingEventType(eventType);
    setIsEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingEventType(null);
    setIsEditorOpen(true);
  };

  const handleDelete = (eventType: BookingEventType) => {
    setEventToDelete(eventType);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (eventToDelete) {
      deleteEventType.mutate(eventToDelete.id);
    }
    setDeleteDialogOpen(false);
    setEventToDelete(null);
  };

  const LocationIcon = (type: string) => locationIcons[type] || Video;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Tipos de Evento</h2>
          <p className="text-muted-foreground">
            Configure os tipos de reunião que você oferece
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Criar Evento
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar tipos de evento..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Event Types List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEventTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-1">Nenhum tipo de evento</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie seu primeiro tipo de evento para começar a receber agendamentos.
            </p>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEventTypes.map((eventType) => {
            const Icon = LocationIcon(eventType.location_type);
            return (
              <Card key={eventType.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    {/* Color indicator */}
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: eventType.color + '20' }}
                    >
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: eventType.color }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold truncate">{eventType.name}</h3>
                          {eventType.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {eventType.description}
                            </p>
                          )}
                        </div>
                        <Badge variant={eventType.is_active ? 'default' : 'secondary'}>
                          {eventType.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {eventType.duration_minutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon className="h-3.5 w-3.5" />
                          {locationLabels[eventType.location_type]}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(eventType)}
                          className="gap-1.5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(eventType)}
                          className="gap-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenLink(eventType)}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Ver página
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              toggleActive.mutate({ 
                                id: eventType.id, 
                                is_active: !eventType.is_active 
                              });
                            }}>
                              {eventType.is_active ? 'Desativar' : 'Ativar'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(eventType)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Editor Dialog */}
      <EventTypeEditor
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        eventType={editingEventType}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o tipo de evento 
              "{eventToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
