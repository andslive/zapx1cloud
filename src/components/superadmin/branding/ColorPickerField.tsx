import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  defaultValue?: string;
}

export function ColorPickerField({
  label,
  value,
  onChange,
  description,
  defaultValue,
}: ColorPickerFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-10 rounded cursor-pointer border-0 bg-transparent"
          aria-label={`${label} color picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 font-mono text-sm"
          maxLength={7}
        />
        {defaultValue && value !== defaultValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(defaultValue)}
            title="Restaurar padrão"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
