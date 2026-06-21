import { motion } from 'framer-motion';

interface ChatBannerProps {
  logoUrl?: string | null;
  productName?: string;
  description?: string;
  primaryColor: string;
}

// Helper function to darken a hex/rgb color
function darkenColor(color: string, percent: number): string {
  // Convert hex to RGB if needed
  let r: number, g: number, b: number;
  
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (!match) return color;
    [r, g, b] = match.map(Number);
  } else {
    return color;
  }

  // Darken
  r = Math.max(0, Math.round(r * (1 - percent / 100)));
  g = Math.max(0, Math.round(g * (1 - percent / 100)));
  b = Math.max(0, Math.round(b * (1 - percent / 100)));

  return `rgb(${r}, ${g}, ${b})`;
}

export function ChatBanner({
  logoUrl,
  productName,
  description,
  primaryColor,
}: ChatBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden mb-4"
      style={{ background: 'var(--gradient-primary)' }}
    >
      <div className="p-5 text-center text-white">
        {logoUrl && (
          <motion.img
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            src={logoUrl}
            alt="Logo"
            className="h-12 mx-auto mb-3 object-contain"
          />
        )}
        {productName && (
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg font-bold"
          >
            {productName}
          </motion.h2>
        )}
        {description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm opacity-80 mt-1"
          >
            {description}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
