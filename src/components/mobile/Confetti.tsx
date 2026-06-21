import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  type: 'circle' | 'square' | 'star';
}

interface ConfettiProps {
  isActive: boolean;
  duration?: number;
  pieceCount?: number;
  onComplete?: () => void;
}

const colors = [
  '#14B8A6', // teal
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#10B981', // emerald
  '#3B82F6', // blue
];

export function Confetti({
  isActive,
  duration = 3000,
  pieceCount = 50,
  onComplete,
}: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (isActive) {
      const newPieces: ConfettiPiece[] = [];
      
      for (let i = 0; i < pieceCount; i++) {
        newPieces.push({
          id: i,
          x: Math.random() * 100,
          y: -20 - Math.random() * 20,
          rotation: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 6 + Math.random() * 6,
          type: ['circle', 'square', 'star'][Math.floor(Math.random() * 3)] as 'circle' | 'square' | 'star',
        });
      }
      
      setPieces(newPieces);

      const timer = setTimeout(() => {
        setPieces([]);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setPieces([]);
    }
  }, [isActive, pieceCount, duration, onComplete]);

  return (
    <AnimatePresence>
      {pieces.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {pieces.map((piece) => (
            <motion.div
              key={piece.id}
              className="absolute"
              style={{
                left: `${piece.x}%`,
                top: `${piece.y}%`,
              }}
              initial={{
                y: 0,
                x: 0,
                rotate: 0,
                opacity: 1,
              }}
              animate={{
                y: window.innerHeight + 100,
                x: (Math.random() - 0.5) * 200,
                rotate: piece.rotation + Math.random() * 720,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                ease: [0.25, 0.46, 0.45, 0.94],
                delay: Math.random() * 0.5,
              }}
            >
              {piece.type === 'circle' && (
                <div
                  className="rounded-full"
                  style={{
                    width: piece.size,
                    height: piece.size,
                    backgroundColor: piece.color,
                  }}
                />
              )}
              {piece.type === 'square' && (
                <div
                  className="rounded-sm"
                  style={{
                    width: piece.size,
                    height: piece.size,
                    backgroundColor: piece.color,
                  }}
                />
              )}
              {piece.type === 'star' && (
                <svg
                  width={piece.size}
                  height={piece.size}
                  viewBox="0 0 24 24"
                  fill={piece.color}
                >
                  <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                </svg>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// Celebration stars component
interface CelebrationStarsProps {
  isActive: boolean;
  onComplete?: () => void;
}

export function CelebrationStars({ isActive, onComplete }: CelebrationStarsProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-3xl"
              initial={{ 
                scale: 0, 
                opacity: 0,
                x: 0,
                y: 0,
              }}
              animate={{
                scale: [0, 1.5, 1],
                opacity: [0, 1, 0],
                x: (i - 2) * 60,
                y: Math.sin(i) * 30 - 50,
              }}
              transition={{
                duration: 1,
                delay: i * 0.1,
                ease: "easeOut",
              }}
            >
              ⭐
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Small celebration burst
interface CelebrationBurstProps {
  isActive: boolean;
  position?: { x: number; y: number };
  emoji?: string;
}

export function CelebrationBurst({ isActive, position, emoji = '✨' }: CelebrationBurstProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  if (!show) return null;

  return (
    <motion.div
      className="fixed pointer-events-none z-50 text-2xl"
      style={{
        left: position?.x ?? '50%',
        top: position?.y ?? '50%',
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: [0, 1.5, 2], opacity: [1, 1, 0] }}
      transition={{ duration: 0.6 }}
    >
      {emoji}
    </motion.div>
  );
}
