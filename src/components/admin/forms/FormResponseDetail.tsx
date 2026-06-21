import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  User, Mail, Phone, Target, Tag, Clock, Globe, 
  Smartphone, ExternalLink, MapPin, Link as LinkIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FormSubmission, FormBlock } from '@/types/forms';

interface FormResponseDetailProps {
  submission: FormSubmission;
  blocks: FormBlock[];
  onClose: () => void;
}

export function FormResponseDetail({ submission, blocks, onClose }: FormResponseDetailProps) {
  const responses = submission.responses as Record<string, unknown>;
  
  const getBlockLabel = (blockId: string): string => {
    const block = blocks.find(b => b.id === blockId);
    return block?.label || blockId;
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Find value by mapped field (e.g., 'name', 'email', 'phone')
  const getValueByMapping = (mapping: string): string | null => {
    // First check if response has the mapping directly
    if (responses[mapping]) {
      return String(responses[mapping]);
    }
    
    // Then look for a block that maps to this field
    const block = blocks.find(b => b.maps_to === mapping);
    if (block && responses[block.id]) {
      return String(responses[block.id]);
    }
    
    return null;
  };

  const getLeadName = (): string => {
    // Check mapped blocks first
    const mappedName = getValueByMapping('name') || getValueByMapping('full_name');
    if (mappedName) return mappedName;
    
    // Fallback to direct response keys
    return String(responses?.name || responses?.nome || responses?.full_name || 'Anônimo');
  };

  const getLeadEmail = (): string | null => {
    const mappedEmail = getValueByMapping('email');
    if (mappedEmail) return mappedEmail;
    
    return responses?.email ? String(responses.email) : null;
  };

  const getLeadPhone = (): string | null => {
    const mappedPhone = getValueByMapping('phone');
    if (mappedPhone) return mappedPhone;
    
    const phone = responses?.phone || responses?.telefone;
    return phone ? String(phone) : null;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-green-500 bg-green-500/10';
    if (score >= 40) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  const navigateToLead = () => {
    if (submission.lead_id) {
      // Navigate to lead detail in admin panel
      window.location.href = `/admin#lead-${submission.lead_id}`;
    }
  };

  // Get answers by matching block IDs
  const getAnswers = () => {
    const answers: { label: string; value: string; blockId: string }[] = [];
    
    // First, try to match responses to blocks
    blocks.forEach(block => {
      // Skip non-input blocks
      if (['welcome_screen', 'end_screen', 'conditional', 'score', 'tag', 'hidden_field'].includes(block.block_type)) {
        return;
      }
      
      const value = responses[block.id];
      if (value !== undefined) {
        answers.push({
          label: block.label,
          value: formatValue(value),
          blockId: block.id
        });
      }
    });
    
    // Also add any responses that don't match blocks (legacy or direct mapping)
    Object.entries(responses).forEach(([key, value]) => {
      // Skip if already added via block matching
      if (answers.some(a => a.blockId === key)) return;
      // Skip common fields that are shown separately
      if (['name', 'nome', 'email', 'phone', 'telefone', 'full_name'].includes(key)) return;
      
      answers.push({
        label: key,
        value: formatValue(value),
        blockId: key
      });
    });
    
    return answers;
  };

  const answers = getAnswers();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="text-xl">{getLeadName()}</span>
              <p className="text-sm text-muted-foreground font-normal">
                {format(new Date(submission.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            {/* Contact Info */}
            <div className="flex flex-wrap gap-4">
              {getLeadEmail() && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${getLeadEmail()}`} className="hover:underline">
                    {getLeadEmail()}
                  </a>
                </div>
              )}
              {getLeadPhone() && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{getLeadPhone()}</span>
                </div>
              )}
            </div>

            {/* Score and Tags */}
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getScoreColor(submission.total_score || 0)}`}>
                <Target className="h-4 w-4" />
                <span className="font-bold">{submission.total_score || 0} pontos</span>
              </div>
              
              {submission.tags && submission.tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <div className="flex gap-1">
                    {submission.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Answers */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Respostas do Formulário</h3>
              <div className="space-y-4">
                {answers.length > 0 ? (
                  answers.map((answer, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {answer.label}
                        </p>
                        <p className="text-foreground">{answer.value}</p>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhuma resposta registrada
                  </p>
                )}
              </div>
            </div>

            {/* Tracking Info */}
            {(submission.utm_source || submission.landing_page || submission.referrer_url) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">Dados de Rastreamento</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {submission.utm_source && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">UTM Source</p>
                          <p className="text-sm">{submission.utm_source}</p>
                        </div>
                      </div>
                    )}
                    {submission.utm_medium && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">UTM Medium</p>
                          <p className="text-sm">{submission.utm_medium}</p>
                        </div>
                      </div>
                    )}
                    {submission.utm_campaign && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">UTM Campaign</p>
                          <p className="text-sm">{submission.utm_campaign}</p>
                        </div>
                      </div>
                    )}
                    {submission.landing_page && (
                      <div className="flex items-start gap-2 col-span-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Landing Page</p>
                          <p className="text-sm truncate">{submission.landing_page}</p>
                        </div>
                      </div>
                    )}
                    {submission.referrer_url && (
                      <div className="flex items-start gap-2 col-span-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Referrer</p>
                          <p className="text-sm truncate">{submission.referrer_url}</p>
                        </div>
                      </div>
                    )}
                    {submission.geo_city && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Localização</p>
                          <p className="text-sm">{submission.geo_city}{submission.geo_country && `, ${submission.geo_country}`}</p>
                        </div>
                      </div>
                    )}
                    {submission.user_agent && (
                      <div className="flex items-start gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Dispositivo</p>
                          <p className="text-sm truncate max-w-[200px]">{submission.user_agent}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Time Stats */}
            <Separator />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Tempo de preenchimento: {submission.time_spent_seconds ? `${Math.floor(submission.time_spent_seconds / 60)}m ${submission.time_spent_seconds % 60}s` : '-'}</span>
              </div>
              {submission.completed_at && (
                <span>Finalizado em: {format(new Date(submission.completed_at), 'HH:mm:ss')}</span>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-4 border-t bg-background shrink-0">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {submission.lead_id && (
            <Button onClick={navigateToLead}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Ver Lead no CRM
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
