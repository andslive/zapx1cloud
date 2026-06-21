INSERT INTO public.platform_email_templates (slug, name, description, category, subject, html_content, variables, is_active, is_system)
VALUES (
  'team_invite',
  'Convite de Equipe',
  'Email enviado quando um novo membro é convidado para a equipe',
  'acesso',
  'Você foi convidado para {{organization_name}} no {{platform_name}}',
  $$<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 22px; color: #0f172a; margin: 0 0 16px;">Você foi convidado!</h1>
  <p style="font-size: 14px; color: #475569; line-height: 1.6;">
    Olá! <strong>{{invited_by_name}}</strong> convidou você para participar da empresa
    <strong>{{organization_name}}</strong> como <strong>{{role_name}}</strong>{{squad_text}} no {{platform_name}}.
  </p>
  <p style="margin: 24px 0;">
    <a href="{{invite_link}}" style="background: hsl(83, 81%, 44%); color: #fff; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px;">
      Aceitar convite
    </a>
  </p>
  <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
    Se você não esperava este convite, pode ignorar este e-mail com segurança.
  </p>
</div>$$,
  '[
    {"name":"platform_name","description":"Nome da plataforma"},
    {"name":"organization_name","description":"Nome da empresa"},
    {"name":"invited_by_name","description":"Quem enviou o convite"},
    {"name":"role_name","description":"Cargo (Administrador, Gestor, Vendedor)"},
    {"name":"squad_text","description":"Texto opcional com o squad"},
    {"name":"invite_link","description":"Link de aceitar convite"}
  ]'::jsonb,
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;