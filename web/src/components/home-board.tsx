"use client";

import { useState } from "react";
import { HomeStudio } from "@/components/home-studio";
import { TaskFeed } from "@/components/task-feed";
import type { InputMode } from "@/lib/content";
import type { TaskFeed as TaskFeedData } from "@/lib/runs";

export function HomeBoard({ feed }: { feed: TaskFeedData }) {
  const [mode, setMode] = useState<InputMode>("prompt");

  return (
    <>
      <HomeStudio mode={mode} onMode={setMode} />
      <TaskFeed feed={feed} />
    </>
  );
}
