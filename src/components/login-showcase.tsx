"use client";

import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Megaphone,
  Smartphone,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type IdentidadeSlide = {
  id: string;
  etiqueta: string;
  titulo: string;
  descricao: string;
  icone: typeof GraduationCap;
};

const IDENTIDADES: IdentidadeSlide[] = [
  {
    id: "pedagogico",
    etiqueta: "Coordenação",
    titulo: "Turmas, salas e qualidade de ensino em sincronia.",
    descricao:
      "Planeamento de sessões sem conflitos de horário, controlo de assiduidade por aula e avaliação multicritério do corpo de formadores.",
    icone: GraduationCap,
  },
  {
    id: "comercial",
    etiqueta: "Comercial",
    titulo: "Da captação de leads à fidelização por pontos.",
    descricao:
      "Páginas públicas de pré-cadastro por centro, campanhas sazonais via WhatsApp e descontos automáticos por indicação de novos formandos.",
    icone: Megaphone,
  },
  {
    id: "financeiro",
    etiqueta: "Tesouraria",
    titulo: "Controlo rigoroso de mensalidades e sobra operacional.",
    descricao:
      "Planos flexíveis em Kwanzas, lembretes automáticos antes e após o vencimento, apuramento de horas de formadores e fecho mensal.",
    icone: Wallet,
  },
  {
    id: "portais",
    etiqueta: "Portais",
    titulo: "Acesso imediato no telemóvel para formadores e formandos.",
    descricao:
      "Links individuais enviados por WhatsApp sem necessidade de palavras-passe: confirmação de aulas lecionadas, horários e extrato de parcelas.",
    icone: Smartphone,
  },
];

export function LoginShowcase() {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const timer = window.setInterval(() => {
      setIndice((atual) => (atual + 1) % IDENTIDADES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [pausado]);

  const atual = IDENTIDADES[indice];

  return (
    <section
      aria-label="Identidade da Plataforma"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="relative flex min-h-[460px] flex-col justify-between overflow-hidden rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-2xl sm:p-9 lg:min-h-full"
    >
      {/* Fotografia editorial de fundo com destaque visual limpo */}
      <Image
        src="/login-editorial.jpg"
        alt="Ambiente de formação profissional em academia"
        fill
        priority
        sizes="(min-width: 1024px) 56vw, 100vw"
        className="pointer-events-none object-cover object-center opacity-75 transition-transform duration-1000 ease-out select-none scale-105"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111215]/95 via-[#1C1D21]/45 to-transparent"
        aria-hidden
      />

      {/* Topo: Pílulas interativas de seleção rápida */}
      <div className="relative z-10 flex flex-wrap items-center justify-end gap-1.5" role="tablist" aria-label="Pilares da plataforma">
        {IDENTIDADES.map((item, i) => {
          const Icone = item.icone;
          const ativo = i === indice;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setIndice(i)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-all duration-200 active:scale-[0.98]",
                ativo
                  ? "bg-[#FBD34D] font-semibold text-[#1C1D21] shadow-sm scale-[1.02]"
                  : "border border-white/15 bg-[#1C1D21]/55 text-zinc-200 backdrop-blur-md hover:bg-[#1C1D21]/80 hover:text-white",
              )}
            >
              <Icone className="size-3.5" aria-hidden />
              <span>{item.etiqueta}</span>
            </button>
          );
        })}
      </div>

      {/* Base: Texto editorial e navegação de slides */}
      <div key={atual.id} className="anim-enter relative z-10 mt-auto pt-12">
        <div className="max-w-xl space-y-3">
          <h2 className="text-2xl leading-tight font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {atual.titulo}
          </h2>
          <p className="text-sm leading-relaxed text-zinc-200 sm:text-base">{atual.descricao}</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/15 pt-4">
          <div className="flex items-center gap-1.5" aria-hidden>
            {IDENTIDADES.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndice(i)}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-all duration-300",
                  i === indice ? "w-7 bg-[#FBD34D]" : "w-2 bg-white/35 hover:bg-white/60",
                )}
                aria-label={`Ir para ${item.etiqueta}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndice((i) => (i - 1 + IDENTIDADES.length) % IDENTIDADES.length)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xs transition-all duration-200 hover:border-[#FBD34D] hover:bg-[#FBD34D] hover:text-[#1C1D21] active:scale-95"
              aria-label="Slide anterior"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setIndice((i) => (i + 1) % IDENTIDADES.length)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-xs transition-all duration-200 hover:border-[#FBD34D] hover:bg-[#FBD34D] hover:text-[#1C1D21] active:scale-95"
              aria-label="Próximo slide"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
