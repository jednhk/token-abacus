"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokens } from "@/lib/format";
import type { SolutionPoint } from "@/lib/demo-answer";

const PALETTE = ["#e07a4c", "#111111", "#2f6bff", "#7a3ff2", "#ff8a1e", "#e23b6a", "#2451e6"];

type Row = SolutionPoint & { total: number; fill: string };

export function UsageChart({
  title,
  accent,
  points,
}: {
  title: string;
  accent: string;
  points: SolutionPoint[];
}) {
  const patternId = `lean-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const rows: Row[] = points
    .map((point) => ({
      ...point,
      total: point.input + point.output,
      fill: "",
    }))
    .sort((a, b) => b.total - a.total)
    .map((point, index) => ({
      ...point,
      fill: point.recommended ? `url(#${patternId})` : PALETTE[index % PALETTE.length],
    }));
  const peak = Math.max(...rows.map((row) => row.total), 1);

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-center gap-2 text-lg font-medium tracking-tight">
        <span className="h-4 w-4 rounded-[4px]" style={{ background: accent }} />
        {title}
      </figcaption>
      <p className="mt-1 text-sm text-neutral-400">Average tokens · lower is better</p>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.name}>
            {row.name}: {formatTokens(row.total)} average tokens
            {row.recommended ? ", lean path" : ""}
          </li>
        ))}
      </ul>
      <div className="mt-2 h-[300px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 8 }} barCategoryGap="22%">
            <defs>
              <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="#1f8a42" />
                <rect width="4" height="4" fill="#7dcea0" />
                <rect x="4" y="4" width="4" height="4" fill="#7dcea0" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="#ececec" strokeDasharray="4 4" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={{ fill: "#525252", fontSize: 12 }}
              angle={-32}
              textAnchor="end"
              height={72}
            />
            <YAxis hide domain={[0, peak * 1.15]} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={<ChartTip />}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar dataKey="total" radius={[10, 10, 0, 0]} maxBarSize={72} isAnimationActive>
              {rows.map((row) => (
                <Cell key={row.name} fill={row.fill} />
              ))}
              <LabelList
                dataKey="total"
                content={(props) => (
                  <ValueLabel
                    x={props.x}
                    y={props.y}
                    width={props.width}
                    height={props.height}
                    value={
                      typeof props.value === "number" || typeof props.value === "string"
                        ? props.value
                        : undefined
                    }
                  />
                )}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function ValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}) {
  const barHeight = Number(height);
  const inside = barHeight >= 36;
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={inside ? Number(y) + barHeight / 2 : Number(y) - 8}
      textAnchor="middle"
      dominantBaseline={inside ? "middle" : "auto"}
      fill={inside ? "#ffffff" : "#404040"}
      fontSize={13}
      fontWeight={600}
    >
      {formatTokens(Number(value))}
    </text>
  );
}

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: Row }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] leading-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <p className="font-medium text-neutral-950">
        {row.name}
        {row.recommended ? " · lean path" : ""}
      </p>
      <p className="text-neutral-500">Input {formatTokens(row.input)}</p>
      <p className="text-neutral-500">Output {formatTokens(row.output)}</p>
      <p className="text-neutral-950">Average {formatTokens(row.total)}</p>
    </div>
  );
}
