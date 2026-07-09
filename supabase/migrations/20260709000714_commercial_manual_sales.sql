-- Dashboard V2: vendas manuais e edições auditáveis, SEM tocar purchase_audit.
-- purchase_audit é log de eventos de webhook/pixel (tem trigger de sincronização
-- e FK única com pixel_event_logs); não deve ser sobrescrito por correções manuais.

create table public.commercial_manual_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_date date not null,
  connection_id uuid references public.evolution_instances(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  lead_phone text,
  customer_name text not null,
  funnel_id uuid references public.capture_funnels(id) on delete set null,
  offer_name text,
  purchase_value numeric(10,2) not null check (purchase_value >= 0),
  currency text not null default 'BRL',
  source_label text,
  notes text,
  source_type text not null default 'manual' check (source_type = 'manual'),
  manual_created_by uuid not null references public.profiles(id),
  manual_created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_commercial_manual_sales_org_date
  on public.commercial_manual_sales (organization_id, sale_date);

create index idx_commercial_manual_sales_connection
  on public.commercial_manual_sales (connection_id);

create index idx_commercial_manual_sales_funnel
  on public.commercial_manual_sales (funnel_id);

alter table public.commercial_manual_sales enable row level security;

create policy "Admins and managers can view manual sales"
  on public.commercial_manual_sales for select
  to authenticated
  using (
    organization_id = public.get_user_organization(auth.uid())
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  );

create policy "Admins and managers can insert manual sales"
  on public.commercial_manual_sales for insert
  to authenticated
  with check (
    organization_id = public.get_user_organization(auth.uid())
    and manual_created_by = auth.uid()
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  );

create policy "Admins and managers can update manual sales"
  on public.commercial_manual_sales for update
  to authenticated
  using (
    organization_id = public.get_user_organization(auth.uid())
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  )
  with check (
    organization_id = public.get_user_organization(auth.uid())
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  );

create trigger trg_touch_commercial_manual_sales
  before update on public.commercial_manual_sales
  for each row execute function public.update_updated_at_column();

-- Trilha de auditoria de edições: aplica tanto a vendas automáticas (purchase_audit,
-- referenciada só por id, sem alterar a linha original) quanto a vendas manuais.
create table public.commercial_sale_edits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_audit_id uuid references public.purchase_audit(id) on delete cascade,
  manual_sale_id uuid references public.commercial_manual_sales(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now(),
  reason text,
  constraint commercial_sale_edits_exactly_one_target
    check (num_nonnulls(purchase_audit_id, manual_sale_id) = 1)
);

create index idx_commercial_sale_edits_purchase_audit
  on public.commercial_sale_edits (purchase_audit_id);

create index idx_commercial_sale_edits_manual_sale
  on public.commercial_sale_edits (manual_sale_id);

alter table public.commercial_sale_edits enable row level security;

create policy "Admins and managers can view sale edits"
  on public.commercial_sale_edits for select
  to authenticated
  using (
    organization_id = public.get_user_organization(auth.uid())
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  );

create policy "Admins and managers can insert sale edits"
  on public.commercial_sale_edits for insert
  to authenticated
  with check (
    organization_id = public.get_user_organization(auth.uid())
    and edited_by = auth.uid()
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'manager'::app_role)
      or public.is_super_admin(auth.uid())
    )
  );
