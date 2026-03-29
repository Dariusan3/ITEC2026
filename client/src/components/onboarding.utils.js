const STORAGE_KEY = "itecify_onboarding_done";

export function hasCompletedOnboarding() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export const STEPS = [
  {
    title: "Real-time collaborative editor",
    body: "Every change you make is instantly synced to everyone in the room — no save needed.",
  },
  {
    title: "Run & Preview",
    body: "Run single files (JS, Python, Go…) with the Run button, or launch a full Vite/React dev server with Preview (requires Docker).",
  },
  {
    title: "AI assistant",
    body: "Open the sidebar to explain code, fix errors, generate tests, or build entire file structures with the Build action.",
  },
];
