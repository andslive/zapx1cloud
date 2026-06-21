-- 1. Add icon column to sectors
ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'Building2';

-- 2. Cleanup orphan rows in sector_members before adding FKs
DELETE FROM public.sector_members sm
WHERE NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = sm.sector_id);

DELETE FROM public.sector_members sm
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = sm.user_id);

-- 3. Add foreign keys (idempotent via DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='sector_members'
      AND constraint_name='sector_members_sector_id_fkey'
  ) THEN
    ALTER TABLE public.sector_members
      ADD CONSTRAINT sector_members_sector_id_fkey
      FOREIGN KEY (sector_id) REFERENCES public.sectors(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='sector_members'
      AND constraint_name='sector_members_user_id_fkey'
  ) THEN
    ALTER TABLE public.sector_members
      ADD CONSTRAINT sector_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Unique constraint to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='sector_members'
      AND constraint_name='sector_members_sector_user_unique'
  ) THEN
    ALTER TABLE public.sector_members
      ADD CONSTRAINT sector_members_sector_user_unique UNIQUE (sector_id, user_id);
  END IF;
END $$;