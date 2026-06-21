import { Clock, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { usePlatformName } from '@/hooks/usePlatformName';
import { useAuth } from '@/hooks/useAuth';

export function EmptyState() {
  const { platformName } = usePlatformName();
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="relative mb-8">
        <div className="h-24 w-24 rounded-2xl bg-muted/50 flex items-center justify-center p-4">
          <Logo size="lg" showText={false} />
        </div>
        <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background">
          {superAdmin ? (
            <Settings className="h-5 w-5 text-primary" />
          ) : (
            <Clock className="h-5 w-5 text-primary" />
          )}
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-foreground mb-2 text-center">
        {superAdmin ? 'Configure sua plataforma' : `Bem-vindo ao ${platformName}`}
      </h2>

      {superAdmin ? (
        <>
          <p className="text-base text-muted-foreground text-center mb-2">
            Você é o Super Admin desta instalação
          </p>
          <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
            Comece criando uma organização, produtos e usuários no painel
            Super Admin para liberar o sistema.
          </p>
          <Button onClick={() => navigate('/super-admin')} className="gap-2">
            <Settings className="h-4 w-4" />
            Ir ao painel Super Admin
          </Button>
        </>
      ) : (
        <>
          <p className="text-base text-muted-foreground text-center mb-2">
            Você ainda não tem produtos atribuídos
          </p>
          <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
            Aguarde seu gestor liberar acesso aos produtos. Assim que isso acontecer,
            você verá aqui tudo o que precisa para vender.
          </p>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-muted-foreground text-sm">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Aguardando liberação
          </div>
        </>
      )}
    </div>
  );
}
