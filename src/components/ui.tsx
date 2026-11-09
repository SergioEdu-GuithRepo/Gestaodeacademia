import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SelectEditorial } from "./select-editorial";

/* Componentes base da interface — estilo editorial orgânico (pílulas, cartões rounded-3xl, micro-interações subtis). */

const VARIANTES = {
  primario:
    "bg-[#1C1D21] text-white hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-zinc-900 shadow-2xs",
  secundario:
    "bg-white text-zinc-800 border border-zinc-200/90 hover:border-zinc-300 hover:bg-[#FAF9F5] hover:-translate-y-0.5 hover:shadow-xs shadow-2xs",
  perigo: "bg-red-600 text-white hover:bg-red-700 hover:-translate-y-0.5 hover:shadow-md",
  fantasma: "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900",
} as const;

type Variante = keyof typeof VARIANTES;

const baseBotao =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 min-h-10 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none cursor-pointer";

function extrairTextoNodo(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(extrairTextoNodo).join("");
  return "";
}

export function SpinnerEditorial({
  cor = "ouro",
  tamanho = "sm",
  className,
}: {
  cor?: "ouro" | "escuro" | "branco";
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = tamanho === "lg" ? "size-7" : tamanho === "md" ? "size-5" : "size-4";
  const traco =
    cor === "ouro"
      ? "text-[#FBD34D]"
      : cor === "branco"
        ? "text-white"
        : "text-[#1C1D21]";
  const trilho =
    cor === "escuro" ? "text-zinc-900/15" : "text-white/25";

  return (
    <svg
      className={cn("spinner-proc shrink-0 animate-spin", dim, className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className={trilho}
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeWidth="2.75"
      />
      <path
        className={traco}
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  variante = "primario",
  carregando,
  className,
  children,
  ...p
}: ComponentProps<"button"> & { variante?: Variante; carregando?: boolean }) {
  const texto = extrairTextoNodo(children);
  const emProcessamento =
    carregando ?? (Boolean(p.disabled) && (texto.includes("…") || texto.includes("...")));

  const corSpinner =
    variante === "primario"
      ? "ouro"
      : variante === "perigo"
        ? "branco"
        : "escuro";

  return (
    <button
      aria-busy={emProcessamento || undefined}
      className={cn(
        baseBotao,
        VARIANTES[variante],
        emProcessamento
          ? "btn-processando disabled:opacity-95 [&>svg:not(.spinner-proc)]:hidden"
          : "disabled:opacity-50",
        className,
      )}
      {...p}
    >
      {emProcessamento && <SpinnerEditorial cor={corSpinner} tamanho="sm" />}
      {children}
    </button>
  );
}

export function LinkButton({
  variante = "primario",
  className,
  ...p
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={cn(baseBotao, VARIANTES[variante], className)} {...p} />;
}

const baseInput =
  "block w-full rounded-2xl border border-zinc-200/90 bg-white px-3.5 min-h-10 text-base sm:text-sm text-zinc-900 shadow-2xs transition-all duration-200 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-200/70 disabled:bg-zinc-100";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(baseInput, className)} {...p} />;
}

export function Select(p: ComponentProps<"select">) {
  return <SelectEditorial {...p} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(baseInput, "py-2.5 min-h-20 rounded-2xl", className)} {...p} />;
}

export function Field({
  label,
  htmlFor,
  erro,
  ajuda,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  erro?: string;
  ajuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-600 transition-colors">
        {label}
      </label>
      {children}
      {ajuda && !erro && <p className="text-xs text-zinc-400">{ajuda}</p>}
      {erro && (
        <p className="anim-enter flex items-center gap-1.5 text-xs font-medium text-[#B42318]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#D92D20]" aria-hidden="true" />
          {erro}
        </p>
      )}
    </div>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "card-editorial rounded-3xl border border-zinc-200/60 bg-white shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] hover:border-zinc-300/80 hover:shadow-[0_10px_28px_-8px_rgba(28,29,33,0.08)]",
        className,
      )}
      {...p}
    />
  );
}

export function CardHeader({ titulo, acoes, descricao }: { titulo: string; acoes?: ReactNode; descricao?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dotted border-zinc-200 px-6 py-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-zinc-500">{descricao}</p>}
      </div>
      {acoes}
    </div>
  );
}

const CORES_BADGE = {
  cinza: { pill: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-400" },
  verde: { pill: "bg-[#E7F4E8] text-[#1E6332]", dot: "bg-[#288042]" },
  vermelho: { pill: "bg-[#FDECEB] text-[#B42318]", dot: "bg-[#D92D20]" },
  amarelo: { pill: "bg-[#FEF3C7] text-[#92400E]", dot: "bg-[#D97706]" },
  azul: { pill: "bg-[#FBD34D]/40 text-zinc-900", dot: "bg-zinc-900" },
} as const;

export function Badge({ cor = "cinza", children }: { cor?: keyof typeof CORES_BADGE; children: ReactNode }) {
  const estilo = CORES_BADGE[cor];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-transform duration-200 hover:scale-[1.02]",
        estilo.pill,
      )}
    >
      <span className={cn("size-1.5 rounded-full", estilo.dot)} aria-hidden />
      {children}
    </span>
  );
}

export function PageHeader({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="anim-enter mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-zinc-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="anim-enter px-6 py-12 text-center text-sm text-zinc-400">{children}</div>;
}

export function Alerta({ tipo = "erro", children }: { tipo?: "erro" | "sucesso" | "aviso"; children: ReactNode }) {
  const estilos = {
    erro: {
      caixa: "border-[#D92D20]/25 bg-white text-[#1C1D21]",
      iconeWrap: "bg-[#FDECEB] text-[#B42318] ring-1 ring-[#D92D20]/20",
      ponto: "bg-[#D92D20]",
      Icone: AlertCircle,
    },
    sucesso: {
      caixa: "border-[#288042]/25 bg-white text-[#1C1D21]",
      iconeWrap: "bg-[#E7F4E8] text-[#1E6332] ring-1 ring-[#288042]/20",
      ponto: "bg-[#288042]",
      Icone: CheckCircle2,
    },
    aviso: {
      caixa: "border-zinc-200/90 bg-[#FAF9F5] text-[#1C1D21]",
      iconeWrap: "bg-[#1C1D21] text-[#FBD34D]",
      ponto: "bg-[#FBD34D]",
      Icone: AlertTriangle,
    },
  } as const;

  const cfg = estilos[tipo];
  const Icone = cfg.Icone;

  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cn(
        "anim-enter flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-xs leading-relaxed shadow-[0_2px_12px_-4px_rgba(28,29,33,0.06)] sm:text-sm",
        cfg.caixa,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl shadow-2xs",
            cfg.iconeWrap,
          )}
          aria-hidden="true"
        >
          <Icone className="size-4" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5 font-medium text-[#1C1D21]">{children}</div>
      </div>
      <span className={cn("mt-2 size-2 shrink-0 rounded-full", cfg.ponto)} aria-hidden="true" />
    </div>
  );
}

/** Tabela estilo diretório (Referência 3): cabeçalho pontilhado, linhas amplas com hover amarelo suave. */
export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="min-w-full border-separate border-spacing-y-1 text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...p }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-dotted border-zinc-300/90 px-2.5 py-2.5 text-left text-xs font-medium text-zinc-400 sm:px-3",
        className,
      )}
      {...p}
    />
  );
}

export function Td({ className, ...p }: ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "px-2.5 py-3 align-middle text-zinc-700 transition-colors duration-150 first:rounded-l-2xl last:rounded-r-2xl sm:px-3",
        className,
      )}
      {...p}
    />
  );
}
