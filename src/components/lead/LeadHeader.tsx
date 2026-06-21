import { useState } from 'react';
import { ArrowLeft, Mail, Phone, MessageCircle, MoreVertical, Flame, Snowflake, Thermometer, Building2, MapPin, User, Pencil, RefreshCw, Sparkles } from 'lucide-react';
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
import { CallWithAIDialog } from './CallWithAIDialog';

interface LeadHeaderProps {
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    position?: string | null;
    product_id?: string | null;
    temperature?: 'hot' | 'warm' | 'cold' | null;
    assigned_to?: string | null;
    assignee?: {
      full_name: string;
      avatar_url?: string | null;
    } | null;
    squad?: {
      name: string;
      color?: string | null;
    } | null;
  };
  onBack: () => void;
  onTransfer?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onWhatsApp?: () => void;
  isAdmin?: boolean;
}

export function LeadHeader({ lead, onBack, onTransfer, onEdit, onDelete, onWhatsApp, isAdmin }: LeadHeaderProps) {
  const [callAIOpen, setCallAIOpen] = useState(false);
  const getTemperatureIcon = () => {
    switch (lead.temperature) {
      case 'hot':
        return <Flame className="h-5 w-5 text-red-500" />;
      case 'warm':
        return <Thermometer className="h-5 w-5 text-amber-500" />;
      case 'cold':
        return <Snowflake className="h-5 w-5 text-blue-500" />;
      default:
        return <Thermometer className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTemperatureLabel = () => {
    switch (lead.temperature) {
      case 'hot': return 'Quente';
      case 'warm': return 'Morno';
      case 'cold': return 'Frio';
      default: return 'Não definido';
    }
  };

  return (
    <>
    <div className="border-b border-border bg-card">
      <div className="p-3 md:p-6">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar Informações
                </DropdownMenuItem>
              )}
              {onTransfer && (
                <DropdownMenuItem onClick={onTransfer}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Transferir Lead
                </DropdownMenuItem>
              )}
              {isAdmin && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    Excluir Lead
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Lead info */}
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getTemperatureIcon()}
              <h1 className="text-lg md:text-2xl font-bold text-foreground">{lead.name}</h1>
              <Badge variant="outline" className="text-xs">
                {getTemperatureLabel()}
              </Badge>
            </div>
            
            {(lead.position || lead.company) && (
              <p className="text-muted-foreground mb-3">
                {lead.position && <span>{lead.position}</span>}
                {lead.position && lead.company && <span> @ </span>}
                {lead.company && <span className="font-medium">{lead.company}</span>}
              </p>
            )}

            {/* Contact info */}
            <div className="flex flex-wrap gap-2 md:gap-4 text-sm">
              {lead.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.company && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{lead.company}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {lead.phone && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => setCallAIOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Chamar com IA</span>
              </Button>
            )}
            {lead.email && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={`mailto:${lead.email}`}>
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Email</span>
                </a>
              </Button>
            )}
            {lead.phone && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onWhatsApp}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            )}
          </div>
        </div>

        {/* Assigned info */}
        {(lead.assignee || lead.squad) && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-4">
            {lead.assignee && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={lead.assignee.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {lead.assignee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">{lead.assignee.full_name}</span>
              </div>
            )}
            {!lead.assignee && lead.assigned_to === null && (
              <div className="flex items-center gap-2 text-amber-500">
                <User className="h-4 w-4" />
                <span className="text-sm">Sem atendimento</span>
              </div>
            )}
            {lead.squad && (
              <Badge 
                variant="secondary" 
                style={{ 
                  backgroundColor: lead.squad.color ? `${lead.squad.color}20` : undefined,
                  color: lead.squad.color || undefined,
                  borderColor: lead.squad.color || undefined
                }}
                className="border"
              >
                {lead.squad.name}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
    <CallWithAIDialog
      open={callAIOpen}
      onOpenChange={setCallAIOpen}
      lead={{ id: lead.id, name: lead.name, phone: lead.phone, product_id: lead.product_id }}
    />
    </>
  );
}
