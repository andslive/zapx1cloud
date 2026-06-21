-- ============================================================
-- 01_extensions_and_types.sql
-- Auto-generated from production database (pg_catalog)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Enum types
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'manager',
  'seller',
  'super_admin'
);
CREATE TYPE public.interaction_channel AS ENUM (
  'whatsapp',
  'email',
  'phone',
  'instagram',
  'telegram',
  'other'
);
CREATE TYPE public.lead_temperature AS ENUM (
  'hot',
  'warm',
  'cold'
);
CREATE TYPE public.notification_type AS ENUM (
  'cadence',
  'urgency',
  'opportunity',
  'audit',
  'system'
);
CREATE TYPE public.product_status AS ENUM (
  'draft',
  'review',
  'published',
  'archived'
);
CREATE TYPE public.sector_rotation_strategy AS ENUM (
  'round_robin',
  'least_busy',
  'random'
);
CREATE TYPE public.support_ticket_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);
CREATE TYPE public.support_ticket_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'closed'
);
CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);
CREATE TYPE public.task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'overdue'
);
CREATE TYPE public.webchat_conversation_status AS ENUM (
  'bot_active',
  'waiting_human',
  'human_active',
  'closed'
);
