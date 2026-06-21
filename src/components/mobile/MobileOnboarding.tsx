
import { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Users, Bot, Target, Zap, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHaptics } from '@/hooks/useHaptics';

interface MobileOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

const slides = [
  {
    icon: Users,
    title: 'Seus leads, na palma da mão',
    description: 'Gerencie todos os seus contatos de vendas em um único lugar, com kanban visual e atualizações em tempo real.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Bot,
    title: 'IA que vende com você',
    description: 'Copiloto inteligente que sugere respostas, quebra objeções e ajuda você a fechar mais negócios.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Target,
    title: 'Metas em tempo real',
    description: 'Acompanhe seu progresso, compare com a equipe e celebre cada conquista no caminho para o topo.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Zap,
    title: 'Pronto para decolar!',
    description: 'Tudo configurado para você começar a vender mais. Bora bater recordes?',
    color: 'from-primary to-primary/80',
  },
];

export function MobileOnboarding({ onComplete, onSkip }: MobileOnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const haptics = useHaptics();

  const isLastSlide = currentSlide === slides.length - 1;

  const handleNext = () => {
    haptics.light();
    if (isLastSlide) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentSlide(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      haptics.light();
      setDirection(-1);
      setCurrentSlide(prev => prev - 1);
    }
  };

  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x > threshold && currentSlide > 0) {
      handlePrev();
    } else if (info.offset.x < -threshold && currentSlide < slides.length - 1) {
      handleNext();
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const currentSlideData = slides[currentSlide];
  const Icon = currentSlideData.icon;

  return (
    <div className="fixed inset-0 z-[90] bg-background flex flex-col">
      {/* Skip button */}
      <div className="absolute top-4 right-4 z-10 safe-area-top">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onSkip}
          className="text-muted-foreground"
        >
          <X size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="flex flex-col items-center text-center w-full"
          >
            {/* Icon with gradient background */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className={`w-32 h-32 rounded-3xl bg-gradient-to-br ${currentSlideData.color} flex items-center justify-center mb-8 shadow-lg`}
            >
              <Icon size={64} className="text-white" strokeWidth={1.5} />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-2xl font-bold text-foreground mb-4"
            >
              {currentSlideData.title}
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-muted-foreground text-base leading-relaxed max-w-xs"
            >
              {currentSlideData.description}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="px-8 pb-12 safe-area-bottom">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, index) => (
            <motion.button
              key={index}
              onClick={() => {
                haptics.selection();
                setDirection(index > currentSlide ? 1 : -1);
                setCurrentSlide(index);
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'w-8 bg-primary' 
                  : 'w-2 bg-muted-foreground/30'
              }`}
              whileTap={{ scale: 0.9 }}
            />
          ))}
        </div>

        {/* Action button */}
        <Button
          onClick={handleNext}
          className="w-full h-14 text-base font-semibold rounded-2xl gap-2"
          size="lg"
        >
          {isLastSlide ? 'Começar agora' : 'Próximo'}
          <ChevronRight size={20} />
        </Button>
      </div>
    </div>
  );
}
