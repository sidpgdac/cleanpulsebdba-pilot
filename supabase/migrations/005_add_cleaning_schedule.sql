-- Add cleaning_schedule to toilets table
ALTER TABLE public.toilets ADD COLUMN IF NOT EXISTS cleaning_schedule jsonb DEFAULT '[]'::jsonb;

-- Example format for the array: '["08:00", "13:00", "17:00", "21:00"]'
