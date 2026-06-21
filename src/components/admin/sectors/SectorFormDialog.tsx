import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Users, X,
  Building2, Headphones, ShoppingCart, Wallet, Heart, Wrench,
  MessageSquare, Phone, Mail, Star, Briefcase, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sector, useUpsertSector } from '@/hooks/useSectors';
import { useTeamMembers } from '@/hooks/useTeam';

const SECTOR_COLORS = [
  '#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
];

const SECTOR_ICONS = {
  Building2, Headphones, ShoppingCart, Wallet, Heart, Wrench,
  Users, MessageSquare, Phone, Mail, Star, Briefcase, Target,
} as const;

type IconName = keyof typeof SECTOR_ICONS;

interface SectorFormDialogProps {
  sector: Sector | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SectorFormDialog({ sector, open, onOpenChange }: SectorFormDialogProps) {
  const upsert = useUpsertSector();
  const { data: members } = useTeamMembers();

  const [form, setForm] = useState({
    name: '',
    color: '#3B82F6',
    icon: 'Building2' as IconName,
    bot_order: 0,
    is_active: true,
  });
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (sector) {
      setForm({
        name: sector.name,
        color: sector.color || '#3B82F6',
        icon: ((sector.icon as IconName) in SECTOR_ICONS ? sector.icon : 'Building2') as IconName,
        bot_order: sector.bot_order || 0,
        is_active: sector.is_active !== false,
      });
      setMemberIds(sector.members?.map((m) => m.user_id) || []);
    } else {
      setForm({
        name: '',
        color: '#3B82F6',
        icon: 'Building2',
        bot_order: 0,
        is_active: true,
      });
      setMemberIds([]);
    }
  }, [sector, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome do setor');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: sector?.id,
        ...form,
        member_ids: memberIds,
      });
      toast.success(sector ? 'Setor atualizado!' : 'Setor criado!');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar setor');
    }
  };

  const selectedMembers = useMemo(
    () => (members || []).filter((m) => memberIds.includes(m.id)),
    [members, memberIds]
  );

  const availableMembers = useMemo(
    () => (members || []).filter((m) => !memberIds.includes(m.id)),
    [members, memberIds]
  );

  const PreviewIcon = SECTOR_ICONS[form.icon] || Building2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg"
              style={{ backgroundColor: `${form.color}20`, color: form.color }}
            >
              <PreviewIcon className="h-4 w-4" />
            </span>
            {sector ? 'Editar Setor' : 'Adicionar Setor'}
          </DialogTitle>
          <DialogDescription>
            Configure o setor e atribua os membros que devem ter acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Linha 1: Nome / Ordem / Ativo */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Suporte Premium"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot_order">Ordem</Label>
              <Input
                id="bot_order"
                type="number"
                value={form.bot_order}
                onChange={(e) => setForm({ ...form, bot_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="active" className="cursor-pointer text-sm whitespace-nowrap">
                {form.is_active ? 'Ativo' : 'Inativo'}
              </Label>
            </div>
          </div>

          {/* Cor */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
              {SECTOR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${
                    form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Ícone */}
          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="grid grid-cols-7 sm:grid-cols-13 gap-2 p-3 border rounded-md bg-muted/30">
              {(Object.keys(SECTOR_ICONS) as IconName[]).map((name) => {
                const Ico = SECTOR_ICONS[name];
                const selected = form.icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={`flex items-center justify-center h-10 w-10 rounded-md transition-all ${
                      selected
                        ? 'ring-2 ring-offset-2 ring-foreground scale-105'
                        : 'hover:bg-background'
                    }`}
                    style={selected ? { backgroundColor: `${form.color}20`, color: form.color } : undefined}
                    aria-label={`Ícone ${name}`}
                  >
                    <Ico className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Membros */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Membros do setor ({selectedMembers.length})
            </Label>

            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30">
                {selectedMembers.map((m) => (
                  <Badge key={m.id} variant="secondary" className="gap-1.5 pl-1 pr-1">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={m.avatar_url || ''} />
                      <AvatarFallback className="text-[8px]">{m.full_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{m.full_name}</span>
                    <button
                      type="button"
                      onClick={() => setMemberIds(memberIds.filter((id) => id !== m.id))}
                      className="hover:bg-background rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {availableMembers.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => v && setMemberIds([...memberIds, v])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="+ Adicionar membro" />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={m.avatar_url || ''} />
                          <AvatarFallback className="text-[10px]">{m.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{m.full_name}</span>
                        <span className="text-muted-foreground text-xs">({m.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sector ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
