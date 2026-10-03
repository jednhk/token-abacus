"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { developerStarters } from "@/lib/content";

export function HomeStudio() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash !== "#workspace") return;
    document.getElementById("workspace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  function openChat(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    router.push(`/chat?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <section
      id="workspace"
      className="scroll-mt-24 px-4 pb-4 sm:px-6"
      aria-labelledby="workspace-title"
    >
      <h2 id="workspace-title" className="sr-only">
        Estimate
      </h2>
      <div className="mx-auto flex max-w-3xl flex-col">
        <form
          className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pr-1.5 pl-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
          onSubmit={(event) => {
            event.preventDefault();
            openChat(draft);
          }}
        >
          <label htmlFor="prompt" className="sr-only">
            Describe what you&apos;re building
          </label>
          <textarea
            id="prompt"
            rows={1}
            value={draft}
            placeholder="Describe what you're building..."
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-neutral-400"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                openChat(draft);
              }
            }}
          />
          <button
            type="button"
            aria-label="Start a voice call"
            aria-pressed={voiceOpen}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
            onClick={() => setVoiceOpen((open) => !open)}
          >
            <MicIcon />
          </button>
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            <ArrowUpIcon />
          </button>
        </form>
        {voiceOpen ? (
          <p className="px-4 pt-3 text-sm text-neutral-500" aria-live="polite">
            Voice calls are coming soon.
          </p>
        ) : null}
        <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
          {developerStarters.map((starter) => (
            <button
              key={starter.id}
              type="button"
              className="rounded-full border border-neutral-200 px-4 py-2 text-left text-sm hover:border-black hover:bg-neutral-50"
              onClick={() => openChat(starter.prompt)}
            >
              {starter.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 11a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V6M12 6l-6 6M12 6l6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
