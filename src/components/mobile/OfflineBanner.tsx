
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Show "back online" briefly
      setTimeout(() => setShowBanner(false), 2000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className="fixed top-0 left-0 right-0 z-[60] safe-area-top"
        >
          <div className={`mx-4 mt-2 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg ${
            isOnline 
              ? 'bg-green-500/90 backdrop-blur-sm' 
              : 'bg-orange-500/90 backdrop-blur-sm'
          }`}>
            {isOnline ? (
              <>
                <RefreshCw size={18} className="text-white" />
                <span className="text-sm font-medium text-white flex-1">
                  Conexão restaurada!
                </span>
              </>
            ) : (
              <>
                <WifiOff size={18} className="text-white" />
                <span className="text-sm font-medium text-white flex-1">
                  Você está offline
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRetry}
                  className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
                >
                  Tentar
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
