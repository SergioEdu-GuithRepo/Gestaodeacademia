import Link from "next/link";
import { ArrowUpRight, Layers, Plus, Star } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Button, Card, CardHeader, Input, LinkButton, Select, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatNota, mediasAvaliacoes } from "@/lib/avaliacoes";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { criarArea, criarCompetencia } from "./actions";
import { carregarAreasCompetencias } from "./dados";
import { AreaForm, CompetenciaForm } from "./forms";

export const metadata = { title: "Formadores" };

type SP = Promise<Record<string, string | string[] | undefined>>;

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "FM";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
}

export default async function FormadoresPage({ searchParams }: { searchParams: SP }) {
  const { user, db } = await exigir("formadores:ver");
  const editar = pode(user.perfil, "formadores:editar");
  const sp = await searchParams;
  const q = param(sp.q);
  const area = param(sp.area);
  const competencia = param(sp.competencia);
  const estado = param(sp.estado); // "" | "ativos" | "inativos"

  const where: Prisma.FormadorWhereInput = {};
  if (q) where.nome = { contains: q, mode: "insensitive" };
  if (area) where.areas = { some: { id: area } };
  if (competencia) where.competencias = { some: { id: competencia } };
  if (estado === "ativos") where.ativo = true;
  if (estado === "inativos") where.ativo = false;

  const [formadores, { areas, grupos }] = await Promise.all([
    db.formador.findMany({
      where,
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: {
        areas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
        competencias: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
        _count: { select: { sessoes: { where: { estado: { not: "CANCELADA" } } } } },
        avaliacoes: {
          select: {
            dominioConteudo: true,
            eticaProfissional: true,
            cumprimentoHorarios: true,
            enquadramentoExercicios: true,
            capacidadeMotivar: true,
          },
        },
      },
    }),
    carregarAreasCompetencias(db),
  ]);
  const filtrado = q !== "" || area !== "" || competencia !== "" || estado !== "";

  const totalAtivos = formadores.filter((f) => f.ativo).length;
  const totalCompetencias = grupos.reduce((acc, g) => acc + g.competencias.length, 0);
  const todasAvaliacoes = formadores.flatMap((f) => f.avaliacoes);
  const mediaEquipa = mediasAvaliacoes(todasAvaliacoes);

  const somaBase = Math.max(1, totalAtivos + areas.length + totalCompetencias);
  const pctAtivos = Math.max(25, Math.round((totalAtivos * 100) / somaBase));
  const pctAreas = Math.max(20, Math.round((areas.length * 100) / somaBase));
  const pctComp = Math.max(15, 100 - pctAtivos - pctAreas);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Corpo Docente</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Equipa de formadores, competências técnicas, valores/hora e avaliações de desempenho
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="#areas-competencias"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Layers className="size-3.5 text-zinc-500" aria-hidden /> Áreas e competências
          </a>
          {editar && (
            <LinkButton href="/formadores/novo">
              <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Novo formador
            </LinkButton>
          )}
        </div>
      </div>

      {/* Bloco de Métrica Editorial + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">Formadores ativos / Total na equipa</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {totalAtivos} {totalAtivos === 1 ? "ativo" : "ativos"}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-600 sm:text-3xl">
                {formadores.length} registado(s)
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80">
            <Star className="size-3.5 fill-[#FBD34D] text-[#E5A900]" aria-hidden />
            Avaliação média da equipa:{" "}
            <strong>{mediaEquipa.geral !== null ? `${formatNota(mediaEquipa.geral)} / 5` : "—"}</strong>
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: pctAtivos }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Formadores ativos</span>
              <span className="font-semibold text-zinc-800">{totalAtivos} docente(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>Disponíveis</span>
              <span>{pctAtivos}%</span>
            </div>
          </div>

          <div style={{ flex: pctAreas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Áreas de formação</span>
              <span className="font-semibold text-zinc-800">{areas.length} área(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Domínios</span>
              <span>{pctAreas}%</span>
            </div>
          </div>

          <div style={{ flex: pctComp }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Competências</span>
              <span className="font-semibold text-zinc-700">{totalCompetencias} valência(s)</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Valências</span>
              <span>{pctComp}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros de Pesquisa */}
      <Card className="p-5">
        <form method="get" className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_13rem_14rem_10rem_auto] lg:items-end">
          <label className="col-span-2 space-y-1 text-sm lg:col-span-1">
            <span className="block text-xs font-semibold text-zinc-600">Pesquisar formador</span>
            <Input type="search" name="q" defaultValue={q} placeholder="Nome do formador…" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-semibold text-zinc-600">Área</span>
            <Select name="area" defaultValue={area}>
              <option value="">Todas as áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-semibold text-zinc-600">Competência</span>
            <Select name="competencia" defaultValue={competencia}>
              <option value="">Todas as competências</option>
              {grupos.map((g) => (
                <optgroup key={g.area} label={g.area}>
                  {g.competencias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-semibold text-zinc-600">Estado</span>
            <Select name="estado" defaultValue={estado}>
              <option value="">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </Select>
          </label>
          <div className="col-span-2 flex gap-2 self-end lg:col-span-1">
            <Button type="submit" variante="secundario" className="flex-1">
              Filtrar
            </Button>
            {filtrado && (
              <LinkButton href="/formadores" variante="fantasma">
                Limpar
              </LinkButton>
            )}
          </div>
        </form>
      </Card>

      {/* Grelha Progressiva de Formadores (10 em 10) */}
      {formadores.length === 0 ? (
        <Card>
          <Vazio>{filtrado ? "Nenhum formador corresponde aos filtros." : "Ainda não há formadores registados."}</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva
          passo={10}
          labelItem="formadores"
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {formadores.map((f) => {
            const m = mediasAvaliacoes(f.avaliacoes);
            const pctNota = m.geral !== null ? Math.min(100, Math.round((m.geral / 5) * 100)) : 0;

            return (
              <Link
                key={f.id}
                href={`/formadores/${f.id}`}
                className="group flex flex-col justify-between rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-[#FBD34D]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-bold text-[#FBD34D]">
                        {iniciais(f.nome)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-zinc-900">{f.nome}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {f.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge cor="cinza">Inativo</Badge>}
                          <span className="text-[11px] text-zinc-400">{f._count.sessoes} aula(s)</span>
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FAF9F5] px-2.5 py-1 text-xs font-bold text-zinc-800 ring-1 ring-zinc-200/80">
                      <Star
                        className={`size-3.5 ${m.geral !== null ? "fill-[#FBD34D] text-[#E5A900]" : "text-zinc-300"}`}
                        aria-hidden
                      />
                      {m.geral !== null ? `${formatNota(m.geral)}` : "—"}
                    </span>
                  </div>

                  {/* Áreas e competências */}
                  <div className="mt-4 space-y-2">
                    {f.areas.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {f.areas.map((a) => (
                          <Badge key={a.id} cor="azul">
                            {a.nome}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400">Sem área atribuída</div>
                    )}
                    {f.competencias.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {f.competencias.map((c) => (
                          <span
                            key={c.id}
                            className="rounded-lg bg-[#FAF9F5] px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200/70"
                          >
                            {c.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Barra Bicolor de Avaliação */}
                  <div className="mt-4 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Avaliação ({m.total} registo(s))</span>
                      <span className="font-semibold text-zinc-700">
                        {m.geral !== null ? `${formatNota(m.geral)} / 5` : "Sem avaliações"}
                      </span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="bg-[#FBD34D]" style={{ width: `${pctNota}%` }} />
                      <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctNota)}%` }} />
                    </div>
                  </div>

                  {/* Valores/hora */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-[#FAF9F5] p-3 text-xs">
                    <div>
                      <div className="text-[11px] text-zinc-400">Comportamental</div>
                      <div className="mt-0.5 font-bold text-zinc-900">{formatKz(f.precoHoraComportamental)}/h</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-400">Técnica</div>
                      <div className="mt-0.5 font-bold text-zinc-900">{formatKz(f.precoHoraTecnica)}/h</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3.5 text-xs font-semibold text-zinc-800">
                  <span>Abrir ficha, preços e avaliações</span>
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#FAF9F5] text-zinc-700 transition-colors group-hover:bg-[#FBD34D] group-hover:text-[#1C1D21]">
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </span>
                </div>
              </Link>
            );
          })}
        </GrelhaProgressiva>
      )}

      {/* Secção de Áreas e Competências */}
      <Card id="areas-competencias" className="scroll-mt-20">
        <CardHeader
          titulo="Áreas e Competências"
          descricao="Taxonomia usada para classificar e pesquisar o corpo docente por especialidade."
        />
        <div className="space-y-5 p-6">
          {grupos.length === 0 && areas.length === 0 ? (
            <p className="text-sm text-zinc-400">Ainda não há áreas nem competências definidas.</p>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((a) => {
                const g = grupos.find((x) => x.area === a.nome);
                return (
                  <div key={a.id} className="rounded-2xl bg-[#FAF9F5] p-4 ring-1 ring-zinc-200/70">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-zinc-900">{a.nome}</div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200">
                        {g?.competencias.length ?? 0} comp.
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {g && g.competencias.length > 0 ? (
                        g.competencias.map((c) => (
                          <span
                            key={c.id}
                            className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80"
                          >
                            {c.nome}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400">Sem competências associadas</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {grupos
                .filter((g) => g.area === "Sem área" && !areas.some((a) => a.nome === "Sem área"))
                .map((g) => (
                  <div key="sem-area" className="rounded-2xl bg-[#FAF9F5] p-4 ring-1 ring-zinc-200/70">
                    <div className="text-sm font-bold text-zinc-900">Sem área</div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {g.competencias.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80"
                        >
                          {c.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {editar && (
            <div className="grid gap-4 border-t border-zinc-100 pt-5 lg:grid-cols-[1fr_2fr]">
              <AreaForm acao={criarArea} />
              <CompetenciaForm acao={criarCompetencia} areas={areas} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
