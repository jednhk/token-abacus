import { redirect } from "next/navigation";

export default async function PathPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = query.prompt;
  const prompt = (Array.isArray(raw) ? raw[0] : (raw ?? "")).slice(0, 2000);
  redirect(prompt ? `/chat?prompt=${encodeURIComponent(prompt)}` : "/chat");
}
