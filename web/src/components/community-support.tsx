"use client";

import { useState } from "react";

export function CommunitySupport({ thanked = false }: { thanked?: boolean }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <section id="support" className="px-4 pb-16 sm:px-6" aria-labelledby="support-title">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-3xl border border-neutral-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="support-title" className="text-base font-medium">
              Support the community
            </h2>
            <StripeMark />
          </div>
          <p className="mt-1 max-w-md text-sm leading-6 text-neutral-500">
            {thanked
              ? "Thank you. Stripe received the donation."
              : "A small donation keeps the public task feed going."}
          </p>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setNotice("");
            try {
              const response = await fetch("/api/donate", { method: "POST" });
              const body = (await response.json()) as { url?: string; error?: string };
              if (body.url) {
                window.location.assign(body.url);
                return;
              }
              setNotice(body.error || "Checkout could not be opened.");
            } catch {
              setNotice("Checkout could not be opened.");
            }
            setPending(false);
          }}
        >
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[#635bff] px-4 py-2 text-sm font-medium text-white hover:bg-[#5851ea] disabled:opacity-60"
          >
            {pending ? "Opening checkout…" : "Donate"}
          </button>
        </form>
      </div>
      {notice ? (
        <p className="mx-auto mt-3 max-w-3xl text-sm text-neutral-500" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function StripeMark() {
  return (
    <span className="inline-flex items-center gap-1 text-[#635bff]" aria-label="Stripe">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
        />
      </svg>
      <span className="text-[13px] font-semibold tracking-tight">Stripe</span>
    </span>
  );
}
