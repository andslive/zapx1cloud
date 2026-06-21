import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Flame,
  Thermometer,
  Snowflake,
  Phone,
  Mail,
  MoreHorizontal,
  ArrowUpDown,
  Eye,
  ArrowRightLeft,
  Trash2,
  MessageSquare,
  Globe,
  UserCircle,
  Calendar,
  Building,
  ExternalLink,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tables } from '@/integrations/supabase/types';

type Lead = Tables<'leads'> & {
  pipeline_stages?: Tables<'pipeline_stages'> | null;
};

interface LeadsTableProps {
  leads: Lead[];
  selectedLeads: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onViewLead: (id: string) => void;
  onTransferLead: (id: string) => void;
  onDeleteLead: (id: string) => void;
  sort: { column: string; direction: 'asc' | 'desc' };
  onSort: (column: string) => void;
  isLoading?: boolean;
}

const temperatureIcons = {
  hot: { icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10' },
  warm: { icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  cold: { icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-500/10' },
};

function SortableHeader({ 
  column, 
  label, 
  currentSort, 
  onSort 
}: { 
  column: string; 
  label: string; 
  currentSort: { column: string; direction: 'asc' | 'desc' };
  onSort: (column: string) => void;
}) {
  const isActive = currentSort.column === column;
  
  return (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={cn(
        "h-3 w-3",
        isActive && "text-primary"
      )} />
    </button>
  );
}

export function LeadsTable({
  leads,
  selectedLeads,
  onToggleSelect,
  onToggleSelectAll,
  onViewLead,
  onTransferLead,
  onDeleteLead,
  sort,
  onSort,
  isLoading,
}: LeadsTableProps) {
  const allSelected = leads.length > 0 && selectedLeads.length === leads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < leads.length;

  if (isLoading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-10 w-10 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
              <div className="h-4 bg-muted rounded w-24" />
              <div className="h-4 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">Nenhum lead encontrado</h3>
        <p className="text-sm text-muted-foreground">
          Tente ajustar os filtros ou adicione um novo lead
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
                  }
                }}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead className="min-w-[200px]">
              <SortableHeader column="name" label="Lead" currentSort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className="min-w-[150px]">Contato</TableHead>
            <TableHead className="min-w-[120px]">
              <SortableHeader column="lead_origin" label="Origem" currentSort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className="min-w-[150px]">Carteira</TableHead>
            <TableHead className="min-w-[120px]">
              <SortableHeader column="created_at" label="Status" currentSort={sort} onSort={onSort} />
            </TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const isSelected = selectedLeads.includes(lead.id);
            const temp = lead.temperature || 'cold';
            const TempIcon = temperatureIcons[temp as keyof typeof temperatureIcons]?.icon || Snowflake;
            const tempColor = temperatureIcons[temp as keyof typeof temperatureIcons]?.color || 'text-blue-500';
            const tempBg = temperatureIcons[temp as keyof typeof temperatureIcons]?.bg || 'bg-blue-500/10';

            return (
              <TableRow
                key={lead.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  isSelected && "bg-primary/5"
                )}
                onClick={() => onViewLead(lead.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(lead.id)}
                  />
                </TableCell>
                
                {/* Lead Info */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-full", tempBg)}>
                      <TempIcon className={cn("h-4 w-4", tempColor)} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{lead.name}</div>
                      {(lead.company || lead.position) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {lead.position && <span>{lead.position}</span>}
                          {lead.position && lead.company && <span>@</span>}
                          {lead.company && (
                            <span className="flex items-center gap-0.5">
                              <Building className="h-3 w-3" />
                              {lead.company}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Contact */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{lead.phone}</span>
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Mail className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{lead.email}</span>
                      </a>
                    )}
                  </div>
                </TableCell>

                {/* Origin */}
                <TableCell>
                  <div className="space-y-1">
                    {lead.lead_origin && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="capitalize">{lead.lead_origin}</span>
                      </div>
                    )}
                    {lead.utm_campaign && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {lead.utm_campaign}
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Assignment */}
                <TableCell>
                  {lead.assigned_to ? (
                    <Badge variant="secondary" className="text-xs">
                      Atribuído
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sem carteira
                    </Badge>
                  )}
                </TableCell>
                {/* Status */}
                <TableCell>
                  <div className="space-y-1">
                    {lead.pipeline_stages && (
                      <Badge
                        style={{
                          backgroundColor: lead.pipeline_stages.color || undefined,
                        }}
                        className="text-white text-xs"
                      >
                        {lead.pipeline_stages.name}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(new Date(lead.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </div>
                  </div>
                </TableCell>

                {/* Actions */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewLead(lead.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalhes
                      </DropdownMenuItem>
                      {lead.phone && (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            WhatsApp
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onTransferLead(lead.id)}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transferir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDeleteLead(lead.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
