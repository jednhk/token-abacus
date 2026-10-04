import { getSupabase } from "@/lib/supabase";

export const revalidate = 10;

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return Response.json({ count: null });
  try {
    const { data, error } = await supabase.rpc("task_count");
    if (error || data === null) return Response.json({ count: null });
    const count = Number(data);
    return Response.json({ count: Number.isFinite(count) ? count : null });
  } catch {
    return Response.json({ count: null });
  }
}
