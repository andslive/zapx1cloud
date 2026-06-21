import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, UserCog, User, Mail, MoreVertical, Users, Package, Trash2, Settings2 } from 'lucide-react';
import { TeamMember } from '@/hooks/useTeam';

const roleConfig = {
  admin: { label: 'Admin', icon: Shield, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  manager: { label: 'Gestor', icon: UserCog, color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  seller: { label: 'Vendedor', icon: User, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
};

interface MemberCardProps {
  member: TeamMember;
  onEditRole: (member: TeamMember) => void;
  onEditSquad: (member: TeamMember) => void;
  onAssignProduct: (member: TeamMember) => void;
  onEditPermissions: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
}

export function MemberCard({ member, onEditRole, onEditSquad, onAssignProduct, onEditPermissions, onRemove }: MemberCardProps) {
  const role = member.roles[0]?.role || 'seller';
  const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.seller;
  const Icon = config.icon;
  const squad = member.squads[0];
  const products = member.products || [];
  const visibleProducts = products.slice(0, 2);
  const hiddenProductsCount = products.length - 2;

  return (
    <Card className="bg-card hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarImage src={member.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {member.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-foreground truncate">
                  {member.full_name}
                </h3>
                {!member.is_active && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                    Inativo
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{member.email}</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {/* Role Badge */}
                <Badge variant="outline" className={config.color}>
                  <Icon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
                
                {/* Squad Badge */}
                {squad && (
                  <Badge 
                    variant="outline"
                    className="gap-1"
                    style={{ 
                      backgroundColor: `${squad.color}15`,
                      borderColor: `${squad.color}40`,
                    }}
                  >
                    <div 
                      className="h-2 w-2 rounded-full" 
                      style={{ backgroundColor: squad.color || '#6366F1' }}
                    />
                    <span style={{ color: squad.color || undefined }}>
                      {squad.name}
                    </span>
                  </Badge>
                )}

                {/* Product Badges */}
                {visibleProducts.map(product => (
                  <Badge 
                    key={product.id}
                    variant="secondary"
                    className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  >
                    <Package className="h-3 w-3" />
                    <span className="truncate max-w-[80px]">{product.name}</span>
                  </Badge>
                ))}

                {/* Hidden Products Indicator */}
                {hiddenProductsCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-help">
                          +{hiddenProductsCount}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium mb-1">Outros produtos:</p>
                        <ul className="text-sm">
                          {products.slice(2).map(p => (
                            <li key={p.id}>• {p.name}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditRole(member)}>
                <UserCog className="h-4 w-4 mr-2" />
                Alterar Papel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditSquad(member)}>
                <Users className="h-4 w-4 mr-2" />
                Gerenciar Squad
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssignProduct(member)}>
                <Package className="h-4 w-4 mr-2" />
                Atribuir Produtos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditPermissions(member)}>
                <Settings2 className="h-4 w-4 mr-2" />
                Permissões
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onRemove(member)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Apagar Usuário
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
