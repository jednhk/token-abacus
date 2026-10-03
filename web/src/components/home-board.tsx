"use client";

import { useState } from "react";
import { HomeStudio } from "@/components/home-studio";
import { TaskFeed } from "@/components/task-feed";
import type { InputMode } from "@/lib/content";
import { naturalTasks, promptTasks } from "@/lib/example-tasks";
import { feedInsight } from "@/lib/insights";

export function HomeBoard() {
  const [mode, setMode] = useState<InputMode>("prompt");
  const runs = mode === "prompt" ? promptTasks : naturalTasks;

  return (
    <>
      <HomeStudio mode={mode} onMode={setMode} />
      <TaskFeed
        key={mode}
        feed={{ runs, source: "examples", insight: feedInsight(runs) }}
      />
    </>
  );
}
