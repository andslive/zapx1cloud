import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag, Plus, X, Sparkles } from 'lucide-react';
import {
  useLeadTags,
  useLeadTagsForLead,
  useAssignLeadTag,
  useRemoveLeadTag,
} from '@/hooks/useLeadTags';

interface Props {
  leadId: string;
}

export function LeadTagsBlock({ leadId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: orgTags = [] } = useLeadTags();
  const { data: assignments = [] } = useLeadTagsForLead(leadId);
  const assign = useAssignLeadTag();
  const remove = useRemoveLeadTag();

  const leadTags = assignments.map((a: any) => a.tag).filter(Boolean);
  const available = orgTags.filter((t) => !leadTags.some((lt: any) => lt.id === t.id));

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Etiquetas
        </CardTitle>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1">
              <Plus className="h-3 w-3" />
              Etiqueta
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="max-h-72 overflow-y-auto p-2">
              {available.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  Nenhuma etiqueta disponível
                </p>
              ) : (
                available.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      assign.mutate({ leadId, tagId: t.id });
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    {t.is_automatic && <Sparkles className="h-3 w-3 text-muted-foreground" />}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="pt-0">
        {leadTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma etiqueta aplicada</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {leadTags.map((t: any) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="gap-1 pr-1"
                style={{ backgroundColor: `${t.color}20`, color: t.color, borderColor: `${t.color}40` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
                <button
                  onClick={() => remove.mutate({ leadId, tagId: t.id })}
                  className="ml-1 hover:bg-black/10 rounded p-0.5"
                  aria-label={`Remover ${t.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
