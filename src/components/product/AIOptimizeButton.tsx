import { useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AIOptimizeButtonProps {
  onOptimize: () => Promise<void>;
  isOptimizing: boolean;
  disabled?: boolean;
  className?: string;
}

export function AIOptimizeButton({ 
  onOptimize, 
  isOptimizing, 
  disabled,
  className 
}: AIOptimizeButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onOptimize}
      disabled={disabled || isOptimizing}
      className={cn(
        'gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50',
        className
      )}
    >
      {isOptimizing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Otimizando...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Otimizar com IA
        </>
      )}
    </Button>
  );
}

interface AIOptimizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  original: string;
  optimized: string;
  improvements?: string[];
  onAccept: () => void;
  onReject: () => void;
  isLoading?: boolean;
}

export function AIOptimizeDialog({
  isOpen,
  onClose,
  original,
  optimized,
  improvements = [],
  onAccept,
  onReject,
  isLoading,
}: AIOptimizeDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Sugestão da IA
          </DialogTitle>
          <DialogDescription>
            Compare a versão original com a otimizada e escolha qual usar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 py-4">
            {/* Original */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Original</h4>
              <div className="p-4 rounded-lg bg-muted/50 border border-border min-h-[150px]">
                <p className="text-sm whitespace-pre-wrap">{original}</p>
              </div>
            </div>

            {/* Optimized */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-primary" />
                Otimizado
              </h4>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 min-h-[150px]">
                <p className="text-sm whitespace-pre-wrap">{optimized}</p>
              </div>
            </div>
          </div>
        )}

        {improvements.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <h4 className="font-medium text-sm">Melhorias aplicadas:</h4>
            <ul className="space-y-1">
              {improvements.map((improvement, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  {improvement}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReject} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            Manter Original
          </Button>
          <Button onClick={onAccept} disabled={isLoading}>
            <Check className="h-4 w-4 mr-2" />
            Usar Otimizado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
