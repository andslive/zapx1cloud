import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone } from 'lucide-react';
import { WhatsAppInstancesPanel } from './WhatsAppInstancesPanel';

export function WhatsAppConfig() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp</CardTitle>
              <CardDescription>
                Conecte seus aparelhos lendo o QR Code para enviar e receber mensagens
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <WhatsAppInstancesPanel />
        </CardContent>
      </Card>
    </div>
  );
}
