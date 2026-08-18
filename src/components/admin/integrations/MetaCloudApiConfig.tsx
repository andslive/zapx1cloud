import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Facebook, Lock } from 'lucide-react';
import { META_CLOUD_API_ENABLED } from '@/config/metaCloudApiFeatureFlag';

/**
 * FASE 2A — estrutura desativada. Nenhum SDK do Facebook é carregado aqui,
 * nenhum login é aberto, nenhum authorization code é trocado. Isso é
 * intencional: a Fase 2A entrega só a fundação (contrato de provider,
 * webhook, migrations locais) — o fluxo real de Embedded Signup é Fase 2B,
 * condicionado a pré-requisitos externos (Tech Provider/Solution Partner
 * junto à Meta — ver checklist externo do relatório desta fase) que ainda
 * não foram supridos.
 */
export function MetaCloudApiConfig() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Facebook className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Cloud API (Meta Oficial)</CardTitle>
                <CardDescription>
                  Conecte números pela API oficial da Meta, com suporte à Coexistência.
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Em configuração</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Lock className="h-4 w-4" />
              Este provedor ainda não está disponível para conexão.
            </p>
            <p>
              A UazAPI continua sendo o provedor padrão para todas as conexões existentes.
              Este card é apenas a estrutura da futura integração oficial com a Meta — nenhuma
              credencial real, número ou organização pode ser conectada por aqui ainda.
            </p>
            <p>
              Pré-requisitos pendentes fora deste sistema (conta de parceiro junto à Meta,
              aplicativo aprovado, Embedded Signup configurado) precisam ser resolvidos antes
              da ativação — ver checklist da Fase 2A.
            </p>
          </div>

          <Button disabled variant="outline" className="gap-2">
            <Facebook className="h-4 w-4" />
            Conectar com Facebook
          </Button>

          {/* Reforço redundante e explícito: garante que o botão nunca
              pareça "vivo" caso a flag mude sem revisão do restante do card. */}
          {META_CLOUD_API_ENABLED === false && (
            <p className="text-xs text-muted-foreground">
              Feature flag global e por organização desligadas por padrão.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
