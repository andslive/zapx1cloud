import { useState } from 'react';
import { Product } from '@/types/sales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Target, 
  Users, 
  DollarSign, 
  Sparkles,
  Copy,
  Check,
  Clock,
  Star
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface PlaybookViewProps {
  product: Product;
}

export function PlaybookView({ product }: PlaybookViewProps) {
  const [copiedPitch, setCopiedPitch] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pitch');
  const isMobile = useIsMobile();

  const handleCopyPitch = async (pitch: string, type: string) => {
    await navigator.clipboard.writeText(pitch);
    setCopiedPitch(type);
    toast.success('Pitch copiado!');
    setTimeout(() => setCopiedPitch(null), 2000);
  };

  const tabs = [
    { id: 'pitch', label: 'Pitches', icon: Target },
    { id: 'icp', label: 'ICP', icon: Users },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'differentials', label: 'Diferenciais', icon: Sparkles },
  ];

  const pitches = [
    { type: '15s', label: 'Pitch 15 segundos', content: product.pitch15s, icon: Clock },
    { type: '30s', label: 'Pitch 30 segundos', content: product.pitch30s, icon: Clock },
    { type: '2min', label: 'Pitch 2 minutos', content: product.pitch2min, icon: Clock },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>Playbook Comercial</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Tudo que você precisa saber sobre {product.name}
        </p>
      </div>

      {/* Tabs - Horizontal scroll on mobile */}
      <div className={cn(
        "flex gap-2 border-b border-border pb-4",
        isMobile && "overflow-x-auto -mx-4 px-4 scrollbar-hide snap-x snap-mandatory"
      )}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all flex-shrink-0",
                isMobile && "snap-start",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <Icon size={16} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Pitches Tab */}
        {activeTab === 'pitch' && (
          <div className="space-y-4">
            {pitches.map((pitch, index) => (
              <div 
                key={pitch.type}
                className="p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className={cn(
                  "flex items-center justify-between mb-4",
                  isMobile && "flex-col items-start gap-3"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <pitch.icon size={18} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{pitch.label}</h3>
                      <p className="text-xs text-muted-foreground">
                        {pitch.type === '15s' ? 'Elevator pitch' : pitch.type === '30s' ? 'Abordagem inicial' : 'Apresentação completa'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => handleCopyPitch(pitch.content, pitch.type)}
                    className={cn("gap-2", isMobile && "w-full")}
                  >
                    {copiedPitch === pitch.type ? (
                      <>
                        <Check size={14} />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-sm text-foreground leading-relaxed">
                    {pitch.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ICP Tab */}
        {activeTab === 'icp' && (
          <div className="p-6 rounded-xl border border-border bg-card animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center">
                <Users size={24} className="text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Perfil do Cliente Ideal</h3>
                <p className="text-sm text-muted-foreground">Quem compra e por quê</p>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-foreground leading-relaxed">{product.icp}</p>
            </div>
            
            <div className={cn(
              "mt-6 grid gap-4",
              isMobile ? "grid-cols-1" : "grid-cols-2"
            )}>
              <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                <h4 className="font-medium text-success mb-2">✓ Sinais de fit</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Base de clientes ativa</li>
                  <li>• Budget para tecnologia</li>
                  <li>• Problema de retenção</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <h4 className="font-medium text-destructive mb-2">✗ Red flags</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Menos de 1k clientes</li>
                  <li>• Sem time técnico</li>
                  <li>• Apenas preço importa</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && (
          <div className="grid gap-4 animate-fade-in">
            {product.pricing.map((tier, index) => (
              <div 
                key={tier.name}
                className={cn(
                  "p-5 rounded-xl border transition-all",
                  tier.recommended 
                    ? "border-primary bg-primary/5 shadow-glow" 
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                      {tier.recommended && (
                        <Badge className="bg-primary text-primary-foreground">
                          <Star size={12} className="mr-1" /> Recomendado
                        </Badge>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-primary mt-1">{tier.price}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check size={16} className="text-success flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Differentials Tab */}
        {activeTab === 'differentials' && (
          <div className="grid gap-3 animate-fade-in">
            {product.differentials.map((diff, index) => (
              <div 
                key={index}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                  {index + 1}
                </div>
                <p className="text-foreground font-medium">{diff}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
