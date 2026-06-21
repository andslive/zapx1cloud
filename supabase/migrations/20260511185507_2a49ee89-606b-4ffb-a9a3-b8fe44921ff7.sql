-- Merge duplicate WhatsApp conversation caused by BR mobile-9 mismatch.
-- Source (Sônia/duplicate, has instance + inbound msgs): e5d68985-fa5e-40f2-b1d1-4f5e4e8e6129
-- Target (Maria/original outbound, no instance):        e5fe4f36-2418-4df6-9485-24f1127e9366

-- 1) Move inbound messages from duplicate into Maria's conversation
UPDATE public.webchat_messages
   SET conversation_id = 'e5fe4f36-2418-4df6-9485-24f1127e9366'
 WHERE conversation_id = 'e5d68985-fa5e-40f2-b1d1-4f5e4e8e6129';

-- 2) Attach the Evolution instance to Maria's conversation and canonicalize phone
UPDATE public.webchat_conversations
   SET evolution_instance_id = '4a1049d3-6720-4229-9146-68673b112311',
       visitor_phone = '5534998773972',
       last_message_at = now(),
       updated_at = now()
 WHERE id = 'e5fe4f36-2418-4df6-9485-24f1127e9366';

-- 3) Close the duplicate conversation
UPDATE public.webchat_conversations
   SET status = 'closed',
       closed_at = now(),
       updated_at = now()
 WHERE id = 'e5d68985-fa5e-40f2-b1d1-4f5e4e8e6129';