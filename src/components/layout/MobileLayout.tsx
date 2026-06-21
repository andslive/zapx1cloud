import { useState, ReactNode, useEffect } from 'react';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMoreMenu } from './MobileMoreMenu';
import { TaskAlerts } from '@/components/tasks/TaskAlerts';
import { OfflineBanner } from '@/components/mobile/OfflineBanner';

import { SplashScreen } from '@/components/mobile/SplashScreen';
import { MobileOnboarding } from '@/components/mobile/MobileOnboarding';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;

interface MobileLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasProduct: boolean;
  showBack?: boolean;
  onBack?: () => void;
  products?: DBProduct[];
  selectedProduct?: DBProduct | null;
  onSelectProduct?: (product: DBProduct) => void;
}

const ONBOARDING_KEY = 'salesos_onboarding_completed';
const SPLASH_KEY = 'salesos_splash_shown';

export function MobileLayout({
  children,
  title,
  subtitle,
  activeTab,
  onTabChange,
  hasProduct,
  showBack,
  onBack,
  products,
  selectedProduct,
  onSelectProduct,
}: MobileLayoutProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const splashShown = sessionStorage.getItem(SPLASH_KEY);
    const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY);

    if (!splashShown) {
      setShowSplash(true);
      sessionStorage.setItem(SPLASH_KEY, 'true');
    } else if (!onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY);
    if (!onboardingCompleted) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Splash Screen */}
      {showSplash && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <MobileOnboarding 
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Task Alerts */}
      <TaskAlerts />
      
      <MobileHeader 
        title={title} 
        subtitle={subtitle}
        showBack={showBack}
        onBack={onBack}
        products={products}
        selectedProduct={selectedProduct}
        onSelectProduct={onSelectProduct}
      />
      
      <main className="flex-1 overflow-auto pb-20">
        {/* Sem key={activeTab}: trocar de aba não desmonta mais o conteúdo,
            permitindo que o cache de tabs visitadas no Index.tsx funcione. */}
        {children}
      </main>


      <MobileBottomNav 
        activeTab={activeTab}
        onTabChange={onTabChange}
        onMoreClick={() => setMoreMenuOpen(true)}
        hasProduct={hasProduct}
      />

      <MobileMoreMenu
        open={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        hasProduct={hasProduct}
      />
    </div>
  );
}
