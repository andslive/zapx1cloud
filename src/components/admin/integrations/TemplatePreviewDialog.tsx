import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmailTemplate } from '@/hooks/useEmailTemplates';

interface TemplatePreviewDialogProps {
  template: EmailTemplate | null;
  open: boolean;
  onClose: () => void;
}

export function TemplatePreviewDialog({ template, open, onClose }: TemplatePreviewDialogProps) {
  if (!template) return null;

  const renderPreview = () => {
    let html = template.html_content;
    
    // Replace variables with sample data
    const sampleData: Record<string, string> = {
      userName: 'João Silva',
      role: 'Vendedor',
      squadName: ' no Squad Alpha',
      inviteLink: '#',
      organizationName: 'Sua Empresa',
      invitedByName: 'Maria Santos',
      title: 'Comunicado Importante',
      message: 'Este é o conteúdo da mensagem de exemplo.',
      senderName: 'Administrador'
    };

    template.variables.forEach(v => {
      const regex = new RegExp(`{{${v.name}}}`, 'g');
      html = html.replace(regex, sampleData[v.name] || `[${v.name}]`);
    });

    return html;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="border rounded-lg overflow-hidden bg-white">
            <div className="bg-muted px-4 py-2 border-b">
              <p className="text-sm">
                <strong>Assunto:</strong> {template.subject.replace(/{{(\w+)}}/g, (_, name) => {
                  const sampleData: Record<string, string> = {
                    userName: 'João Silva',
                    role: 'Vendedor',
                    title: 'Comunicado Importante'
                  };
                  return sampleData[name] || `[${name}]`;
                })}
              </p>
            </div>
            <div 
              className="p-0"
              dangerouslySetInnerHTML={{ __html: renderPreview() }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
