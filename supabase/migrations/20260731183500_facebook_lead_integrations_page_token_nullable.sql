-- Page Access Token do Facebook Lead Ads deixou de ser obrigatório:
-- o fluxo de captação de leads via formulário do Facebook não é mais utilizado,
-- e o token não participa do envio/atribuição de eventos Purchase via Meta CAPI
-- (que usa pixel_id/pixel_access_token, colunas já nullable).
ALTER TABLE public.facebook_lead_integrations
ALTER COLUMN page_access_token DROP NOT NULL;
