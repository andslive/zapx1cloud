import { useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import { useTeamMembers } from '@/hooks/useTeam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, Filter, Users, Clock, AlertTriangle, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';

interface KanbanTabProps {
  productId: string;
}

export function KanbanTab({ productId }: KanbanTabProps) {
  const { data: leads } = useLeads(productId);
  const { data: teamMembers } = useTeamMembers();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Fetch pipeline stages for this product
  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('product_id', productId)
        .order('order_index');
      
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  const productLeads = leads || [];

  // Filter leads
  const filteredLeads = productLeads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSeller = filterSeller === 'all' || lead.assigned_to === filterSeller;
    
    return matchesSearch && matchesSeller;
  });

  // Group leads by stage
  const leadsByStage = stages?.reduce((acc, stage) => {
    acc[stage.id] = filteredLeads.filter(l => l.current_stage_id === stage.id);
    return acc;
  }, {} as Record<string, typeof productLeads>) || {};

  // Leads without stage
  const leadsWithoutStage = filteredLeads.filter(l => !l.current_stage_id);

  const getSellerInfo = (sellerId: string | null) => {
    if (!sellerId) return null;
    return teamMembers?.find(m => m.id === sellerId);
  };

  const getLeadAge = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const isLeadStale = (lead: typeof productLeads[0]) => {
    if (!lead.last_contact_at) return true;
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceContact > 5;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="bg-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lead..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrar por vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {teamMembers?.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {/* New/Unassigned Column */}
          {leadsWithoutStage.length > 0 && (
            <div className="w-72 flex-shrink-0">
              <Card className="bg-card h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Sem Etapa</CardTitle>
                    <Badge variant="outline">{leadsWithoutStage.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2 pr-2">
                      {leadsWithoutStage.map(lead => (
                        <LeadCard 
                          key={lead.id} 
                          lead={lead} 
                          seller={getSellerInfo(lead.assigned_to)}
                          isStale={isLeadStale(lead)}
                          age={getLeadAge(lead.created_at)}
                          onViewDetails={() => {
                            setSelectedLeadId(lead.id);
                            setDetailModalOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Stage Columns */}
          {stages?.map(stage => (
            <div key={stage.id} className="w-72 flex-shrink-0">
              <Card className="bg-card h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: stage.color || '#888' }}
                      />
                      <CardTitle className="text-sm font-medium">{stage.name}</CardTitle>
                    </div>
                    <Badge variant="outline">{leadsByStage[stage.id]?.length || 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2 pr-2">
                      {leadsByStage[stage.id]?.map(lead => (
                        <LeadCard 
                          key={lead.id} 
                          lead={lead} 
                          seller={getSellerInfo(lead.assigned_to)}
                          isStale={isLeadStale(lead)}
                          age={getLeadAge(lead.created_at)}
                          onViewDetails={() => {
                            setSelectedLeadId(lead.id);
                            setDetailModalOpen(true);
                          }}
                        />
                      ))}
                      {(!leadsByStage[stage.id] || leadsByStage[stage.id].length === 0) && (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          Nenhum lead nesta etapa
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Empty state if no stages */}
          {(!stages || stages.length === 0) && leadsWithoutStage.length === 0 && (
            <Card className="bg-card w-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">Nenhum lead</h3>
                <p className="text-sm text-muted-foreground">
                  Configure as etapas do pipeline e adicione leads
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lead Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
          {selectedLeadId && (
            <LeadDetailPage
              leadId={selectedLeadId}
              onBack={() => {
                setDetailModalOpen(false);
                setSelectedLeadId(null);
              }}
              isAdminView={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Lead Card Component
interface LeadCardProps {
  lead: {
    id: string;
    name: string;
    company?: string | null;
    email?: string | null;
    temperature?: string | null;
    last_contact_at?: string | null;
  };
  seller: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  } | null | undefined;
  isStale: boolean;
  age: number;
}

function LeadCard({ lead, seller, isStale, age, onViewDetails }: LeadCardProps & { onViewDetails: () => void }) {
  const temperatureColors: Record<string, string> = {
    hot: 'bg-destructive/10 text-destructive',
    warm: 'bg-warning/10 text-warning',
    cold: 'bg-primary/10 text-primary',
  };

  return (
    <div 
      className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
      onClick={onViewDetails}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{lead.name}</p>
          {lead.company && (
            <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStale && (
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {lead.temperature && (
            <Badge 
              variant="outline" 
              className={`text-xs ${temperatureColors[lead.temperature] || ''}`}
            >
              {lead.temperature === 'hot' ? '🔥' : lead.temperature === 'warm' ? '☀️' : '❄️'}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {age}d
          </div>
        </div>

        {seller && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={seller.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {seller.full_name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
