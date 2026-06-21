import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'manager' | 'seller';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, roles, isLoading } = useAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {stuck ? 'Demorando mais que o esperado…' : 'Entrando…'}
        </p>
        {stuck && (
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    const hasRole = requiredRole === 'admin'
      ? roles.includes('admin')
      : requiredRole === 'manager'
        ? roles.includes('admin') || roles.includes('manager')
        : roles.includes(requiredRole);

    if (!hasRole) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
