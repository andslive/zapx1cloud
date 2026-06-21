import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Copy,
  ExternalLink,
  MessageCircle,
  QrCode,
  Loader2,
  Link2,
  Users,
  Download,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const generateBookingSlug = (fullName: string): string =>
  fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface QrModalState {
  open: boolean;
  url: string;
  name: string;
  slug: string;
}

export function TeamBookingLinks() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useTeamMembers(profile?.organization_id);
  const [search, setSearch] = useState('');
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<QrModalState>({
    open: false,
    url: '',
    name: '',
    slug: '',
  });
  const qrRef = useRef<HTMLDivElement>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q),
    );
  }, [members, search]);

  const buildUrl = (slug: string | null | undefined, fallbackId: string) =>
    `${baseUrl}/agendar/${slug || fallbackId}`;

  const handleCopy = async (url: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(label ? `Link de ${label} copiado!` : 'Link copiado!');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const handleCopyAll = async () => {
    if (!filteredMembers.length) return;
    const lines = filteredMembers
      .map((m) => `${m.full_name}: ${buildUrl(m.booking_slug, m.id)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      toast.success(`${filteredMembers.length} links copiados!`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const handleWhatsApp = (url: string, name: string | null) => {
    const text = `Olá! Agende uma reunião com ${name ?? 'nosso time'}: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleGenerateSlug = async (memberId: string, fullName: string | null) => {
    if (!fullName) {
      toast.error('Membro sem nome cadastrado');
      return;
    }
    setGeneratingFor(memberId);
    try {
      const baseSlug = generateBookingSlug(fullName);
      // Verifica unicidade
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('booking_slug', baseSlug)
        .neq('id', memberId)
        .maybeSingle();

      const finalSlug = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

      const { error } = await supabase
        .from('profiles')
        .update({ booking_slug: finalSlug })
        .eq('id', memberId);

      if (error) throw error;

      toast.success(`Link gerado: /agendar/${finalSlug}`);
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    } catch (err: any) {
      toast.error('Erro ao gerar link: ' + (err?.message ?? 'desconhecido'));
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `qrcode-agendamento-${qrModal.slug || 'link'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Links de Agendamento da Equipe
              </CardTitle>
              <CardDescription>
                Copie e envie o link individual de cada vendedor — sem precisar acessar a
                conta dele.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAll}
              disabled={!filteredMembers.length}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar todos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredMembers.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Link2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="font-medium">Nenhum membro encontrado</p>
              <p className="text-sm text-muted-foreground">
                Convide vendedores em Equipe para gerar links de agendamento.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const hasSlug = !!member.booking_slug;
                const url = buildUrl(member.booking_slug, member.id);
                const initials = (member.full_name || member.email || '?')
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                const isGenerating = generatingFor === member.id;

                return (
                  <Card key={member.id} className="border bg-card/50">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        {/* Avatar + identidade */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">
                                {member.full_name || 'Sem nome'}
                              </p>
                              {!hasSlug && (
                                <Badge variant="outline" className="text-xs">
                                  Sem link
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {hasSlug ? url : member.email || 'Sem e-mail'}
                            </p>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                          {!hasSlug ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() =>
                                handleGenerateSlug(member.id, member.full_name)
                              }
                              disabled={isGenerating}
                              className="gap-1.5"
                            >
                              {isGenerating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              Gerar link
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(url, member.full_name || undefined)}
                                className="gap-1.5"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Copiar</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(url, '_blank')}
                                className="gap-1.5"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Abrir</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleWhatsApp(url, member.full_name)}
                                className="gap-1.5 text-green-600 hover:text-green-700"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setQrModal({
                                    open: true,
                                    url,
                                    name: member.full_name || 'vendedor',
                                    slug: member.booking_slug || member.id,
                                  })
                                }
                                className="gap-1.5"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">QR</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal QR */}
      <Dialog
        open={qrModal.open}
        onOpenChange={(open) => setQrModal((s) => ({ ...s, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code — {qrModal.name}</DialogTitle>
            <DialogDescription className="break-all">{qrModal.url}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div ref={qrRef} className="p-4 bg-white rounded-xl shadow-sm border">
              {qrModal.url && (
                <QRCodeSVG value={qrModal.url} size={200} level="H" includeMargin={false} />
              )}
            </div>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => handleCopy(qrModal.url, qrModal.name)}
              >
                <Copy className="h-4 w-4" />
                Copiar link
              </Button>
              <Button className="flex-1 gap-2" onClick={handleDownloadQR}>
                <Download className="h-4 w-4" />
                Baixar PNG
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
