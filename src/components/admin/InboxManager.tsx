import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, BarChart3 } from 'lucide-react';
import { WebChatInbox } from './webchat/WebChatInbox';
import { WebChatReportsTab } from './webchat/WebChatReportsTab';

export function InboxManager() {
  const [activeTab, setActiveTab] = useState('inbox');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-1" style={{ fontSize: '2.25rem' }}>Atendimentos</h1>
        <p className="text-sm text-muted-foreground">
          Central de conversas do chat do site
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>Inbox</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Relatórios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          <WebChatInbox />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <WebChatReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
