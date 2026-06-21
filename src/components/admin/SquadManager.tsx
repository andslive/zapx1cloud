import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSquads, useCreateSquad, useUpdateSquad, useDeleteSquad, Squad, CreateSquadData } from '@/hooks/useSquads';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { SquadPerformanceCard } from './SquadPerformanceCard';
import { SquadMembersDialog } from './SquadMembersDialog';
import { SquadIconUpload } from './SquadIconUpload';
import { SquadDistributionConfig } from './SquadDistributionConfig';
import { Plus, Loader2, UsersRound, Pencil, Trash2 } from 'lucide-react';

const SQUAD_COLORS = [
  { name: 'Roxo', value: '#6366F1' },
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Amarelo', value: '#F59E0B' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Ciano', value: '#06B6D4' },
  { name: 'Laranja', value: '#F97316' },
];

export function SquadManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);

  const [formData, setFormData] = useState<CreateSquadData>({
    name: '',
    description: '',
    color: '#6366F1',
    product_id: undefined,
    icon_url: undefined
  });

  const { data: squads, isLoading } = useSquads();
  const { data: products } = useProducts();
  const { profile } = useAuth();
  const createSquad = useCreateSquad();
  const updateSquad = useUpdateSquad();
  const deleteSquad = useDeleteSquad();

  const handleOpenCreate = () => {
    setEditingSquad(null);
    setFormData({
      name: '',
      description: '',
      color: '#6366F1',
      product_id: undefined,
      icon_url: undefined
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (squad: Squad) => {
    setEditingSquad(squad);
    setFormData({
      name: squad.name,
      description: squad.description || '',
      color: squad.color || '#6366F1',
      product_id: squad.product_id || undefined,
      icon_url: squad.icon_url || undefined
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    if (editingSquad) {
      await updateSquad.mutateAsync({
        id: editingSquad.id,
        ...formData
      });
    } else {
      await createSquad.mutateAsync(formData);
    }

    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este squad?')) {
      await deleteSquad.mutateAsync(id);
    }
  };

  const handleManageMembers = (squad: Squad) => {
    setSelectedSquad(squad);
    setMembersDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-primary" />
            Squads
          </h2>
          <p className="text-muted-foreground">
            Organize sua equipe em times de vendas
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Squad
        </Button>
      </div>

      {/* Squads Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : squads?.length === 0 ? (
        <Card className="gradient-card border-border">
          <CardContent className="py-12 text-center">
            <UsersRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum squad criado
            </h3>
            <p className="text-muted-foreground mb-4">
              Crie squads para organizar sua equipe de vendas
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Squad
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {squads?.map(squad => (
            <div key={squad.id} className="space-y-3">
              <div className="relative group">
                <SquadPerformanceCard
                  squad={squad}
                  onManageMembers={() => handleManageMembers(squad)}
                />
                {/* Edit/Delete buttons */}
                <div className="absolute top-4 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleOpenEdit(squad)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(squad.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Distribution Config */}
              {profile?.organization_id && (
                <SquadDistributionConfig
                  squadId={squad.id}
                  organizationId={profile.organization_id}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSquad ? 'Editar Squad' : 'Novo Squad'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Squad</Label>
              <Input
                id="name"
                placeholder="Ex: Time Alpha"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o squad..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <SquadIconUpload
              currentIcon={formData.icon_url}
              onIconChange={(url) => setFormData({ ...formData, icon_url: url || undefined })}
              squadName={formData.name}
              color={formData.color}
            />

            <div className="space-y-2">
              <Label>Cor do Squad</Label>
              <div className="flex flex-wrap gap-2">
                {SQUAD_COLORS.map(color => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full transition-all ${
                      formData.color === color.value 
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' 
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Produto Associado (opcional)</Label>
              <Select
                value={formData.product_id || 'none'}
                onValueChange={(v) => setFormData({ ...formData, product_id: v === 'none' ? undefined : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar produto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum produto</SelectItem>
                  {products?.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || createSquad.isPending || updateSquad.isPending}
            >
              {(createSquad.isPending || updateSquad.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editingSquad ? (
                'Salvar'
              ) : (
                'Criar Squad'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <SquadMembersDialog
        squad={selectedSquad}
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
      />
    </div>
  );
}
