import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import logoDark from '@/assets/logo-dark.png';
import logoLight from '@/assets/logo-light.png';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import {
  PLATFORM_BRANDING_QUERY_KEY,
  fetchPlatformBranding,
  readCachedBrandingSync,
} from '@/hooks/usePlatformBranding';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className, showText = true, size = 'md' }: LogoProps) {
  const { resolvedTheme } = useTheme();

  // Mesma query canônica de branding — garante consistência entre Sidebar,
  // Login, Header etc. e captura mudanças feitas no Super Admin.
  const { data: settings } = useQuery({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: fetchPlatformBranding,
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const effective = settings ?? readCachedBrandingSync();

  const logoSrc = useMemo(() => {
    const isDark = resolvedTheme === 'dark' || resolvedTheme === undefined;

    if (effective?.logo_url || effective?.logo_dark_url) {
      if (isDark) {
        return effective.logo_dark_url || effective.logo_url || logoLight;
      }
      return effective.logo_url || effective.logo_dark_url || logoDark;
    }

    return isDark ? logoLight : logoDark;
  }, [resolvedTheme, effective]);

  const sizeClasses = {
    sm: 'h-5',
    md: 'h-6',
    lg: 'h-8',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src={logoSrc}
        alt={effective?.platform_name || 'Plataforma'}
        className={cn(sizeClasses[size], 'w-auto')}
      />
    </div>
  );
}
