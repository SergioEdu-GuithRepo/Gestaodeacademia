"use client";

import {
  BookOpen,
  CalendarDays,
  Compass,
  DoorOpen,
  ExternalLink,
  Gift,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Plus,
  Settings,
  ShieldUser,
  Smartphone,
  Sparkles,
  UserPlus,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sair } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { PesquisaRapida } from "./pesquisa-rapida";

const ICONES = {
  painel: LayoutGrid,
  inteligencia: Sparkles,
  guia: Compass,
  agenda: CalendarDays,
  turmas: UsersRound,
  formacoes: BookOpen,
  formadores: GraduationCap,
  formandos: UserRound,
  novaMatricula: Plus,
  salas: DoorOpen,
  leads: Megaphone,
  campanhas: Gift,
  financeiro: Wallet,
  portais: Smartphone,
  mensagens: MessageCircle,
  utilizadores: ShieldUser,
  configuracoes: Settings,
} as const;

export type ItemMenu = {
  href: string;
  label: string;
  icone: keyof typeof ICONES;
  grupo?: string;
  destaque?: string;
};

function itemAtivo(pathname: string, href: string) {
  if (href === "/matriculas/nova") return pathname === "/matriculas/nova";
  return pathname === href || pathname.startsWith(href + "/");
}

function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function Shell({
  itens,
  centro,
  slugCentro,
  utilizador,
  perfil,
  podeMatricular,
  podeCriarFormando,
  children,
}: {
  itens: ItemMenu[];
  centro: string;
  slugCentro?: string;
  utilizador: string;
  perfil: string;
  podeMatricular?: boolean;
  podeCriarFormando?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  useEffect(() => setAberto(false), [pathname]);

  const iniciais = iniciaisNome(utilizador);
  const compacto = itens.length > 9;

  const menu = (
    <nav
      className={cn(
        "flex flex-1 flex-col overflow-y-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        compacto ? "gap-0.5 py-1.5" : "gap-1.5 py-3",
      )}
      aria-label="Menu principal"
    >
      {itens.map((item) => {
        const Icone = ICONES[item.icone];
        const ativo = itemAtivo(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "group relative flex items-center justify-between gap-3 rounded-2xl transition-all duration-200 ease-out active:scale-[0.99]",
              compacto ? "min-h-9 px-3.5 py-1.5 text-[13px]" : "min-h-10.5 px-4 py-2 text-sm",
              ativo
                ? "bg-[#FBD34D] font-semibold text-[#1C1D21] shadow-2xs before:absolute before:top-2 before:bottom-2 before:-left-4 before:w-1.5 before:rounded-r-full before:bg-[#1C1D21]"
                : "font-medium text-zinc-600 hover:translate-x-0.5 hover:bg-zinc-100/80 hover:text-zinc-900",
            )}
          >
            <span className="flex items-center gap-3 truncate">
              <Icone
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                  ativo ? "text-[#1C1D21]" : "text-zinc-500 group-hover:text-[#1C1D21]",
                )}
                aria-hidden
              />
              <span className="truncate">{item.label}</span>
            </span>
            {item.destaque && (
              <span className="flex size-5 items-center justify-center rounded-full bg-[#D92D20] text-[10px] font-bold text-white shadow-2xs">
                {item.destaque}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  /* Cartão inferior escuro inspirado na Referência 4 (Art Academy Help Center / User Card) */
  const rodape = (
    <div className={cn("px-4", compacto ? "pt-4 pb-3" : "pt-6 pb-4")}>
      <div
        className={cn(
          "relative rounded-3xl bg-[#1C1D21] px-4 text-center text-white shadow-md transition-transform duration-200 hover:-translate-y-0.5",
          compacto ? "pt-6 pb-3" : "pt-8 pb-4",
        )}
      >
        <div
          className={cn(
            "absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-[#FBD34D] text-xs font-extrabold text-[#1C1D21] ring-4 ring-white transition-transform duration-200 hover:scale-105",
            compacto ? "-top-4 size-8" : "-top-5 size-10",
          )}
        >
          {iniciais}
        </div>
        <div className="truncate text-sm font-semibold text-white">{utilizador}</div>
        <div className="mt-0.5 text-xs text-zinc-400">{perfil}</div>
        <form action={sair} className={cn(compacto ? "mt-2.5" : "mt-3.5")}>
          <button
            type="submit"
            className="inline-flex min-h-8.5 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-[#1C1D21] transition-all duration-200 hover:bg-[#FBD34D] active:scale-[0.98]"
          >
            <LogOut className="size-3.5" aria-hidden /> Terminar sessão
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      {/* Barra lateral esquerda (inspirada na Referência 4 — Art Academy) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-white/95 backdrop-blur lg:flex print:hidden">
        <Link href="/painel" className={cn("group flex items-center gap-3 px-6", compacto ? "h-16" : "h-20")}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-xs font-extrabold tracking-wider text-[#FBD34D] shadow-2xs transition-transform duration-200 group-hover:scale-105">
            GA
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold tracking-tight text-zinc-900 uppercase">{centro}</div>
            <div className="text-[11px] font-medium text-zinc-400">Gestão de Academia</div>
          </div>
        </Link>
        {menu}
        {rodape}
      </aside>

      {/* Gaveta telemóvel */}
      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div
            className="modal-backdrop absolute inset-0 bg-zinc-900/40 backdrop-blur-xs"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <aside className="anim-enter absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex h-18 items-center justify-between px-5">
              <span className="truncate font-bold text-zinc-900">{centro}</span>
              <button
                onClick={() => setAberto(false)}
                className="rounded-full p-2 transition-colors hover:bg-zinc-100"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            {menu}
            {rodape}
          </aside>
        </div>
      )}

      {/* Barra superior limpa com pesquisa em pílula e ícones circulares (Referências 2, 3 e 4) */}
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 px-4 sm:px-8 print:hidden">
        <div className="flex flex-1 items-center gap-3">
          <button
            onClick={() => setAberto(true)}
            className="flex size-10 items-center justify-center rounded-full bg-white text-zinc-800 shadow-2xs transition-transform hover:bg-zinc-50 active:scale-95 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <PesquisaRapida />
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          {podeMatricular && (
            <Link
              href="/matriculas/nova"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-md active:scale-[0.98]"
            >
              <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova Matrícula
            </Link>
          )}
          {podeCriarFormando && (
            <Link
              href="/formandos/novo"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-medium text-zinc-800 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FAF9F5] hover:shadow-xs active:scale-[0.98]"
            >
              <UserPlus className="size-3.5" aria-hidden /> Novo Formando
            </Link>
          )}
          {slugCentro && (
            <Link
              href={`/p/${slugCentro}`}
              target="_blank"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-medium text-zinc-800 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FAF9F5] hover:shadow-xs active:scale-[0.98]"
              title="Ver página pública de pré-cadastro deste centro"
            >
              Catálogo Público <ExternalLink className="size-3.5 text-zinc-400" aria-hidden />
            </Link>
          )}
          <Link
            href="/guia"
            className="flex size-10 items-center justify-center rounded-full bg-white text-zinc-700 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FBD34D] hover:text-[#1C1D21] active:scale-95"
            title="Roteiro de Testes Passo a Passo"
            aria-label="Roteiro de Testes"
          >
            <Compass className="size-4.5" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="anim-enter mx-auto max-w-[1400px] px-4 pb-10 sm:px-8">
        {children}
      </main>
    </div>
  );
}
