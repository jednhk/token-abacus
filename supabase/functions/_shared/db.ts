import { createClient } from "jsr:@supabase/supabase-js@2";

// Service-role client: bypasses row-level security. Only ever used inside Edge Functions.
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
