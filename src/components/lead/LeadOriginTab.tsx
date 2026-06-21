import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  Link2, 
  Tag, 
  Calendar, 
  MousePointer,
  Megaphone,
  Hash,
  FileText,
  ExternalLink
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadTracking, LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import { Loader2 } from 'lucide-react';

interface LeadOriginTabProps {
  leadId: string;
}

export function LeadOriginTab({ leadId }: LeadOriginTabProps) {
  const { data: tracking, isLoading } = useLeadTracking(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getOriginLabel = (value: string | null) => {
    if (!value) return 'Não informado';
    return LEAD_ORIGINS.find(o => o.value === value)?.label || value;
  };

  const getChannelLabel = (value: string | null) => {
    if (!value) return 'Não informado';
    return LEAD_CHANNELS.find(c => c.value === value)?.label || value;
  };

  const hasUtmParams = tracking?.utm_source || tracking?.utm_medium || tracking?.utm_campaign || tracking?.utm_term || tracking?.utm_content;

  return (
    <div className="space-y-4">
      {/* Main origin info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Origem do Lead
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Fonte</p>
              <Badge variant="secondary" className="text-sm">
                {getOriginLabel(tracking?.lead_origin)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Canal de Entrada</p>
              <Badge variant="outline" className="text-sm">
                {getChannelLabel(tracking?.lead_channel)}
              </Badge>
            </div>
          </div>

          {tracking?.created_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-border">
              <Calendar className="h-4 w-4" />
              <span>
                Criado em {format(parseISO(tracking.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* UTM Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Parâmetros UTM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasUtmParams ? (
            <div className="space-y-3">
              {tracking?.utm_source && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">utm_source</p>
                    <p className="font-medium">{tracking.utm_source}</p>
                  </div>
                </div>
              )}
              
              {tracking?.utm_medium && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                    <Megaphone className="h-4 w-4 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">utm_medium</p>
                    <p className="font-medium">{tracking.utm_medium}</p>
                  </div>
                </div>
              )}
              
              {tracking?.utm_campaign && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-accent flex items-center justify-center flex-shrink-0">
                    <Hash className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">utm_campaign</p>
                    <p className="font-medium">{tracking.utm_campaign}</p>
                  </div>
                </div>
              )}
              
              {tracking?.utm_term && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <MousePointer className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">utm_term</p>
                    <p className="font-medium">{tracking.utm_term}</p>
                  </div>
                </div>
              )}
              
              {tracking?.utm_content && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">utm_content</p>
                    <p className="font-medium">{tracking.utm_content}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum parâmetro UTM registrado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Referrer info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Referência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tracking?.landing_page && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Landing Page</p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">
                  {tracking.landing_page}
                </code>
              </div>
            </div>
          )}
          
          {tracking?.referrer_url && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Referrer URL</p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">
                  {tracking.referrer_url}
                </code>
                <a 
                  href={tracking.referrer_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
          
          {!tracking?.landing_page && !tracking?.referrer_url && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma informação de referência registrada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
