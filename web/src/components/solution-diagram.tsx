"use client";

import { UsageChart } from "@/components/usage-chart";
import type { DemoAnswer } from "@/lib/demo-answer";

export function SolutionDiagram({ answer }: { answer: DemoAnswer }) {
  return <UsageChart title="Models" points={answer.models} dollars bare />;
}
