"use client";

import { useState } from "react";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { benefits } from "@/lib/content";

type AuthMode = "sign-in" | "sign-up";

export function LoginPanel() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const signingIn = mode === "sign-in";

  function continueWithEmail() {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      setNotice("");
      return;
    }
    setError("");
    setNotice(
      signingIn
        ? `Sign-in links for ${value} will send once accounts are connected.`
        : `We'll save ${value} for an account once sign-up is connected.`,
    );
  }

  function continueWith(provider: string) {
    setError("");
    setNotice(
      `${provider} will connect on this screen once accounts are on.`,
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-3xl flex-col items-center justify-center gap-8 px-4 py-10 lg:max-w-4xl lg:flex-row lg:items-center lg:gap-8">
      <div className="w-full max-w-[26rem] shrink-0">
        <div className="rounded-[28px] border border-neutral-200 bg-white px-5 py-8 shadow-[0_16px_50px_rgba(0,0,0,0.05)] sm:px-8">
          <Mascot className="mx-auto h-16 w-auto" />
          <h1 className="mt-4 text-center font-serif text-[2rem] leading-none tracking-tight">
            {signingIn ? "Sign in to Abacus" : "Create your account"}
          </h1>
          <p className="mt-3 text-center text-sm leading-6 text-neutral-500">
            {signingIn
              ? "Welcome back. Pick up your token budget."
              : "Save estimates for the prompts and agents you run."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-neutral-200 text-sm font-medium hover:bg-neutral-50"
              onClick={() => continueWith("GitHub")}
            >
              <GitHubIcon />
              GitHub
            </button>
            <button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-neutral-200 text-sm font-medium hover:bg-neutral-50"
              onClick={() => continueWith("Google")}
            >
              <GoogleIcon />
              Google
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs tracking-wide text-neutral-400 uppercase">
            <span className="h-px flex-1 bg-neutral-200" />
            or
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              continueWithEmail();
            }}
          >
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              value={email}
              className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 px-4 text-base outline-none placeholder:text-neutral-400 focus:border-black"
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
            />
            {error ? (
              <p className="mt-2 text-sm text-neutral-600" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-4 h-12 w-full rounded-full bg-black text-sm font-medium text-white hover:bg-neutral-800"
            >
              {signingIn ? "Continue" : "Create account"}
            </button>
          </form>

          {notice ? (
            <p className="mt-4 text-sm leading-6 text-neutral-600" aria-live="polite">
              {notice}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-neutral-500">
            {signingIn ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-black underline decoration-neutral-300 underline-offset-4"
              onClick={() => {
                setMode(signingIn ? "sign-up" : "sign-in");
                setError("");
                setNotice("");
              }}
            >
              {signingIn ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      <aside className="w-full max-w-sm">
        <div>
          <h2 className="font-serif text-4xl leading-none tracking-tight">
            Keep a token budget
          </h2>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-black" aria-hidden="true" />
            No credit card required
          </p>
          <ul className="mt-8 space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-[15px] leading-6">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-black" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
          <Link
            href="/#workspace"
            className="mt-10 inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Try an estimate
          </Link>
        </div>
      </aside>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 3.87a7.7 7.7 0 0 1 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.98 10.72A5.4 5.4 0 0 1 3.7 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.02-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
