import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Plus, Users, Package, UsersRound, User, Mail, Loader2, Zap, Send } from 'lucide-react';
import { useAdminNotificationHistory } from '@/hooks/useAdminNotifications';
import { CreateNotificationDialog } from './CreateNotificationDialog';
import { AutoNotificationSettings } from './AutoNotificationSettings';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const scopeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  all: { label: 'Geral', icon: <Users className="h-3 w-3" /> },
  product: { label: 'Produto', icon: <Package className="h-3 w-3" /> },
  squad: { label: 'Squad', icon: <UsersRound className="h-3 w-3" /> },
  custom: { label: 'Individual', icon: <User className="h-3 w-3" /> },
};

const typeColors: Record<string, string> = {
  system: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  urgency: 'bg-red-500/10 text-red-500 border-red-500/20',
  opportunity: 'bg-green-500/10 text-green-500 border-green-500/20',
  cadence: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  audit: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

const typeLabels: Record<string, string> = {
  system: 'Sistema',
  urgency: 'Urgente',
  opportunity: 'Oportunidade',
  cadence: 'Cadência',
  audit: 'Auditoria',
};

export function NotificationManager() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: notifications = [], isLoading } = useAdminNotificationHistory();
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Central de Notificações</h1>
          <p className="text-muted-foreground">
            Envie notificações manuais ou configure alertas automáticos
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Notificação
        </Button>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="manual" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Envio Manual
          </TabsTrigger>
          <TabsTrigger value="automatic" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Automáticas
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="manual" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{notifications.length}</p>
                    <p className="text-sm text-muted-foreground">Total enviadas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-green-500/10">
                    <Users className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {notifications.reduce((acc, n) => acc + n.recipients_count, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Total de destinatários</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <Mail className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {notifications.reduce((acc, n) => acc + n.emails_sent, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Emails enviados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Notificações</CardTitle>
              <CardDescription>
                Últimas 50 notificações enviadas manualmente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Nenhuma notificação enviada ainda</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Enviar primeira notificação
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Escopo</TableHead>
                        <TableHead className="text-center">Destinatários</TableHead>
                        <TableHead className="text-center">Canais</TableHead>
                        <TableHead>Enviado por</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notifications.map((notification) => (
                        <TableRow key={notification.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(notification.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={typeColors[notification.type]}
                            >
                              {typeLabels[notification.type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {notification.title}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {scopeLabels[notification.scope]?.icon}
                              <span className="text-sm">
                                {scopeLabels[notification.scope]?.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {notification.recipients_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {notification.send_app && (
                                <Bell className="h-4 w-4 text-muted-foreground" />
                              )}
                              {notification.send_email && (
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {notification.created_by_profile?.full_name || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="automatic">
          <AutoNotificationSettings />
        </TabsContent>
      </Tabs>
      
      {/* Create Dialog */}
      <CreateNotificationDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
      />
    </div>
  );
}
