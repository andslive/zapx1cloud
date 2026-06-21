import { useState } from 'react';
import { useFormSubmissions, useFormBlocks } from '@/hooks/useForms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Search, Download, Filter, User, Clock, Target, 
  ExternalLink, ChevronLeft, ChevronRight, Inbox
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FormResponseDetail } from './FormResponseDetail';
import { FormSubmission, FormBlock } from '@/types/forms';

interface FormResponsesProps {
  formId: string;
}

export function FormResponses({ formId }: FormResponsesProps) {
  const { data: submissions, isLoading } = useFormSubmissions(formId);
  const { data: blocks } = useFormBlocks(formId);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Find value by mapped field from blocks
  const getValueByMapping = (responses: Record<string, unknown>, mapping: string): string | null => {
    // First check if response has the mapping directly
    if (responses[mapping]) {
      return String(responses[mapping]);
    }
    
    // Then look for a block that maps to this field
    const block = blocks?.find(b => b.maps_to === mapping);
    if (block && responses[block.id]) {
      return String(responses[block.id]);
    }
    
    return null;
  };

  const filteredSubmissions = submissions?.filter(sub => {
    const responses = sub.responses as Record<string, unknown>;
    
    // Get name using mapping or direct keys
    const mappedName = getValueByMapping(responses, 'name') || getValueByMapping(responses, 'full_name');
    const name = (mappedName || String(responses?.name || responses?.nome || '')).toLowerCase();
    
    // Get email using mapping or direct keys
    const mappedEmail = getValueByMapping(responses, 'email');
    const email = (mappedEmail || String(responses?.email || '')).toLowerCase();
    
    const matchesSearch = !searchQuery || 
      name.includes(searchQuery.toLowerCase()) ||
      email.includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const totalPages = Math.ceil(filteredSubmissions.length / perPage);
  const paginatedSubmissions = filteredSubmissions.slice(
    (page - 1) * perPage,
    page * perPage
  );

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completo</Badge>;
      case 'started':
        return <Badge variant="secondary">Em andamento</Badge>;
      case 'abandoned':
        return <Badge variant="destructive">Abandonado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLeadName = (responses: Record<string, unknown>): string => {
    const mappedName = getValueByMapping(responses, 'name') || getValueByMapping(responses, 'full_name');
    if (mappedName) return mappedName;
    return String(responses?.name || responses?.nome || responses?.full_name || 'Anônimo');
  };

  const getLeadContact = (responses: Record<string, unknown>): string => {
    const mappedEmail = getValueByMapping(responses, 'email');
    const mappedPhone = getValueByMapping(responses, 'phone');
    if (mappedEmail) return mappedEmail;
    if (mappedPhone) return mappedPhone;
    return String(responses?.email || responses?.phone || responses?.telefone || '-');
  };

  const handleExport = () => {
    if (!filteredSubmissions.length) return;
    
    const headers = ['Nome', 'Email', 'Score', 'Status', 'Data'];
    const rows = filteredSubmissions.map(sub => {
      const responses = sub.responses as Record<string, unknown>;
      return [
        getLeadName(responses),
        getLeadContact(responses),
        sub.total_score?.toString() || '0',
        sub.status,
        format(new Date(sub.created_at), 'dd/MM/yyyy HH:mm')
      ];
    });
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `respostas-${formId}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Respostas</h2>
          <p className="text-muted-foreground">
            {submissions?.length || 0} {submissions?.length === 1 ? 'resposta' : 'respostas'} recebidas
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!filteredSubmissions.length}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="completed">Completos</SelectItem>
                <SelectItem value="started">Em andamento</SelectItem>
                <SelectItem value="abandoned">Abandonados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {paginatedSubmissions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">Nenhuma resposta ainda</h3>
            <p className="text-muted-foreground">
              Quando alguém preencher o formulário, as respostas aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSubmissions.map((submission) => {
                const responses = submission.responses as Record<string, unknown>;
                return (
                  <TableRow 
                    key={submission.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedSubmission(submission)}
                  >
                    <TableCell>
                      <div className={`w-3 h-3 rounded-full ${getScoreColor(submission.total_score || 0)}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{getLeadName(responses)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getLeadContact(responses)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{submission.total_score || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(submission.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {formatDistanceToNow(new Date(submission.created_at), {
                            addSuffix: true,
                            locale: ptBR
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubmission(submission);
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {(page - 1) * perPage + 1} a {Math.min(page * perPage, filteredSubmissions.length)} de {filteredSubmissions.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Detail Modal */}
      {selectedSubmission && (
        <FormResponseDetail
          submission={selectedSubmission}
          blocks={blocks || []}
          onClose={() => setSelectedSubmission(null)}
        />
      )}
    </div>
  );
}
