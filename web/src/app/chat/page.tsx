import type { Metadata } from "next";
import { ChatWindow } from "@/components/chat-window";

export const metadata: Metadata = {
  title: "Chat — Abacus",
  description: "A cheaper path for this task, with average tokens by model and by setup.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = query.prompt;
  const prompt = (Array.isArray(raw) ? raw[0] : (raw ?? "")).slice(0, 2000);
  return <ChatWindow key={prompt} prompt={prompt} />;
}
