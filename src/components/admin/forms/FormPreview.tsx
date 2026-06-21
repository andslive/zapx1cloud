import { Form, FormBlock, getBlockConfig, SelectOption, ScaleOptions } from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronRight, Check } from 'lucide-react';

interface FormPreviewProps {
  form: Form;
  blocks: FormBlock[];
  theme: 'light' | 'dark';
}

export function FormPreview({ form, blocks, theme }: FormPreviewProps) {
  if (blocks.length === 0) {
    return (
      <div className={cn(
        "min-h-[400px] flex items-center justify-center p-8 text-center",
        theme === 'dark' ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-muted-foreground'
      )}>
        <p>Adicione blocos para visualizar o formulário</p>
      </div>
    );
  }

  const renderBlock = (block: FormBlock, index: number) => {
    const config = getBlockConfig(block.block_type);
    
    const blockBg = theme === 'dark' ? 'bg-zinc-900' : 'bg-white';
    const textColor = theme === 'dark' ? 'text-zinc-100' : 'text-foreground';
    const mutedColor = theme === 'dark' ? 'text-zinc-400' : 'text-muted-foreground';
    const inputBg = theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-background border-input';
    
    switch (block.block_type) {
      case 'welcome_screen':
        return (
          <div key={block.id} className={cn("min-h-[300px] flex flex-col items-center justify-center text-center p-8", blockBg)}>
            <h1 className={cn("text-2xl font-bold mb-3", textColor)}>{block.label}</h1>
            {block.description && (
              <p className={cn("text-lg mb-8 max-w-md", mutedColor)}>{block.description}</p>
            )}
            <Button size="lg" className="gap-2">
              Começar <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        );
        
      case 'end_screen':
        return (
          <div key={block.id} className={cn("min-h-[300px] flex flex-col items-center justify-center text-center p-8", blockBg)}>
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h1 className={cn("text-2xl font-bold mb-3", textColor)}>{block.label}</h1>
            {block.description && (
              <p className={cn("text-lg max-w-md", mutedColor)}>{block.description}</p>
            )}
            {block.block_settings?.cta_text && (
              <Button size="lg" className="mt-6">
                {block.block_settings.cta_text as string}
              </Button>
            )}
          </div>
        );
        
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'textarea':
        return (
          <div key={block.id} className={cn("p-8", blockBg)}>
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-2 mb-6">
                <span className={cn("text-sm font-medium", mutedColor)}>{index + 1}</span>
                <div>
                  <h2 className={cn("text-xl font-medium", textColor)}>
                    {block.label}
                    {block.required && <span className="text-red-500 ml-1">*</span>}
                  </h2>
                  {block.description && (
                    <p className={cn("mt-1", mutedColor)}>{block.description}</p>
                  )}
                </div>
              </div>
              
              {block.block_type === 'textarea' ? (
                <textarea 
                  className={cn(
                    "w-full p-3 rounded-lg border text-lg resize-none",
                    inputBg, textColor
                  )}
                  placeholder={block.placeholder || 'Digite aqui...'}
                  rows={4}
                />
              ) : (
                <Input
                  type={block.block_type === 'email' ? 'email' : block.block_type === 'phone' ? 'tel' : block.block_type === 'number' ? 'number' : 'text'}
                  className={cn("h-14 text-lg", inputBg, textColor)}
                  placeholder={block.placeholder || 'Digite aqui...'}
                />
              )}
              
              <div className="flex justify-end mt-4">
                <Button>OK <Check className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          </div>
        );
        
      case 'select':
      case 'multi_select':
        const selectOptions = block.options as SelectOption[];
        return (
          <div key={block.id} className={cn("p-8", blockBg)}>
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-2 mb-6">
                <span className={cn("text-sm font-medium", mutedColor)}>{index + 1}</span>
                <div>
                  <h2 className={cn("text-xl font-medium", textColor)}>
                    {block.label}
                    {block.required && <span className="text-red-500 ml-1">*</span>}
                  </h2>
                  {block.description && (
                    <p className={cn("mt-1", mutedColor)}>{block.description}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                {Array.isArray(selectOptions) && selectOptions.map((option, idx) => (
                  <button
                    key={idx}
                    className={cn(
                      "w-full p-4 rounded-lg border-2 text-left transition-all",
                      "hover:border-primary hover:bg-primary/5",
                      inputBg, textColor
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                        theme === 'dark' ? 'border-zinc-600' : 'border-muted'
                      )}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{option.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 'yes_no':
        return (
          <div key={block.id} className={cn("p-8", blockBg)}>
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-2 mb-6">
                <span className={cn("text-sm font-medium", mutedColor)}>{index + 1}</span>
                <div>
                  <h2 className={cn("text-xl font-medium", textColor)}>
                    {block.label}
                    {block.required && <span className="text-red-500 ml-1">*</span>}
                  </h2>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button className={cn(
                  "flex-1 p-4 rounded-lg border-2 transition-all hover:border-green-500 hover:bg-green-500/10",
                  inputBg, textColor
                )}>
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-6 h-6 rounded-full border-2 border-green-500 flex items-center justify-center text-xs font-medium text-green-500">
                      Y
                    </span>
                    <span>Sim</span>
                  </div>
                </button>
                <button className={cn(
                  "flex-1 p-4 rounded-lg border-2 transition-all hover:border-red-500 hover:bg-red-500/10",
                  inputBg, textColor
                )}>
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-6 h-6 rounded-full border-2 border-red-500 flex items-center justify-center text-xs font-medium text-red-500">
                      N
                    </span>
                    <span>Não</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );
        
      case 'scale':
        const scaleOptions = block.options as ScaleOptions;
        const min = scaleOptions?.min || 1;
        const max = scaleOptions?.max || 10;
        const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        
        return (
          <div key={block.id} className={cn("p-8", blockBg)}>
            <div className="max-w-lg mx-auto">
              <div className="flex items-start gap-2 mb-6">
                <span className={cn("text-sm font-medium", mutedColor)}>{index + 1}</span>
                <div>
                  <h2 className={cn("text-xl font-medium", textColor)}>
                    {block.label}
                    {block.required && <span className="text-red-500 ml-1">*</span>}
                  </h2>
                </div>
              </div>
              
              <div className="flex justify-between gap-1">
                {range.map((num) => (
                  <button
                    key={num}
                    className={cn(
                      "flex-1 aspect-square rounded-lg border-2 flex items-center justify-center font-medium transition-all",
                      "hover:border-primary hover:bg-primary hover:text-primary-foreground",
                      inputBg, textColor
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
              {(scaleOptions?.min_label || scaleOptions?.max_label) && (
                <div className="flex justify-between mt-2">
                  <span className={cn("text-sm", mutedColor)}>{scaleOptions?.min_label}</span>
                  <span className={cn("text-sm", mutedColor)}>{scaleOptions?.max_label}</span>
                </div>
              )}
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  // Only render visible blocks (not logic/hidden)
  const visibleBlocks = blocks.filter(b => 
    !['conditional', 'score', 'tag', 'hidden_field'].includes(b.block_type)
  );

  return (
    <div className={cn(
      "min-h-[400px]",
      theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
    )}>
      {visibleBlocks.map((block, index) => (
        <div key={block.id} className="border-b last:border-b-0">
          {renderBlock(block, index)}
        </div>
      ))}
    </div>
  );
}
