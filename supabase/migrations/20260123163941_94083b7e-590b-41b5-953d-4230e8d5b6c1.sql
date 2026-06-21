-- =============================================
-- SUPER ADMIN PANEL - STEP 1: ADD ENUM VALUE
-- =============================================

-- Add super_admin role to enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';