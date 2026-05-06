"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PlatformNavMobile({
  links,
  signedIn,
  signOutAction,
}: {
  links: { href: string; label: string }[];
  signedIn: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="w-9 h-9 flex flex-col items-center justify-center gap-[5px] text-muted hover:text-foreground"
      >
        <span
          className={`block h-px w-5 bg-current transition-transform ${
            open ? "translate-y-[6px] rotate-45" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-opacity ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-transform ${
            open ? "-translate-y-[6px] -rotate-45" : ""
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 bg-black/10 backdrop-blur-sm z-40"
          />
          <div className="absolute top-14 right-0 left-0 bg-background border-b border-border shadow-sm z-50">
            <div className="max-w-6xl mx-auto flex flex-col py-2 text-sm font-light tracking-wide">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 text-muted hover:text-foreground hover:bg-surface/50"
                >
                  {l.label}
                </Link>
              ))}
              <div className="px-4 py-3 border-t border-border/50">
                {signedIn ? (
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      onClick={() => setOpen(false)}
                      className="text-muted hover:text-foreground"
                    >
                      Sign out
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="text-muted hover:text-foreground"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
