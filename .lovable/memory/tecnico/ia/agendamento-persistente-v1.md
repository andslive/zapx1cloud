---
name: AI Booking Persistence & Anti-Repetition
description: Server-side guards prevent slot loops, hallucinated bookings, redundant questions and phrase repetition
type: feature
---

Para evitar loops e respostas robóticas no fluxo de agendamento da IA, o `webchat-bot` aplica 5 camadas de proteção server-side:

1. **Persistência de slots ofertados**: ao oferecer horários, salva `metadata.scheduling_context.suggestions` na mensagem.
2. **Captura automática de dados**: regex detecta email/telefone/nome em qualquer mensagem do cliente e atualiza `webchat_conversations.visitor_*` + `leads.*` na hora.
3. **Guard em `check_available_slots`**: se já houve `slots_offered` há <60 min, bloqueia nova consulta. Se o cliente confirmou um slot ofertado E há email → faz **redirect determinístico** mutando o toolCall para `schedule_meeting` (re-dispatch via loop `__redirectAttempts`).
4. **Anti-hallucination**: bloqueia respostas com marcadores ("reunião agendada", "confirmação enviada para") quando `schedule_meeting` não rodou. Loga `hallucinated_booking_blocked`.
5. **Filtro de similaridade**: compara nova resposta com últimas 4 mensagens do assistente (substring + token-overlap ≥80%). Se repete, re-chama o modelo pedindo reescrita. Loga `response_repetition_detected`.

Follow-up call dentro de `check_available_slots` usa **prompt enxuto** (sem `emailEnforcementPrompt`, sem regras CTA) para evitar duplicar perguntas após a tool.
