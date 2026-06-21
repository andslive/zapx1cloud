import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useInvitationByToken, useAcceptInvitation } from '@/hooks/useTeamInvitations';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Mail, Shield, UserCog, User, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { translateAuthError } from '@/lib/auth-errors';

const roleLabels = {
  admin: { label: 'Admin', icon: Shield, color: 'text-red-500' },
  manager: { label: 'Gestor', icon: UserCog, color: 'text-violet-500' },
  seller: { label: 'Vendedor', icon: User, color: 'text-blue-500' },
};

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const { data: invitation, isLoading: loadingInvite } = useInvitationByToken(token);
  const acceptInvitation = useAcceptInvitation();
  const { user, isLoading: loadingAuth } = useAuth();
  
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (invitation?.email) {
      setEmail(invitation.email);
    }
  }, [invitation]);

  // If user is already logged in, accept the invitation directly
  useEffect(() => {
    if (user && invitation && !accepted) {
      handleAcceptAsLoggedInUser();
    }
  }, [user, invitation, accepted]);

  const handleAcceptAsLoggedInUser = async () => {
    if (!user || !token) return;
    
    try {
      await acceptInvitation.mutateAsync({ token, userId: user.id });
      setAccepted(true);
      toast.success('Convite aceito com sucesso!');
      setTimeout(() => navigate('/'), 2000);
    } catch (error: any) {
      toast.error(translateAuthError(error?.message) || 'Erro ao aceitar convite');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsCreatingAccount(true);
    
    try {
      // Create account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
      
      if (authError) throw authError;
      if (!authData.user) throw new Error('Não foi possível criar a conta. Tente novamente.');

      // Detecta email já cadastrado: Supabase retorna um user "fake" sem identities
      // quando o email já existe (proteção contra enumeração). Nesse caso o user_id
      // não está em auth.users e o accept_invitation falharia na FK.
      const identities = (authData.user as any).identities;
      if (Array.isArray(identities) && identities.length === 0) {
        toast.error('Este e-mail já possui uma conta. Faça login para aceitar o convite.');
        setTimeout(() => navigate(`/login?redirect=/accept-invite?token=${token}`), 1500);
        return;
      }

      // Accept invitation
      await acceptInvitation.mutateAsync({ 
        token: token!, 
        userId: authData.user.id 
      });
      
      setAccepted(true);
      toast.success('Conta criada e convite aceito!');
      setTimeout(() => navigate('/'), 2000);
    } catch (error: any) {
      toast.error(translateAuthError(error?.message) || 'Erro ao criar conta');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  if (loadingInvite || loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Convite Inválido
            </h2>
            <p className="text-muted-foreground text-center mb-6">
              Este convite não existe, já foi usado ou expirou.
            </p>
            <Button asChild>
              <Link to="/login">Ir para Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Convite Aceito!
            </h2>
            <p className="text-muted-foreground text-center">
              Redirecionando para o dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const RoleIcon = roleLabels[invitation.role as keyof typeof roleLabels]?.icon || User;
  const roleLabel = roleLabels[invitation.role as keyof typeof roleLabels]?.label || 'Membro';
  const roleColor = roleLabels[invitation.role as keyof typeof roleLabels]?.color || 'text-blue-500';

  // If user is logged in, show acceptance screen
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Aceitando convite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle>Você foi convidado!</CardTitle>
          <CardDescription>
            Crie sua conta para ingressar na equipe
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            {(invitation as any).organization && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {(invitation as any).organization.name}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <RoleIcon className={`h-4 w-4 ${roleColor}`} />
              <span className="text-sm">Papel: <strong>{roleLabel}</strong></span>
            </div>
            
            {invitation.squad && (
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline"
                  style={{ 
                    backgroundColor: `${invitation.squad.color}15`,
                    borderColor: `${invitation.squad.color}40`,
                    color: invitation.squad.color
                  }}
                >
                  Squad: {invitation.squad.name}
                </Badge>
              </div>
            )}
          </div>

          {/* Create Account Form */}
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isCreatingAccount}>
              {isCreatingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Conta e Ingressar
            </Button>
          </form>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Fazer login
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
