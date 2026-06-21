import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type AppRole = 'admin' | 'manager' | 'seller' | 'super_admin';

export interface UserPermissions {
  view_queue_conversations: boolean;
  view_other_users_conversations: boolean;
  view_other_queues_conversations: boolean;
  allow_close_pending_tickets: boolean;
  view_all_contacts: boolean;
  allow_pipeline: boolean;
  allow_manage_client_portfolio: boolean;
  view_all_kanban_cards: boolean;
  view_all_schedules: boolean;
  allow_dashboard: boolean;
  allow_inbox_panel: boolean;
  allow_groups: boolean;
  allow_connection_actions: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Tables<'profiles'> | null;
  roles: AppRole[];
  permissions: UserPermissions | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSeller: () => boolean;
  isSuperAdmin: () => boolean;
  hasPermission: (key: keyof UserPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Defensive timeout: never let the app hang on auth/profile/role/perm fetches
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[auth] timeout: ${label} (${ms}ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Avoid duplicate fetches for the same user (getSession + onAuthStateChange race)
  const lastFetchedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Hard safety net: never block the UI on auth more than 8s
    const hardTimeout = setTimeout(() => {
      if (mounted && isLoading) {
        console.warn('[auth] hard timeout reached — releasing isLoading');
        setIsLoading(false);
      }
    }, 8000);

    // 1) Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          if (lastFetchedUserRef.current === nextSession.user.id) return;
          lastFetchedUserRef.current = nextSession.user.id;
          // Defer to avoid Supabase deadlock
          setTimeout(() => {
            if (mounted) fetchUserData(nextSession.user.id);
          }, 0);
        } else {
          lastFetchedUserRef.current = null;
          setProfile(null);
          setRoles([]);
          setPermissions(null);
          setIsLoading(false);
        }
      }
    );

    // 2) Restore session from storage
    supabase.auth.getSession()
      .then(({ data: { session: existing } }) => {
        if (!mounted) return;
        setSession(existing);
        setUser(existing?.user ?? null);
        if (existing?.user) {
          if (lastFetchedUserRef.current === existing.user.id) return;
          lastFetchedUserRef.current = existing.user.id;
          fetchUserData(existing.user.id);
        } else {
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[auth] getSession failed:', err?.message || err);
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(hardTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId)
      ]);

      if (!profileRes.error && profileRes.data) {
        setProfile(profileRes.data as any);
      }
      
      if (!rolesRes.error && rolesRes.data) {
        setRoles(rolesRes.data.map((r: any) => r.role as AppRole));
      }

      // Permissions can load in background without blocking the main UI
      supabase
        .from('user_permissions')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .then(res => {
          if (!res.error && res.data) {
            setPermissions(res.data as unknown as UserPermissions);
          }
        });

    } catch (error: any) {
      const detailedError = error instanceof Error ? error : new Error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('[AUTH_PROFILE_LOAD_ERROR]', {
        message: detailedError.message,
        stack: detailedError.stack,
        userId
      });
    } finally {
      setIsLoading(false);
    }

  };

  const tryAutoPromoteSuperAdmin = async () => {
    try {
      await supabase.functions.invoke('auto-promote-super-admin');
    } catch (e) {
      console.warn('[auto-promote] skipped:', e);
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('[AUTH_LOGIN_ATTEMPT]', { email });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      console.log('[AUTH_LOGIN_RESULT]', { 
        success: !error, 
        error: error ? {
          message: error.message,
          name: error.name,
          status: error.status,
          details: JSON.stringify(error, Object.getOwnPropertyNames(error))
        } : null,
        user: data?.user?.id
      });

      if (!error && data?.session) {
        setSession(data.session);
        setUser(data.user);
        tryAutoPromoteSuperAdmin();
      }
      return { error: error as Error | null };
    } catch (err: any) {
      console.error('[AUTH_LOGIN_FATAL_ERROR]', err);
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName }
      }
    });
    if (!error) {
      // fire-and-forget; só promove se houver sessão ativa (auto-confirm)
      tryAutoPromoteSuperAdmin();
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (user?.id) {
      try {
        await supabase
          .from('user_status')
          .update({ status: 'offline', last_status_change: new Date().toISOString() })
          .eq('user_id', user.id);
      } catch (e) {
        console.warn('Failed to set offline status:', e);
      }
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setPermissions(null);
    lastFetchedUserRef.current = null;
  };

  const isAdmin = () => roles.includes('admin') || roles.includes('super_admin');
  const isManager = () =>
    roles.includes('manager') || roles.includes('admin') || roles.includes('super_admin');
  const isSeller = () => roles.includes('seller');
  const isSuperAdmin = () => roles.includes('super_admin');

  const hasPermission = (key: keyof UserPermissions) => {
    if (roles.includes('admin') || roles.includes('super_admin')) return true;
    if (!permissions) return false;
    return !!permissions[key];
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      roles,
      permissions,
      isLoading,
      signIn,
      signUp,
      signOut,
      isAdmin,
      isManager,
      isSeller,
      isSuperAdmin,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
