import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  subject: string;
  html_content: string;
  variables: Array<{ name: string; description: string }>;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TEMPLATES = [
  {
    slug: 'team_invite',
    name: 'Convite de Membro',
    subject: 'Você foi convidado como {{role}}!',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { color: white; margin: 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Você foi convidado!</h1>
    </div>
    <div class="content">
      <p>Olá,</p>
      <p>Você foi convidado por <strong>{{invitedByName}}</strong> para se juntar à equipe como <strong>{{role}}</strong>{{squadName}}.</p>
      <p>Clique no botão abaixo para aceitar o convite:</p>
      <p style="text-align: center;">
        <a href="{{inviteLink}}" class="button">Aceitar Convite</a>
      </p>
      <p>Este convite expira em 7 dias.</p>
    </div>
    <div class="footer">
      <p>{{organizationName}}</p>
    </div>
  </div>
</body>
</html>`,
    variables: [
      { name: 'invitedByName', description: 'Nome de quem enviou o convite' },
      { name: 'role', description: 'Papel do convidado (Vendedor, Gestor, Admin)' },
      { name: 'squadName', description: 'Nome do squad (se aplicável)' },
      { name: 'inviteLink', description: 'Link para aceitar o convite' },
      { name: 'organizationName', description: 'Nome da organização' }
    ],
    is_system: true
  },
  {
    slug: 'welcome',
    name: 'Boas-vindas',
    subject: 'Bem-vindo(a) ao time!',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { color: white; margin: 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Bem-vindo(a)!</h1>
    </div>
    <div class="content">
      <p>Olá <strong>{{userName}}</strong>,</p>
      <p>É um prazer ter você no time! Sua conta foi criada com sucesso na <strong>{{organizationName}}</strong>.</p>
      <p>Acesse a plataforma e comece a vender!</p>
    </div>
    <div class="footer">
      <p>{{organizationName}}</p>
    </div>
  </div>
</body>
</html>`,
    variables: [
      { name: 'userName', description: 'Nome do usuário' },
      { name: 'organizationName', description: 'Nome da organização' }
    ],
    is_system: true
  },
  {
    slug: 'announcement',
    name: 'Comunicado Geral',
    subject: '{{title}}',
    html_content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📢 {{title}}</h1>
    </div>
    <div class="content">
      <p>Olá <strong>{{userName}}</strong>,</p>
      <div>{{message}}</div>
      <p style="margin-top: 20px; color: #666; font-size: 14px;">— {{senderName}}</p>
    </div>
    <div class="footer">
      <p>{{organizationName}}</p>
    </div>
  </div>
</body>
</html>`,
    variables: [
      { name: 'title', description: 'Título do comunicado' },
      { name: 'userName', description: 'Nome do destinatário' },
      { name: 'message', description: 'Conteúdo da mensagem' },
      { name: 'senderName', description: 'Nome do remetente' },
      { name: 'organizationName', description: 'Nome da organização' }
    ],
    is_system: true
  }
];

export function useEmailTemplates() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['email-templates', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // If no templates exist, return defaults
      if (!data || data.length === 0) {
        return DEFAULT_TEMPLATES.map((t, i) => ({
          id: `default-${i}`,
          organization_id: profile!.organization_id!,
          ...t,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })) as EmailTemplate[];
      }

      return data as EmailTemplate[];
    },
    enabled: !!profile?.organization_id
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (template: Omit<EmailTemplate, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('email_templates')
        .insert({
          organization_id: profile!.organization_id!,
          ...template
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template criado');
    },
    onError: (error) => {
      toast.error('Erro ao criar template: ' + error.message);
    }
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async ({ id, ...template }: Partial<EmailTemplate> & { id: string }) => {
      // Check if it's a default template that needs to be created first
      if (id.startsWith('default-')) {
        const { error } = await supabase
          .from('email_templates')
          .insert([{
            organization_id: profile!.organization_id!,
            name: template.name!,
            slug: template.slug!,
            subject: template.subject!,
            html_content: template.html_content!,
            variables: template.variables ? JSON.parse(JSON.stringify(template.variables)) : null,
            is_system: template.is_system ?? false,
            is_active: template.is_active ?? true
          }]);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_templates')
          .update(template)
          .eq('id', id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar template: ' + error.message);
    }
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template excluído');
    },
    onError: (error) => {
      toast.error('Erro ao excluir template: ' + error.message);
    }
  });
}

export { DEFAULT_TEMPLATES };
