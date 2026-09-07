import type { ErrorComponentProps } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "Something at the table slipped. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-pine-950 px-6 text-center">
      <p className="font-code text-[10px] tracking-[0.26em] text-brass-500">FOLIO</p>
      <h1 className="font-display text-3xl font-semibold text-paper-100">The page would not turn.</h1>
      <p className="max-w-md text-sm leading-relaxed text-mist-400">{errorMessage(error)}</p>
    </main>
  );
}
