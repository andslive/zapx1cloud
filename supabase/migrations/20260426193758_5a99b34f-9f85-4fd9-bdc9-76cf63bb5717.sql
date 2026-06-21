
-- Adiciona toggles multimodais por agente (default ligado)
ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS enable_audio_transcription BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_image_vision BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.product_agents.enable_audio_transcription IS
  'Quando true, áudios recebidos pelo agente são transcritos automaticamente (Whisper) e tratados como mensagem de texto.';
COMMENT ON COLUMN public.product_agents.enable_image_vision IS
  'Quando true, imagens recebidas pelo agente são analisadas (GPT-4o-mini Vision) e a descrição é tratada como mensagem de texto.';
