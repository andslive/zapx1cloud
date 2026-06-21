import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { IntegrationItem } from '@/config/integrationsCatalog';
import { ApiKeysManager } from './ApiKeysManager';
import { WhatsAppConfig } from './WhatsAppConfig';
import { BotConversaConfig } from './BotConversaConfig';
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
}

export function IntegrationConfigDrawer({ item, open, onOpenChange }: IntegrationConfigDrawerProps) {
  const renderBody = () => {
    if (!item?.configKey) return null;
    switch (item.configKey) {
      case 'whatsapp':
        return <WhatsAppConfig />;
      case 'botconversa':
        return <BotConversaConfig />;
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
