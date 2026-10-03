import { feedInsight, type FeedInsight } from "./insights";
import { sampleRuns } from "./sample-runs";
import { getSupabase } from "./supabase";
import type { RecentRun } from "./types";

export type TaskFeed = {
  runs: RecentRun[];
  source: "live" | "sample";
  insight: FeedInsight;
};

export async function loadTaskFeed(): Promise<TaskFeed> {
  const supabase = getSupabase();
  if (!supabase) return sampleFeed();

  try {
    const { data, error } = await supabase.rpc("recent_runs", { max_rows: 50 });
    if (error || !Array.isArray(data) || data.length === 0) return sampleFeed();
    const runs = data as RecentRun[];
    return { runs, source: "live", insight: feedInsight(runs) };
  } catch {
    return sampleFeed();
  }
}

function sampleFeed(): TaskFeed {
  return { runs: sampleRuns, source: "sample", insight: feedInsight(sampleRuns) };
}
