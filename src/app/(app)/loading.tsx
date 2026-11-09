export default function AppLoading() {
  return (
    <div className="anim-enter space-y-6 py-2" role="status" aria-live="polite">
      {/* Cabeçalho em carregamento com indicador orbital alinhado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-36 animate-pulse rounded-full bg-zinc-200/80" />
          <div className="h-8 w-64 animate-pulse rounded-2xl bg-zinc-300/70" />
        </div>

        <div className="inline-flex items-center gap-3 rounded-full border border-zinc-200/80 bg-white py-2 pr-4 pl-2.5 shadow-2xs">
          <div className="relative flex size-8 shrink-0 items-center justify-center">
            <svg
              className="absolute inset-0 size-full animate-spin"
              viewBox="0 0 36 36"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="18"
                cy="18"
                r="15.5"
                stroke="#1C1D21"
                strokeOpacity="0.1"
                strokeWidth="2.5"
              />
              <path
                d="M33.5 18a15.5 15.5 0 0 0-15.5-15.5"
                stroke="#1C1D21"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="relative z-10 flex size-5 items-center justify-center rounded-full bg-[#1C1D21] text-[9px] font-extrabold text-[#FBD34D]">
              GA
            </span>
          </div>
          <span className="text-xs font-medium text-zinc-600">A atualizar vista…</span>
        </div>
      </div>

      {/* 4 Cartões KPI Esqueleto Editorial */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.04)]"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 animate-pulse rounded-full bg-zinc-200/80" />
              <div className="size-9 animate-pulse rounded-full bg-[#FAF9F5]" />
            </div>
            <div className="mt-4 h-7 w-32 animate-pulse rounded-xl bg-zinc-200/90" />
            <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-[#F5F4EF]" />
          </div>
        ))}
      </div>

      {/* Bloco Principal Esqueleto Editorial */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.04)]">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <div className="space-y-2">
            <div className="h-4 w-48 animate-pulse rounded-full bg-zinc-200/90" />
            <div className="h-3 w-72 animate-pulse rounded-full bg-zinc-100" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-full bg-[#FAF9F5]" />
        </div>
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between rounded-2xl bg-[#FAF9F5] px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 animate-pulse rounded-full bg-zinc-200/70" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-40 animate-pulse rounded-full bg-zinc-200/80" />
                  <div className="h-2.5 w-24 animate-pulse rounded-full bg-zinc-200/50" />
                </div>
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-200/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
