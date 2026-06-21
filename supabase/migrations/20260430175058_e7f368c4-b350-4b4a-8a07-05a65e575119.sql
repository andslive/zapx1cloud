-- 1. Tabela de templates da plataforma (gerenciados pelo Super Admin)
CREATE TABLE IF NOT EXISTS public.platform_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('acesso', 'cobranca', 'sistema', 'mala_direta')),
  subject text NOT NULL,
  html_content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage platform email templates"
ON public.platform_email_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated can view active platform templates"
ON public.platform_email_templates
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE TRIGGER update_platform_email_templates_updated_at
BEFORE UPDATE ON public.platform_email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed dos templates default
INSERT INTO public.platform_email_templates (slug, name, description, category, subject, html_content, variables) VALUES

('welcome_company', 'Boas-vindas Nova Empresa', 'Enviado quando uma nova empresa se cadastra na plataforma',
'sistema',
'Bem-vindo ao {{platform_name}}, {{company_name}}!',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1 style="color:#1f2937">Bem-vindo, {{company_name}}!</h1>
<p>Olá {{user_name}},</p>
<p>É um prazer ter você conosco no <strong>{{platform_name}}</strong>. Sua conta foi criada com sucesso e você já pode começar a usar todas as funcionalidades.</p>
<p style="margin:32px 0"><a href="{{login_url}}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Acessar plataforma</a></p>
<p>Qualquer dúvida, é só responder este email.</p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","company_name","user_name","login_url"]'::jsonb),

('payment_reminder', 'Cobrança Pendente', 'Lembrete de pagamento próximo ao vencimento',
'cobranca',
'Lembrete: sua fatura vence em {{days_until_due}} dias',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>Lembrete de pagamento</h1>
<p>Olá {{user_name}},</p>
<p>Sua fatura no valor de <strong>R$ {{amount}}</strong> vence em <strong>{{days_until_due}} dias</strong> ({{due_date}}).</p>
<p>Para evitar interrupções no serviço, efetue o pagamento o quanto antes.</p>
<p style="margin:32px 0"><a href="{{payment_url}}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Pagar agora</a></p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","user_name","amount","due_date","days_until_due","payment_url"]'::jsonb),

('payment_due', 'Cobrança no Vencimento', 'Enviado no dia do vencimento da fatura',
'cobranca',
'Sua fatura vence hoje',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>Sua fatura vence hoje</h1>
<p>Olá {{user_name}},</p>
<p>Sua fatura no valor de <strong>R$ {{amount}}</strong> vence hoje ({{due_date}}).</p>
<p style="margin:32px 0"><a href="{{payment_url}}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Pagar agora</a></p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","user_name","amount","due_date","payment_url"]'::jsonb),

('payment_overdue', 'Pagamento Atrasado', 'Alerta de pagamento em atraso',
'cobranca',
'⚠️ Pagamento em atraso há {{days_overdue}} dias',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1 style="color:#dc2626">Pagamento em atraso</h1>
<p>Olá {{user_name}},</p>
<p>Identificamos que sua fatura de <strong>R$ {{amount}}</strong> está em atraso há <strong>{{days_overdue}} dias</strong>.</p>
<p>Para evitar a suspensão da sua conta, regularize o pagamento o quanto antes.</p>
<p style="margin:32px 0"><a href="{{payment_url}}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Regularizar agora</a></p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","user_name","amount","days_overdue","payment_url"]'::jsonb),

('account_suspended', 'Conta Suspensa', 'Notificação de suspensão por inadimplência',
'cobranca',
'Sua conta foi suspensa',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1 style="color:#dc2626">Conta suspensa</h1>
<p>Olá {{user_name}},</p>
<p>Sua conta no {{platform_name}} foi suspensa por inadimplência. Para reativar, regularize o pagamento pendente.</p>
<p style="margin:32px 0"><a href="{{payment_url}}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Regularizar e reativar</a></p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","user_name","payment_url"]'::jsonb),

('subscription_canceled', 'Assinatura Cancelada', 'Confirmação de cancelamento de assinatura',
'cobranca',
'Confirmação de cancelamento',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>Cancelamento confirmado</h1>
<p>Olá {{user_name}},</p>
<p>Confirmamos o cancelamento da sua assinatura no {{platform_name}}. Sua conta permanecerá ativa até {{end_date}}.</p>
<p>Sentiremos sua falta! Se mudar de ideia, é só voltar.</p>
<p>Equipe {{platform_name}}</p>
</div>',
'["platform_name","user_name","end_date"]'::jsonb),

('team_invite', 'Convite de Equipe', 'Convite para participar da equipe',
'acesso',
'{{invited_by_name}} convidou você para o {{organization_name}}',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>Você foi convidado!</h1>
<p>Olá,</p>
<p><strong>{{invited_by_name}}</strong> convidou você para participar da equipe <strong>{{organization_name}}</strong> no {{platform_name}}{{squad_text}} como <strong>{{role_name}}</strong>.</p>
<p style="margin:32px 0"><a href="{{invite_link}}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Aceitar convite</a></p>
<p style="font-size:13px;color:#6b7280">Este link expira em 7 dias.</p>
</div>',
'["platform_name","organization_name","invited_by_name","role_name","squad_text","invite_link"]'::jsonb),

('booking_confirmation', 'Confirmação de Agendamento', 'Confirmação enviada após agendamento',
'sistema',
'Agendamento confirmado: {{event_name}}',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>Agendamento confirmado ✅</h1>
<p>Olá {{guest_name}},</p>
<p>Seu agendamento foi confirmado:</p>
<table style="margin:16px 0;border-collapse:collapse">
<tr><td style="padding:8px;font-weight:600">Evento:</td><td style="padding:8px">{{event_name}}</td></tr>
<tr><td style="padding:8px;font-weight:600">Com:</td><td style="padding:8px">{{host_name}}</td></tr>
<tr><td style="padding:8px;font-weight:600">Data:</td><td style="padding:8px">{{date_time}}</td></tr>
</table>
{{meet_link_block}}
<p style="margin:24px 0"><a href="{{confirmation_url}}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Ver agendamento</a></p>
</div>',
'["guest_name","event_name","host_name","date_time","meet_link_block","confirmation_url"]'::jsonb),

('admin_notification', 'Notificação Admin', 'Notificações administrativas multicanal',
'sistema',
'{{title}}',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
<h1>{{title}}</h1>
<p>Olá {{user_name}},</p>
<p>{{message}}</p>
{{action_block}}
<p style="font-size:12px;color:#9ca3af;margin-top:32px">Notificação automática do {{platform_name}}.</p>
</div>',
'["platform_name","user_name","title","message","action_block"]'::jsonb),

('mass_email_default', 'Mala Direta (padrão)', 'Template base para campanhas de mala direta',
'mala_direta',
'{{subject}}',
'<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6">
{{content}}
<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:12px;color:#9ca3af">Você recebeu este email porque está cadastrado no {{platform_name}}.</p>
</div>',
'["platform_name","subject","content"]'::jsonb)

ON CONFLICT (slug) DO NOTHING;

-- 3. Atualiza provider default na tabela de configurações
ALTER TABLE public.platform_email_settings
  ALTER COLUMN provider SET DEFAULT 'lovable_emails';

UPDATE public.platform_email_settings
SET provider = 'lovable_emails'
WHERE provider = 'resend' OR provider IS NULL;