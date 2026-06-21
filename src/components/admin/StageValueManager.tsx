import { useState, useEffect } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { usePipelineStages } from '@/hooks/useLeads';
import { useStageValues, useUpsertStageValue } from '@/hooks/useStageValues';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Save, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

export function StageValueManager() {
  const { data: products } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const { data: stages } = usePipelineStages(selectedProductId);
  const { data: stageValues } = useStageValues(selectedProductId);
  const upsertStageValue = useUpsertStageValue();

  const [localValues, setLocalValues] = useState<Record<string, { expected_value: number; probability_percent: number }>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Selecionar primeiro produto automaticamente
  useEffect(() => {
    if (products?.length && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Inicializar valores locais quando os dados carregam
  useEffect(() => {
    if (stageValues && stages) {
      const values: Record<string, { expected_value: number; probability_percent: number }> = {};
      stages.forEach(stage => {
        const stageValue = stageValues.find(sv => sv.stage_id === stage.id);
        values[stage.id] = {
          expected_value: stageValue ? Number(stageValue.expected_value) : 0,
          probability_percent: stageValue ? Number(stageValue.probability_percent) : 0
        };
      });
      setLocalValues(values);
      setHasChanges(false);
    }
  }, [stageValues, stages]);

  const handleValueChange = (stageId: string, field: 'expected_value' | 'probability_percent', value: number) => {
    setLocalValues(prev => ({
      ...prev,
      [stageId]: {
        ...prev[stageId],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedProductId) return;

    try {
      for (const [stageId, values] of Object.entries(localValues)) {
        await upsertStageValue.mutateAsync({
          stage_id: stageId,
          product_id: selectedProductId,
          expected_value: values.expected_value,
          probability_percent: values.probability_percent
        });
      }
      toast.success('Valores salvos com sucesso');
      setHasChanges(false);
    } catch (error) {
      toast.error('Erro ao salvar valores');
    }
  };

  const calculateWeightedValue = (expectedValue: number, probability: number, leadsCount: number = 1) => {
    return expectedValue * (probability / 100) * leadsCount;
  };

  const sortedStages = stages?.sort((a, b) => a.order_index - b.order_index).filter(s => !s.is_won && !s.is_lost) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Valores do Pipeline</h2>
          <p className="text-muted-foreground">Configure valores esperados e probabilidades por etapa</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Selecione um produto" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasChanges && (
            <Button onClick={handleSave} disabled={upsertStageValue.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar Alterações
            </Button>
          )}
        </div>
      </div>

      {selectedProductId && sortedStages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Etapas do Pipeline
            </CardTitle>
            <CardDescription>
              Defina o ticket médio esperado e a probabilidade de conversão para cada etapa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead>Valor Esperado (R$)</TableHead>
                  <TableHead>Probabilidade (%)</TableHead>
                  <TableHead>Valor Ponderado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStages.map((stage) => {
                  const values = localValues[stage.id] || { expected_value: 0, probability_percent: 0 };
                  const weightedValue = calculateWeightedValue(values.expected_value, values.probability_percent);
                  
                  return (
                    <TableRow key={stage.id}>
                      <TableCell className="font-medium">{stage.name}</TableCell>
                      <TableCell>
                        <div 
                          className="w-6 h-6 rounded-full" 
                          style={{ backgroundColor: stage.color || '#6B7280' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={values.expected_value}
                          onChange={(e) => handleValueChange(stage.id, 'expected_value', Number(e.target.value))}
                          className="w-32"
                          min={0}
                          step={100}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={values.probability_percent}
                          onChange={(e) => handleValueChange(stage.id, 'probability_percent', Number(e.target.value))}
                          className="w-24"
                          min={0}
                          max={100}
                          step={5}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          R$ {weightedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Total do Pipeline (1 lead por etapa)
                </span>
                <span className="text-lg font-bold">
                  R$ {Object.values(localValues).reduce((sum, v) => 
                    sum + calculateWeightedValue(v.expected_value, v.probability_percent), 0
                  ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {!selectedProductId 
              ? 'Selecione um produto para configurar os valores do pipeline'
              : 'Nenhuma etapa configurada para este produto'
            }
          </CardContent>
        </Card>
      )}
    </div>
  );
}
