import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { useSuperAdminSetupChecklist } from '@/hooks/useSuperAdminSetupChecklist';

interface Props {
  onNavigate: (section: string) => void;
}

export function SuperAdminSetupChecklist({ onNavigate }: Props) {
  const { items, completed, isLoading, allRequiredDone, markCompleted, isMarking } =
    useSuperAdminSetupChecklist();

  if (isLoading || completed) return null;

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Configuração inicial da plataforma</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Conclua os passos abaixo para deixar sua plataforma pronta para uso.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {doneCount}/{items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-background/60 border border-border/50"
          >
            {item.done ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${item.done ? 'line-through text-muted-foreground' : ''}`}>
                  {item.label}
                </p>
                {!item.required && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    Opcional
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            {!item.done && item.id !== 'password' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (item.navigateTo === 'lovable-email') {
                    window.open(
                      'https://lovable.dev/projects/f6728bcf-44ef-470a-82a0-e0613d40999f?view=cloud&section=email',
                      '_blank'
                    );
                  } else {
                    onNavigate(item.navigateTo);
                  }
                }}
              >
                {item.navigateTo === 'lovable-email' ? 'Configurar' : 'Ir'}{' '}
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button
            onClick={() => markCompleted()}
            disabled={!allRequiredDone || isMarking}
            size="sm"
          >
            {isMarking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Concluir configuração
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
