import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { VariablesChips } from './VariablesChips';

interface Props {
  label?: string;
  helperText?: string;
  value: string;
  onChange: (v: string) => void;
  onInsertVariable?: (variable: string) => void;
  showInsertButton?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}

export function MessageTemplateEditor({
  label,
  helperText,
  value,
  onChange,
  showInsertButton = true,
  rows = 8,
  maxLength = 1000,
  placeholder,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (variable: string) => {
    const ta = ref.current;
    if (!ta) {
      onChange((value || '') + variable);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = (value || '').slice(0, start) + variable + (value || '').slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + variable.length;
    });
  };

  return (
    <div className="space-y-2">
      {(label || showInsertButton) && (
        <div className="flex items-center justify-between gap-2">
          {label ? <Label className="text-sm">{label}</Label> : <span />}
          {showInsertButton && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => insertAtCursor('{{nome_lead}}')}
            >
              <Plus className="h-3 w-3 mr-1" />
              Inserir variável
            </Button>
          )}
        </div>
      )}
      <div className="relative">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className="font-mono text-sm resize-y bg-background/50"
        />
        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
          {(value || '').length}/{maxLength}
        </span>
      </div>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      <VariablesChips onInsert={insertAtCursor} />
    </div>
  );
}
