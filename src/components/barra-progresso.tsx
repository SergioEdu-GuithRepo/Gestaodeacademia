"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { SpinnerEditorial } from "./ui";

function ControladorProgresso() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chaveRota = `${pathname}?${searchParams?.toString() ?? ""}`;

  const [ativo, setAtivo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [mostrarPilula, setMostrarPilula] = useState(false);
  const rotaAnterior = useRef(chaveRota);
  const timerPilula = useRef<number | null>(null);
  const timerPassos = useRef<number | null>(null);
  const timerSeguranca = useRef<number | null>(null);

  function limparTimers() {
    if (timerPilula.current) window.clearTimeout(timerPilula.current);
    if (timerPassos.current) window.clearInterval(timerPassos.current);
    if (timerSeguranca.current) window.clearTimeout(timerSeguranca.current);
    timerPilula.current = null;
    timerPassos.current = null;
    timerSeguranca.current = null;
  }

  function iniciar() {
    limparTimers();
    setAtivo(true);
    setProgresso(18);
    timerPilula.current = window.setTimeout(() => {
      setMostrarPilula(true);
    }, 140);
    timerPassos.current = window.setInterval(() => {
      setProgresso((atual) => (atual < 84 ? atual + Math.max(2, (88 - atual) * 0.16) : atual));
    }, 180);
    timerSeguranca.current = window.setTimeout(() => {
      concluir();
    }, 6000);
  }

  function concluir() {
    limparTimers();
    setProgresso(100);
    setMostrarPilula(false);
    window.setTimeout(() => {
      setAtivo(false);
      setProgresso(0);
    }, 240);
  }

  useEffect(() => {
    if (rotaAnterior.current !== chaveRota) {
      rotaAnterior.current = chaveRota;
      concluir();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveRota]);

  useEffect(() => {
    function aoClicar(ev: MouseEvent) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const alvo = (ev.target as HTMLElement | null)?.closest("a");
      if (!alvo) return;
      const href = alvo.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (alvo.target === "_blank" || alvo.hasAttribute("download")) return;

      try {
        const destino = new URL(alvo.href, window.location.href);
        if (destino.origin !== window.location.origin) return;
        const novaChave = `${destino.pathname}?${destino.searchParams.toString()}`;
        if (novaChave === `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`) {
          return;
        }
        iniciar();
      } catch {
        // URL inválida ignorada
      }
    }

    function aoSubmeter() {
      iniciar();
      // Caso a submissão termine sem mudança de rota (ex.: erro de validação ou ação inline), recolhe suavemente
      if (timerSeguranca.current) window.clearTimeout(timerSeguranca.current);
      timerSeguranca.current = window.setTimeout(() => {
        concluir();
      }, 2200);
    }

    document.addEventListener("click", aoClicar, true);
    document.addEventListener("submit", aoSubmeter, true);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("submit", aoSubmeter, true);
      limparTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ativo) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] print:hidden" aria-hidden="true">
      {/* Barra superior contínua de progresso */}
      <div className="h-1 w-full bg-[#1C1D21]/10">
        <div
          style={{ width: `${progresso}%` }}
          className="h-full bg-gradient-to-r from-[#1C1D21] via-[#FBD34D] to-[#FBD34D] shadow-[0_0_12px_rgba(251,211,77,0.85)] transition-[width] duration-200 ease-out"
        />
      </div>

      {/* Pílula flutuante discreta de carregamento */}
      {mostrarPilula && (
        <div className="anim-enter fixed top-3.5 right-4 flex items-center gap-2 rounded-full border border-white/15 bg-[#1C1D21] px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg">
          <SpinnerEditorial cor="ouro" tamanho="sm" />
          <span>A carregar…</span>
        </div>
      )}
    </div>
  );
}

export function BarraProgressoNavegacao() {
  return (
    <Suspense fallback={null}>
      <ControladorProgresso />
    </Suspense>
  );
}
