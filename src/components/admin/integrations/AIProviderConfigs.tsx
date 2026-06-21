import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, Save, ExternalLink, Sparkles, Webhook, ArrowRight, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAICredentials, useSaveAICredential, useDeleteAICredential } from '@/hooks/useAIRouting';
import { AIRoutingPanel } from './AIRoutingPanel';

interface AIProviderConfigProps {
  provider: 'openai' | 'anthropic' | 'gemini';
}

const PROVIDER_META = {
  openai: {
    name: 'OpenAI (ChatGPT)',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Obter chave OpenAI',
    helpText: 'Acesse o painel da OpenAI em "API Keys" e crie uma nova chave secreta.',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Obter chave Claude',
    helpText: 'No console da Anthropic, vá em Settings → API Keys e gere uma nova chave.',
  },
  gemini: {
    name: 'Google Gemini',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Obter chave Gemini',
    helpText: 'Acesse o Google AI Studio e clique em "Create API Key".',
  },
} as const;

function AIProviderConfig({ provider }: AIProviderConfigProps) {
  const meta = PROVIDER_META[provider];
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { data: credentials = [] } = useAICredentials();
  const save = useSaveAICredential();
  const del = useDeleteAICredential();

  const current = credentials.find((c) => c.provider === provider);
  const isConfigured = !!current;

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('Cole a API Key antes de salvar');
      return;
    }
    save.mutate(
      { provider, api_key: apiKey.trim() },
      { onSuccess: () => setApiKey('') },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{meta.name}</CardTitle>
        <CardDescription>
          Use sua própria conta para que a plataforma use esse provedor.
          Por padrão, tudo usa <strong>Lovable AI</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConfigured && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-700 dark:text-green-400">
                Chave verificada {current?.api_key_masked ? `(${current.api_key_masked})` : ''}
                {current?.last_verified_at
                  ? ` em ${new Date(current.last_verified_at).toLocaleDateString('pt-BR')}`
                  : ''}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => del.mutate(provider)}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remover
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? 'Cole uma nova chave para substituir' : meta.placeholder}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{meta.helpText}</p>
          <p className="text-xs text-muted-foreground">
            A chave é validada com o provedor antes de ser salva. Depois, escolha onde
            ela será usada na aba <strong>Roteamento de IA</strong>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={save.isPending || !apiKey.trim()}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isConfigured ? 'Atualizar e verificar' : 'Salvar e verificar'}
          </Button>
          <Button variant="outline" asChild>
            <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {meta.docsLabel}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OpenAIConfig() {
  return <AIProviderConfig provider="openai" />;
}
export function ClaudeConfig() {
  return <AIProviderConfig provider="anthropic" />;
}
export function GeminiConfig() {
  return <AIProviderConfig provider="gemini" />;
}
export function AIRoutingConfig() {
  return <AIRoutingPanel />;
}

export function LovableAIInfo() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Lovable AI</CardTitle>
            <CardDescription>Gateway nativo já incluso na plataforma</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-green-700 dark:text-green-400">
            Já está ativo — não requer configuração.
          </span>
        </div>
        <p className="text-muted-foreground">
          O Lovable AI é o provedor padrão dos agentes. Ele dá acesso aos modelos
          mais modernos (Google Gemini e OpenAI GPT) sem precisar configurar
          contas externas. Ideal para começar rápido.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Modelos disponíveis: Gemini 2.5 Pro, Flash, Lite e GPT-5.</li>
          <li>Cobrado conforme o plano da plataforma.</li>
          <li>Para usar sua própria conta, configure OpenAI, Claude ou Gemini.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function WebhooksLink() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Webhooks Customizados</CardTitle>
            <CardDescription>Configurados em Automação & IA → Webhooks</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Os webhooks customizados ficam em uma seção dedicada no menu lateral.
          Você pode criar gatilhos, filtros e ações conectadas a sistemas externos.
        </p>
        <Button onClick={() => navigate('/admin?section=webhooks')}>
          Abrir Webhooks
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
