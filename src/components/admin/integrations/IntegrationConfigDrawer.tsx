import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { IntegrationItem } from '@/config/integrationsCatalog';
import { META_CLOUD_API_ENABLED } from '@/config/metaCloudApiFeatureFlag';
import type { HookCloudSensitiveLifecycle } from '@/lib/hookcloud/hookcloudProvisioning';
import { ApiKeysManager } from './ApiKeysManager';
import { WhatsAppConfig } from './WhatsAppConfig';
import { MetaCloudApiConfig } from './MetaCloudApiConfig';
import { BotConversaConfig } from './BotConversaConfig';
import { HookCloudOnboardingConfig } from './HookCloudOnboardingConfig';
import { FacebookLeadsConfig } from './FacebookLeadsConfig';
import { EmailConfigManager } from './EmailConfigManager';
import { EmailTemplatesManager } from './EmailTemplatesManager';
import { MassEmailManager } from './MassEmailManager';
import { GoogleCalendarOAuthConfig } from './GoogleCalendarOAuthConfig';
import { SankhyaConfigManager } from './SankhyaConfigManager';
import { CaktoAdminPanel } from '../payments/CaktoAdminPanel';
import { HotmartConfigManager } from './HotmartConfigManager';
import { DoppusConfigManager } from './DoppusConfigManager';
import {
  OpenAIConfig,
  ClaudeConfig,
  GeminiConfig,
  LovableAIInfo,
  WebhooksLink,
  AIRoutingConfig,
} from './AIProviderConfigs';

interface IntegrationConfigDrawerProps {
  item: IntegrationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * FASE 18B, achado 3 — repassa ao dono do estado do drawer
   * (`IntegrationsManager`) o lifecycle NÃO sensível do formulário
   * HookCloud (nunca o segredo em si), para que ele possa recusar
   * fechar o Sheet ou trocar de item enquanto uma submissão está em
   * andamento ou um segredo ainda não foi confirmado como salvo. Opcional
   * porque nenhum outro painel deste drawer usa esse protocolo.
   */
  onHookCloudLifecycleChange?: (state: HookCloudSensitiveLifecycle) => void;
}

export function IntegrationConfigDrawer({ item, open, onOpenChange, onHookCloudLifecycleChange }: IntegrationConfigDrawerProps) {
  const renderBody = () => {
    if (!item?.configKey) return null;
    switch (item.configKey) {
      case 'whatsapp':
        return <WhatsAppConfig />;
      case 'meta-cloud-api':
        // Fase 5E — defesa adicional: o item já é removido do catálogo
        // renderizado quando a flag está desligada (integrationsCatalog.ts),
        // então este painel deveria ser inalcançável pela UI normal. Esta
        // checagem só cobre uma abertura programática direta (ex.: alguém
        // montando `item`/`open` manualmente fora do fluxo do catálogo).
        return META_CLOUD_API_ENABLED ? <MetaCloudApiConfig /> : null;
      case 'botconversa':
        return <BotConversaConfig />;
      case 'hookcloud-onboarding':
        // FASE 18A — defesa adicional, mesmo padrão do caso 'meta-cloud-api'
        // acima: o item já só entra no catálogo renderizado quando a
        // consulta real de `useHookCloudPilotAccess` resolve `visible=true`
        // (flag da organização + papel admin/super_admin) — este painel
        // não tem nenhuma checagem própria adicional porque a AUTORIDADE
        // real de autorização é sempre o backend (`hookcloud-provision-connection`,
        // já auditado), nunca o frontend. FASE 18B: repassa o lifecycle
        // sensível para o dono do drawer via `onHookCloudLifecycleChange`.
        return <HookCloudOnboardingConfig onSensitiveLifecycleChange={onHookCloudLifecycleChange} />;
      case 'facebook':
        return <FacebookLeadsConfig />;
      case 'email-config':
        return <EmailConfigManager />;
      case 'email-templates':
        return <EmailTemplatesManager />;
      case 'mass-email':
        return <MassEmailManager />;
      case 'google-calendar':
        return <GoogleCalendarOAuthConfig />;
      case 'sankhya':
        return <SankhyaConfigManager />;
      case 'api-keys':
        return <ApiKeysManager />;
      case 'openai':
        return <OpenAIConfig />;
      case 'anthropic':
        return <ClaudeConfig />;
      case 'gemini':
        return <GeminiConfig />;
      case 'lovable-ai':
        return <LovableAIInfo />;
      case 'ai-routing':
        return <AIRoutingConfig />;
      case 'cakto':
        return <CaktoAdminPanel />;
      case 'hotmart':
        return <HotmartConfigManager />;
      case 'doppus':
        return <DoppusConfigManager />;
      case 'webhooks-link':
        return <WebhooksLink />;
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl"
      >
        {item && (
          <>
            <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
              <SheetTitle className="flex items-center gap-2">
                {item.logoSrc ? (
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-background ring-1 ring-border">
                    <img src={item.logoSrc} alt="" className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <span className={`flex h-8 w-8 items-center justify-center rounded-md ${item.color}`}>
                    <item.icon className="h-4 w-4" />
                  </span>
                )}
                {item.name}
              </SheetTitle>
              <SheetDescription>{item.description}</SheetDescription>
            </SheetHeader>
            <div className="px-6 py-6">{renderBody()}</div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
