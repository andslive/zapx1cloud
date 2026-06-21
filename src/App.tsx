import { Component, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SuperAdminRoute } from "@/components/auth/SuperAdminRoute";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { usePlatformBranding } from "@/hooks/usePlatformBranding";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy load all pages for code splitting
const Index = lazyWithRetry(() => import("./pages/Index"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const SuperAdmin = lazyWithRetry(() => import("./pages/SuperAdmin"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const PublicForm = lazyWithRetry(() => import("./pages/PublicForm"));
const PublicChat = lazyWithRetry(() => import("./pages/PublicChat"));
const PublicFunnel = lazyWithRetry(() => import("./pages/PublicFunnel"));
const SalesPage = lazyWithRetry(() => import("./pages/SalesPage"));

const PublicBooking = lazyWithRetry(() => import("./pages/PublicBooking"));
const BookingConfirmation = lazyWithRetry(() => import("./pages/BookingConfirmation"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const HelpCenter = lazyWithRetry(() => import("./pages/HelpCenter"));
const HelpArticle = lazyWithRetry(() => import("./pages/HelpArticle"));
const Updates = lazyWithRetry(() => import("./pages/Updates"));
const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));

// Global loading fallback
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Optimized QueryClient with global cache settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      // 'online' (default) blocks queries while the browser thinks it is offline,
      // which on mobile can leave the UI stuck on a spinner. 'always' lets the
      // query run and surface a real error/empty state instead.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

// Component to apply platform branding
function PlatformBrandingLoader() {
  usePlatformBranding();
  return null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[RouteErrorBoundary]', error);
  }

  handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar a aplicação</h1>
              <p className="text-sm text-muted-foreground">A versão local ficou desatualizada. Recarregue para buscar a versão mais recente.</p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
        <PlatformBrandingLoader />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/aceitar-convite" element={<AcceptInvite />} />
              <Route path="/install" element={<Install />} />
              <Route path="/f/:slug" element={<PublicForm />} />
              <Route path="/c/:slug" element={<PublicChat />} />
              <Route path="/s/:slug" element={<PublicFunnel />} />
              <Route path="/agendar/:userSlug" element={<PublicBooking />} />
              <Route path="/agendar/:userSlug/:eventSlug" element={<PublicBooking />} />
              <Route path="/confirmar/:token" element={<BookingConfirmation />} />
              <Route path="/vendas" element={<SalesPage />} />
              
              <Route path="/reagendar/:token" element={<BookingConfirmation />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              {/* PWA / atalhos antigos podem abrir em /index ou /home — redireciona */}
              <Route path="/index" element={<Navigate to="/" replace />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route 
                path="/ajuda" 
                element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} 
              />
              <Route 
                path="/ajuda/:slug" 
                element={<ProtectedRoute><HelpArticle /></ProtectedRoute>} 
              />
              <Route 
                path="/novidades" 
                element={<ProtectedRoute><Updates /></ProtectedRoute>} 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin-panel" 
                element={<Navigate to="/admin" replace />} 
              />
              <Route 
                path="/perfil" 
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/configuracoes" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/super-admin" 
                element={
                  <SuperAdminRoute>
                    <SuperAdmin />
                  </SuperAdminRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
