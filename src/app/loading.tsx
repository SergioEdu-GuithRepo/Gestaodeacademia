import { SpinnerEditorial } from "@/components/ui";

export default function RootLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-[#F5F4EF] px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <div className="anim-enter flex flex-col items-center gap-4 text-center">
        <div className="relative flex size-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#1C1D21]/10" aria-hidden />
          <SpinnerEditorial cor="escuro" tamanho="lg" className="size-16" />
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-extrabold tracking-wider text-[#FBD34D] shadow-sm">
            GA
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight text-[#1C1D21]">A carregar página…</p>
          <p className="text-xs text-zinc-500">A preparar o ambiente da plataforma</p>
        </div>
      </div>
    </div>
  );
}
