export default function RootLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-[#F5F4EF] px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <div className="anim-enter flex flex-col items-center rounded-3xl border border-zinc-200/80 bg-white px-10 py-9 text-center shadow-[0_12px_40px_-12px_rgba(28,29,33,0.08)]">
        <div className="relative flex size-20 items-center justify-center">
          <svg
            className=" absolute inset-0 size-full animate-spin"
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="#1C1D21"
              strokeOpacity="0.08"
              strokeWidth="3"
            />
            <path
              d="M76 40a36 36 0 0 0-36-36"
              stroke="#1C1D21"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M4 40a36 36 0 0 0 10.5 25.5"
              stroke="#FBD34D"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-extrabold tracking-wider text-[#FBD34D] shadow-sm">
            GA
          </div>
        </div>

        <p className="mt-5 text-sm font-semibold tracking-tight text-[#1C1D21]">
          A carregar página…
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          A sincronizar dados em tempo real
        </p>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          <span className="size-1.5 animate-bounce rounded-full bg-[#1C1D21] [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#FBD34D] [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#1C1D21]" />
        </div>
      </div>
    </div>
  );
}
