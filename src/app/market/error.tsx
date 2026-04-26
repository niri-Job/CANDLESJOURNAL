"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function MarketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Market page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans
                    flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700
                        flex items-center justify-center text-2xl mx-auto mb-5">
          📡
        </div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-2">
          Market data unavailable
        </h2>
        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
          The economic calendar or news feed couldn&apos;t load.
          This doesn&apos;t affect your journal or trades.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                       text-white font-semibold text-sm transition-all"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-600
                       text-zinc-300 hover:text-zinc-100 font-semibold text-sm transition-all
                       text-center"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
