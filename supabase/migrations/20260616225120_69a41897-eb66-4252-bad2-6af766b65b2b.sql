UPDATE public.webchat_conversations
SET flow_variables = flow_variables - '__pending_receipt_media'
WHERE flow_variables ? '__pending_receipt_media';