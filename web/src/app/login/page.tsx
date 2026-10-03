import type { Metadata } from "next";
import { LoginPanel } from "@/components/login-panel";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Sign in — Abacus",
  description: "Sign in to save token estimates for your prompts and agents.",
};

export default function LoginPage() {
  return (
    <div className="dot-grid min-h-full">
      <SiteHeader signingIn />
      <main>
        <LoginPanel />
      </main>
      <footer className="px-4 pb-8 text-center text-xs leading-5 text-neutral-400">
        By continuing, you agree to our terms and privacy policy.
      </footer>
    </div>
  );
}
