import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros de carregamento de chunk lazy (comum após deploy quando o
 * browser tem hash antigo no cache) e mostra botão para recarregar a página.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[SectionErrorBoundary]', this.props.sectionName, error);
  }

  handleReload = () => {
    // Chunk velho no cache → reload limpo
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = /chunk|loading.*module|dynamically imported/i.test(
        this.state.error?.message || ''
      );
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-2">
            Não foi possível carregar esta seção
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            {isChunkError
              ? 'A versão da aplicação foi atualizada. Recarregue a página para continuar.'
              : 'Ocorreu um erro ao abrir esta seção. Tente recarregar.'}
          </p>
          <Button onClick={this.handleReload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
