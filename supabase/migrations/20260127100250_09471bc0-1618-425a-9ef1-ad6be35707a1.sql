-- Permitir acesso público a perfis com booking_slug configurado
-- Apenas para leitura de dados necessários para agendamento
CREATE POLICY "Public can view booking profiles"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    booking_slug IS NOT NULL 
    AND booking_slug != ''
  );