import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  iconOnly?: boolean;
}

export function CaktoLogo({ className, iconOnly = false }: Props) {
  const src = iconOnly ? '/integrations/cakto-icon.svg' : '/integrations/cakto-logo.svg';
  return (
    <img
      src={src}
      alt="Cakto"
      className={cn(iconOnly ? 'h-8 w-8' : 'h-8', className)}
    />
  );
}
