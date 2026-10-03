"use client";

import Link from "next/link";
import { Mascot } from "@/components/mascot";

export function SiteHeader({ signingIn = false }: { signingIn?: boolean }) {
  function start(event: React.MouseEvent<HTMLAnchorElement>) {
    const workspace = document.getElementById("workspace");
    if (!workspace) return;
    event.preventDefault();
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", "/#workspace");
  }

  return (
    <header className="sticky top-0 z-20 bg-white px-3 pt-3 pb-2 sm:px-6 sm:pt-5 sm:pb-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pr-1.5 pl-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:py-2 sm:pr-2 sm:pl-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2"
        >
          <Mascot className="h-8 w-auto sm:h-9" />
          <span className="truncate text-[15px] font-semibold tracking-tight">
            Abacus
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className={`rounded-full px-3 py-2 text-sm font-medium sm:px-4 ${
              signingIn ? "bg-neutral-100" : "hover:bg-neutral-100"
            }`}
            aria-current={signingIn ? "page" : undefined}
          >
            Sign in
          </Link>
          <Link
            href="/#workspace"
            onClick={start}
            className="rounded-full bg-black px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800 sm:px-4"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Get started</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
