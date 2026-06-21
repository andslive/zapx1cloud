import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ComingSoonSectionProps {
  title: string;
  description?: string;
}

export function ComingSoonSection({ title, description }: ComingSoonSectionProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <Badge variant="secondary" className="mb-3">Em breve</Badge>
        <h2 className="text-2xl font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {description ?? 'Estamos preparando esta seção. Em breve estará disponível por aqui.'}
        </p>
      </div>
    </div>
  );
}
