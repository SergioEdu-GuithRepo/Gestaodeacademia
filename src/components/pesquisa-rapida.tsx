"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Resultado = {
  id: string;
  nome: string;
  whatsapp: string;
  profissao: string | null;
  turmas: string[];
  pagamentos: { divida: string; emDivida: boolean; parcelasEmFalta: number; parcelasEmAtraso: number } | null;
};

/** Pesquisa rápida de formandos por nome ou WhatsApp. Atalho: Ctrl/⌘ + K. */
export function PesquisaRapida() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [aCarregar, setACarregar] = useState(false);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setACarregar(true);
      try {
        const r = await fetch(`/api/pesquisa?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const j = await r.json();
        setResultados(j.resultados ?? []);
        setAtivo(0);
      } catch {
        /* pedido cancelado */
      } finally {
        setACarregar(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function abrir(r: Resultado) {
    setAberto(false);
    setQ("");
    router.push(`/formandos/${r.id}`);
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => Math.min(a + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && resultados[ativo]) {
      e.preventDefault();
      abrir(resultados[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
      inputRef.current?.blur();
    }
  }

  const mostrar = aberto && q.trim().length >= 2;

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-label="Pesquisar formando"
        placeholder="Pesquisar formando, WhatsApp ou parcela…"
        className="min-h-11 w-full rounded-full border border-white/80 bg-white pr-14 pl-10 text-base text-zinc-900 shadow-2xs placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-[#FBD34D]/60 focus:outline-none sm:text-sm"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={teclas}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-400 sm:block">
        ⌘K
      </kbd>

      {mostrar && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute inset-x-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-3xl border border-zinc-200/70 bg-white p-2 shadow-xl"
        >
          {resultados.length === 0 && (
            <li className="px-4 py-5 text-center text-sm text-zinc-400">
              {aCarregar ? "A pesquisar…" : "Nenhum formando encontrado."}
            </li>
          )}
          {resultados.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => abrir(r)}
              onMouseEnter={() => setAtivo(i)}
              className={cn(
                "cursor-pointer rounded-2xl px-3.5 py-2.5 transition-colors",
                i === ativo && "bg-[#FBD34D]/35",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-zinc-900">{r.nome}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {r.whatsapp}
                    {r.profissao ? ` · ${r.profissao}` : ""}
                  </div>
                </div>
                {r.pagamentos && (
                  <div className="shrink-0 text-right text-xs">
                    {r.pagamentos.emDivida ? (
                      <>
                        <div className={cn("font-semibold", r.pagamentos.parcelasEmAtraso > 0 ? "text-red-600" : "text-amber-700")}>
                          {r.pagamentos.divida}
                        </div>
                        <div className="text-zinc-500">
                          {r.pagamentos.parcelasEmFalta} parcela(s) em falta
                          {r.pagamentos.parcelasEmAtraso > 0 && ` · ${r.pagamentos.parcelasEmAtraso} em atraso`}
                        </div>
                      </>
                    ) : (
                      <span className="font-medium text-emerald-700">Em dia</span>
                    )}
                  </div>
                )}
              </div>
              {r.turmas.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.turmas.map((t) => (
                    <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
