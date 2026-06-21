-- Remover FK antiga que aponta para auth.users
ALTER TABLE public.leads
DROP CONSTRAINT leads_assigned_to_fkey;

-- Criar FK nova apontando para profiles
ALTER TABLE public.leads
ADD CONSTRAINT leads_assigned_to_fkey 
FOREIGN KEY (assigned_to) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;