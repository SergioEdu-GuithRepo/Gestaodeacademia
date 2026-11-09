import { ArrowUpRight, Globe, Search } from "lucide-react";
import Link from "next/link";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { BotoesPortal } from "./botoes-portal";

export const metadata = { title: "Portal" };

type Props = {
  searchParams: Promise<{ q?: string; tipo?: string }>;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "A";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function PortaisHubPage({ searchParams }: Props) {
  const { user, db } = await exigir("painel:ver");
  const { q = "", tipo = "todos" } = await searchParams;
  const termo = q.trim();

  const verFormadores = pode(user.perfil, "formadores:ver");
  const verFormandos = pode(user.perfil, "formandos:ver");
  const verCatalogoPublico = pode(user.perfil, "leads:ver");

  const [formadores, formandos] = await Promise.all([
    verFormadores
      ? db.formador.findMany({
          where: termo
            ? {
                OR: [
                  { nome: { contains: termo, mode: "insensitive" } },
                  { email: { contains: termo, mode: "insensitive" } },
                  { telefone: { contains: termo, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: { nome: "asc" },
          include: {
            sessoes: {
              select: { estado: true },
            },
          },
        })
      : Promise.resolve([]),
    verFormandos
      ? db.formando.findMany({
          where: termo
            ? {
                OR: [
                  { nome: { contains: termo, mode: "insensitive" } },
                  { whatsapp: { contains: termo, mode: "insensitive" } },
                  { email: { contains: termo, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: { nome: "asc" },
          include: {
            _count: { select: { matriculas: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const mostrarFormadores = verFormadores && (tipo === "todos" || tipo === "formadores" || !verFormandos);
  const mostrarFormandos = verFormandos && (tipo === "todos" || tipo === "formandos" || !verFormadores);

  const totalPessoas = formadores.length + formandos.length || 1;
  const pctFormadores = verFormadores && verFormandos ? Math.max(22, Math.round((formadores.length / totalPessoas) * 100)) : 50;
  const pctFormandos = 100 - pctFormadores;

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Fichas e Acessos Externos
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">Portal</h1>
        </div>
        {verCatalogoPublico && (
          <Link
            href={`/p/${user.tenant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Globe className="size-3.5 text-zinc-500" aria-hidden />
            Catálogo Público (/p/{user.tenant.slug}) ↗
          </Link>
        )}
      </div>

      {/* Barra Resumo + Pesquisa Pílula (Referência 3) */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {verFormadores && (
              <div>
                <span className="text-3xl font-light tracking-tight text-[#1C1D21]">{formadores.length}</span>
                <span className="ml-1.5 text-xs font-medium text-zinc-500">formadores</span>
              </div>
            )}
            {verFormadores && verFormandos && <span className="text-2xl font-light text-zinc-300">/</span>}
            {verFormandos && (
              <div>
                <span className="text-3xl font-light tracking-tight text-[#1C1D21]">{formandos.length}</span>
                <span className="ml-1.5 text-xs font-medium text-zinc-500">formandos</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {verFormadores && verFormandos && (
              <div className="inline-flex items-center rounded-full bg-[#F5F4EF] p-1">
                <Link
                  href={`/portais?tipo=todos${termo ? `&q=${encodeURIComponent(termo)}` : ""}`}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    tipo === "todos"
                      ? "bg-[#1C1D21] text-white shadow-2xs"
                      : "text-zinc-600 hover:text-[#1C1D21]",
                  )}
                >
                  Todos ({formadores.length + formandos.length})
                </Link>
                <Link
                  href={`/portais?tipo=formadores${termo ? `&q=${encodeURIComponent(termo)}` : ""}`}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    tipo === "formadores"
                      ? "bg-[#1C1D21] text-white shadow-2xs"
                      : "text-zinc-600 hover:text-[#1C1D21]",
                  )}
                >
                  Formadores ({formadores.length})
                </Link>
                <Link
                  href={`/portais?tipo=formandos${termo ? `&q=${encodeURIComponent(termo)}` : ""}`}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    tipo === "formandos"
                      ? "bg-[#1C1D21] text-white shadow-2xs"
                      : "text-zinc-600 hover:text-[#1C1D21]",
                  )}
                >
                  Formandos ({formandos.length})
                </Link>
              </div>
            )}

            <form method="GET" className="flex items-center gap-1.5">
              <input type="hidden" name="tipo" value={tipo} />
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Pesquisar por nome ou WhatsApp…"
                  className="h-10 w-64 rounded-full border border-zinc-200/90 bg-[#FAF9F5] pr-4 pl-9 text-xs text-[#1C1D21] placeholder:text-zinc-400 focus:border-[#1C1D21] focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-zinc-800"
              >
                Procurar
              </button>
              {termo && (
                <Link
                  href={`/portais?tipo=${tipo}`}
                  className="inline-flex h-10 items-center rounded-full px-3 text-xs text-zinc-500 hover:text-[#1C1D21]"
                >
                  Limpar
                </Link>
              )}
            </form>
          </div>
        </div>

        {/* Barras Proporcionais em Pílula (quando ambos visíveis) */}
        {verFormadores && verFormandos && (
          <div className="mt-5 flex h-9 w-full items-stretch gap-2 overflow-hidden">
            <div
              style={{ width: `${pctFormadores}%` }}
              className="flex min-w-28 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white"
            >
              <span>Formadores ({formadores.length})</span>
              <span className="text-[10px] text-zinc-400">Honorários & Aulas</span>
            </div>
            <div
              style={{ width: `${pctFormandos}%` }}
              className="flex min-w-28 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21]"
            >
              <span>Formandos ({formandos.length})</span>
              <span className="text-[10px] opacity-75">Parcelas & Recibos</span>
            </div>
          </div>
        )}
      </div>

      {/* Secção 1: Formadores (10 em 10) */}
      {mostrarFormadores && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base font-semibold text-[#1C1D21]">Formadores ({formadores.length})</h2>
              <p className="text-xs text-zinc-500">
                Consulte a ficha interna de horas e honorários ou partilhe o portal pessoal do formador.
              </p>
            </div>
          </div>

          {formadores.length === 0 ? (
            <Card className="p-6">
              <Vazio>Nenhum formador encontrado.</Vazio>
            </Card>
          ) : (
            <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {formadores.map((f, idx) => {
                const totalSessoes = f.sessoes.length;
                const realizadas = f.sessoes.filter((s) => s.estado === "REALIZADA").length;
                const pctRealizadas = totalSessoes > 0 ? Math.round((realizadas / totalSessoes) * 100) : 0;

                return (
                  <div
                    key={f.id}
                    className="flex flex-col justify-between rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:border-zinc-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              idx % 2 === 0 ? "bg-[#1C1D21] text-[#FBD34D]" : "bg-[#FBD34D] text-[#1C1D21]",
                            )}
                          >
                            {iniciais(f.nome)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/formadores/${f.id}`}
                              className="block truncate font-semibold text-[#1C1D21] hover:underline"
                            >
                              {f.nome}
                            </Link>
                            <div className="truncate text-xs text-zinc-500">
                              {f.telefone || f.email || "Sem contacto"}
                            </div>
                          </div>
                        </div>
                        {f.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge cor="cinza">Inativo</Badge>}
                      </div>

                      <div className="mt-4 rounded-2xl bg-[#FAF9F5] p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">
                            Aulas: <strong className="text-[#1C1D21]">{realizadas}/{totalSessoes}</strong>
                          </span>
                          <span className="text-zinc-500">
                            Hora:{" "}
                            <strong className="text-[#1C1D21]">
                              {f.precoHoraTecnica
                                ? formatKz(f.precoHoraTecnica)
                                : f.precoHoraComportamental
                                  ? formatKz(f.precoHoraComportamental)
                                  : "—"}
                            </strong>
                          </span>
                        </div>
                        <div className="mt-2 flex h-2 w-full gap-1 overflow-hidden rounded-full bg-[#ECEAE2]">
                          {pctRealizadas > 0 && (
                            <div
                              className="h-full rounded-full bg-[#FBD34D]"
                              style={{ width: `${pctRealizadas}%` }}
                            />
                          )}
                          {pctRealizadas < 100 && (
                            <div
                              className="h-full rounded-full bg-[#1C1D21]"
                              style={{ width: `${100 - pctRealizadas}%` }}
                            />
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t border-dotted border-zinc-200 pt-2 text-xs">
                          <span className="text-zinc-500">Ficha e Honorários</span>
                          <Link
                            href={`/formadores/${f.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] hover:underline"
                          >
                            Abrir Ficha <ArrowUpRight className="size-3.5" aria-hidden />
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-1">
                      {f.ativo ? (
                        <BotoesPortal
                          tipo="formador"
                          id={f.id}
                          nome={f.nome}
                          portalToken={f.portalToken}
                          temTelefone={Boolean(f.telefone)}
                          compacto
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">Formador inativo (portal suspenso)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </GrelhaProgressiva>
          )}
        </section>
      )}

      {/* Secção 2: Formandos (10 em 10) */}
      {mostrarFormandos && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base font-semibold text-[#1C1D21]">Formandos ({formandos.length})</h2>
              <p className="text-xs text-zinc-500">
                Aceda à ficha de parcelas e pagamentos do formando ou envie o link do portal por WhatsApp.
              </p>
            </div>
          </div>

          {formandos.length === 0 ? (
            <Card className="p-6">
              <Vazio>Nenhum formando encontrado.</Vazio>
            </Card>
          ) : (
            <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {formandos.map((f, idx) => (
                <div
                  key={f.id}
                  className="flex flex-col justify-between rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:border-zinc-300"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            idx % 2 === 0 ? "bg-[#FBD34D] text-[#1C1D21]" : "bg-[#1C1D21] text-white",
                          )}
                        >
                          {iniciais(f.nome)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/formandos/${f.id}`}
                            className="block truncate font-semibold text-[#1C1D21] hover:underline"
                          >
                            {f.nome}
                          </Link>
                          <div className="truncate text-xs text-zinc-500">{f.whatsapp}</div>
                        </div>
                      </div>
                      <Badge cor={f._count.matriculas > 0 ? "amarelo" : "cinza"}>
                        {f._count.matriculas} matr.
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FAF9F5] px-3.5 py-2.5 text-xs">
                      <span className="truncate text-zinc-500">
                        {f.profissao ? (
                          <strong className="font-medium text-[#1C1D21]">{f.profissao}</strong>
                        ) : (
                          "Formando registado"
                        )}
                      </span>
                      <Link
                        href={`/formandos/${f.id}`}
                        className="ml-2 inline-flex shrink-0 items-center gap-1 font-semibold text-[#1C1D21] hover:underline"
                      >
                        Ficha / Parcelas <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 pt-1">
                    <BotoesPortal
                      tipo="formando"
                      id={f.id}
                      nome={f.nome}
                      portalToken={f.portalToken}
                      temTelefone={Boolean(f.whatsapp)}
                      compacto
                    />
                  </div>
                </div>
              ))}
            </GrelhaProgressiva>
          )}
        </section>
      )}
    </div>
  );
}
