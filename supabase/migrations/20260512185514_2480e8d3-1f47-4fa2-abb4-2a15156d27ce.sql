
UPDATE public.product_agents
SET humanization = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(humanization, '{}'::jsonb),
        '{timing,first_reply_min_s}',
        to_jsonb(LEAST(12, GREATEST(1, COALESCE((humanization->'timing'->>'first_reply_min_s')::int, 4))))
      ),
      '{timing,first_reply_max_s}',
      to_jsonb(LEAST(15, GREATEST(2, COALESCE((humanization->'timing'->>'first_reply_max_s')::int, 12))))
    ),
    '{timing,between_bubbles_min_s}',
    to_jsonb(LEAST(4, GREATEST(1, COALESCE((humanization->'timing'->>'between_bubbles_min_s')::int, 1))))
  ),
  '{timing,between_bubbles_max_s}',
  to_jsonb(LEAST(6, GREATEST(1, COALESCE((humanization->'timing'->>'between_bubbles_max_s')::int, 4))))
)
WHERE humanization IS NOT NULL
  AND humanization ? 'timing';
