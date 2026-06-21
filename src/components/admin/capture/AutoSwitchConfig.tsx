import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bot, Plus, Trash2, Sparkles } from 'lucide-react';
import { ProductAgent, AGENT_TYPE_LABELS } from '@/types/agents';
import { AutoSwitchAgentConfig } from '@/types/funnel';

interface AutoSwitchConfigProps {
  agents: ProductAgent[];
  config: AutoSwitchAgentConfig[];
  onUpdate: (config: AutoSwitchAgentConfig[]) => void;
}

export function AutoSwitchConfig({ agents, config, onUpdate }: AutoSwitchConfigProps) {
  const addRule = () => {
    onUpdate([...config, { agent_id: '', trigger_condition: '' }]);
  };

  const updateRule = (index: number, updates: Partial<AutoSwitchAgentConfig>) => {
    const newConfig = [...config];
    newConfig[index] = { ...newConfig[index], ...updates };
    onUpdate(newConfig);
  };

  const removeRule = (index: number) => {
    onUpdate(config.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Configure quando a IA deve trocar automaticamente de agente baseado no contexto da conversa.
      </p>
      
      {config.map((rule, idx) => {
        const selectedAgent = agents.find(a => a.id === rule.agent_id);
        
        return (
          <div key={idx} className="p-3 border rounded-lg space-y-2 bg-muted/30">
            <div className="flex gap-2">
              <Select
                value={rule.agent_id || ''}
                onValueChange={(v) => updateRule(idx, { agent_id: v })}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Trocar para..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-orange-500" />
                        <span>{agent.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {AGENT_TYPE_LABELS[agent.agent_type]}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeRule(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            <Input
              value={rule.trigger_condition}
              onChange={(e) => updateRule(idx, { trigger_condition: e.target.value })}
              placeholder="Quando: Lead demonstra interesse alto de compra"
            />
            
            {selectedAgent && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-orange-500" />
                <span>
                  Objetivo: {selectedAgent.primary_objective?.substring(0, 50)}...
                </span>
              </div>
            )}
          </div>
        );
      })}
      
      <Button variant="outline" size="sm" onClick={addRule} className="w-full">
        <Plus className="h-3 w-3 mr-1" />
        Adicionar Regra de Troca
      </Button>
      
      {config.length > 0 && (
        <div className="p-2 rounded bg-orange-500/10 border border-orange-500/30">
          <p className="text-xs text-orange-600">
            💡 A IA analisará a conversa e decidirá quando trocar de agente baseado nas condições configuradas.
          </p>
        </div>
      )}
    </div>
  );
}
