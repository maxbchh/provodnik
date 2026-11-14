import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://gzkumeqtxlifzsasjppt.supabase.co',
  'sb_publishable_QDDsysuOcVGrJtFR9O77YQ_1LontR9q',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
