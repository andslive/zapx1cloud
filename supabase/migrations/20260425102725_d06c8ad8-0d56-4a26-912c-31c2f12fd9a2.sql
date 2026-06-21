-- ============================================
-- HELP CENTER + PLATFORM RELEASES
-- ============================================

-- Categorias
CREATE TABLE public.help_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'BookOpen',
  color text DEFAULT 'primary',
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Releases (criada antes de help_articles para FK)
CREATE TABLE public.platform_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text,
  title text NOT NULL,
  summary text,
  release_types text[] NOT NULL DEFAULT '{}',
  content_json jsonb,
  content_html text,
  cover_image_url text,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Artigos
CREATE TABLE public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.help_categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  content_json jsonb,
  content_html text,
  cover_image_url text,
  tags text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  view_count int NOT NULL DEFAULT 0,
  helpful_count int NOT NULL DEFAULT 0,
  not_helpful_count int NOT NULL DEFAULT 0,
  related_release_id uuid REFERENCES public.platform_releases(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Releases lidas por usuário
CREATE TABLE public.platform_release_reads (
  user_id uuid NOT NULL,
  release_id uuid NOT NULL REFERENCES public.platform_releases(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, release_id)
);

-- Feedback de artigos
CREATE TABLE public.help_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, user_id)
);

-- Índices
CREATE INDEX idx_help_articles_category ON public.help_articles(category_id) WHERE is_published = true;
CREATE INDEX idx_help_articles_published ON public.help_articles(is_published, published_at DESC);
CREATE INDEX idx_help_articles_tags ON public.help_articles USING GIN(tags);
CREATE INDEX idx_platform_releases_published ON public.platform_releases(is_published, published_at DESC);
CREATE INDEX idx_platform_release_reads_user ON public.platform_release_reads(user_id);

-- Triggers updated_at
CREATE TRIGGER update_help_categories_updated_at
  BEFORE UPDATE ON public.help_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_releases_updated_at
  BEFORE UPDATE ON public.platform_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_release_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;

-- Categorias: leitura para autenticados, escrita só super_admin
CREATE POLICY "Anyone authenticated can view active help categories"
  ON public.help_categories FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages help categories"
  ON public.help_categories FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Artigos
CREATE POLICY "Anyone authenticated can view published help articles"
  ON public.help_articles FOR SELECT
  TO authenticated
  USING (is_published = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages help articles"
  ON public.help_articles FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Releases
CREATE POLICY "Anyone authenticated can view published releases"
  ON public.platform_releases FOR SELECT
  TO authenticated
  USING (is_published = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages releases"
  ON public.platform_releases FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Reads: cada usuário gerencia o seu
CREATE POLICY "Users view their own release reads"
  ON public.platform_release_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark releases as read"
  ON public.platform_release_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete their own release reads"
  ON public.platform_release_reads FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Feedback
CREATE POLICY "Users view all feedback"
  ON public.help_article_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users create their own feedback"
  ON public.help_article_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own feedback"
  ON public.help_article_feedback FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete their own feedback"
  ON public.help_article_feedback FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Bucket público para mídia da Central de Ajuda
INSERT INTO storage.buckets (id, name, public)
VALUES ('help-media', 'help-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Help media is publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'help-media');

CREATE POLICY "Super admin uploads help media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'help-media' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin updates help media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'help-media' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin deletes help media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'help-media' AND public.is_super_admin(auth.uid()));

-- Seed de categorias iniciais
INSERT INTO public.help_categories (slug, name, description, icon, color, display_order) VALUES
  ('primeiros-passos', 'Primeiros passos', 'Tudo que você precisa para começar a usar a plataforma', 'Rocket', 'primary', 1),
  ('vendas-pipeline', 'Vendas e Pipeline', 'Gestão de leads, kanban, deals e comissões', 'TrendingUp', 'green-500', 2),
  ('atendimento-inbox', 'Atendimento e Inbox', 'WhatsApp, conversas, distribuição e tickets', 'MessageSquare', 'blue-500', 3),
  ('ia-automacao', 'IA e Automação', 'Agentes, copiloto, cadência e automações', 'Sparkles', 'purple-500', 4),
  ('integracoes', 'Integrações', 'Conexões com sistemas externos e webhooks', 'Plug', 'orange-500', 5);