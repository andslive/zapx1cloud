import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Country {
  code: string;
  country: string;
  flag: string;
}

const COUNTRIES: Country[] = [
  { code: '+55', country: 'BR', flag: '🇧🇷' },
  { code: '+54', country: 'AR', flag: '🇦🇷' },
  { code: '+56', country: 'CL', flag: '🇨🇱' },
  { code: '+57', country: 'CO', flag: '🇨🇴' },
  { code: '+52', country: 'MX', flag: '🇲🇽' },
  { code: '+51', country: 'PE', flag: '🇵🇪' },
  { code: '+598', country: 'UY', flag: '🇺🇾' },
  { code: '+1', country: 'US', flag: '🇺🇸' },
  { code: '+351', country: 'PT', flag: '🇵🇹' },
  { code: '+34', country: 'ES', flag: '🇪🇸' },
];

interface ChatPhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  primaryColor?: string;
  className?: string;
}

export function ChatPhoneInput({
  value,
  onChange,
  onSubmit,
  placeholder = '(11) 99999-9999',
  primaryColor = '#6366f1',
  className,
}: ChatPhoneInputProps) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [open, setOpen] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  const formatPhone = (input: string): string => {
    // Remove non-digits
    const digits = input.replace(/\D/g, '');
    
    // Brazilian format: (XX) XXXXX-XXXX
    if (country.code === '+55') {
      if (digits.length <= 2) return digits;
      if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    }
    
    // Default format
    return digits;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    onChange(`${country.code} ${formatted}`);
  };

  // Extract just the number part without country code
  const displayValue = value.startsWith(country.code) 
    ? value.slice(country.code.length).trim() 
    : value;

  return (
    <div className={cn('flex rounded-full border overflow-hidden bg-background', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors shrink-0"
          >
            <span className="text-lg">{country.flag}</span>
            <span className="text-sm font-medium text-muted-foreground">{country.code}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <div className="max-h-60 overflow-y-auto">
            {COUNTRIES.map((c) => (
              <Button
                key={c.code}
                variant="ghost"
                className="w-full justify-start gap-3 px-3 py-2"
                onClick={() => {
                  setCountry(c);
                  setOpen(false);
                }}
              >
                <span className="text-lg">{c.flag}</span>
                <span className="text-sm">{c.code}</span>
                <span className="text-xs text-muted-foreground">{c.country}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      
      <Input
        type="tel"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none bg-transparent"
      />
      
      <button
        type="button"
        onClick={onSubmit}
        className="px-4 py-2 shrink-0 transition-colors hover:opacity-90"
        style={{ backgroundColor: primaryColor, color: 'white' }}
      >
        →
      </button>
    </div>
  );
}
