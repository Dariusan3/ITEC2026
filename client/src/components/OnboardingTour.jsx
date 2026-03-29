import { useState } from "react";

const STORAGE_KEY = "itecify:onboarding-v1-done";

const STEPS = [
  {
    title: "1. Fișiere",
    body: "Creează sau deschide fișiere din arborele din stânga. Cameră goală pornește cu un proiect Vite + React (preset implicit).",
  },
  {
    title: "2. Preview",
    body: "Butonul Preview (Docker) pornește Vite în container. Cu sincronizarea automată, modificările ajung la HMR fără click repetat.",
  },
  {
    title: "3. Invită",
    body: "Share copiază linkul camerei; colaboratorii văd cursorii în timp real. Încearcă și linkul read-only din meniu.",
  },
];

export function hasCompletedOnboarding() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Tur scurt prima vizită (3 pași).
 */
export default function OnboardingTour({ onDismiss }) {
  const [step, setStep] = useState(0);

  const s = STEPS[step];
  if (!s) return null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center pb-8 px-4 sm:items-center sm:pb-0"
      style={{ background: "rgba(5, 8, 6, 0.55)" }}
    >
      <div
        className="soft-card max-w-md rounded-none border p-6 shadow-[0_24px_48px_rgba(0,0,0,0.35)]"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
          Bun venit
        </p>
        <h2 className="mt-1 text-lg font-semibold">{s.title}</h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {s.body}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-none border px-4 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
                background: "transparent",
              }}
              onClick={() => {
                markOnboardingDone();
                onDismiss();
              }}
            >
              Omite
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="rounded-none px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg-primary)",
                  border: "1px solid var(--accent)",
                }}
                onClick={() => setStep((n) => n + 1)}
              >
                Înainte
              </button>
            ) : (
              <button
                type="button"
                className="rounded-none px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg-primary)",
                  border: "1px solid var(--accent)",
                }}
                onClick={() => {
                  markOnboardingDone();
                  onDismiss();
                }}
              >
                Gata
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
