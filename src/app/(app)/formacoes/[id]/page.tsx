import { ArrowLeft, ArrowRight, BookOpen, Clock, ExternalLink, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { EstadoTurma } from "@prisma/client";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, LinkButton, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { dataSimples, diaLocal, formatData } from "@/lib/datas";
import { centimosParaInput, formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { guardarFormacao } from "../actions";
import { FormacaoForm } from "../formacao-form";

export const metadata = { title: "Formação" };

const ESTADOS_TURMA: Record<EstadoTurma, { nome: string; cor: "cinza" | "verde" | "vermelho" | "amarelo" | "azul" }> = {
  PLANEADA: { nome: "Planeada", cor: "azul" },
  EM_CURSO: { nome: "Em curso", cor: "verde" },
  CONCLUIDA: { nome: "Concluída", cor: "cinza" },
  CANCELADA: { nome: "Cancelada", cor: "vermelho" },
};

export default async function FormacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("formacoes:ver");
  const editar = pode(user.perfil, "formacoes:editar");
  const podeCriarTurma = pode(user.perfil, "agenda:editar");

  const formacao = await db.formacao.findFirst({
    where: { id },
    include: {
      turmas: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              matriculas: { where: { estado: { not: "CANCELADA" } } },
              sessoes: { where: { estado: { not: "CANCELADA" } } },
            },
          },
          sessoes: { select: { inicio: true, sala: { select: { nome: true } } }, orderBy: { inicio: "asc" }, take: 1 },
        },
      },
    },
  });
  if (!formacao) notFound();

  const turmasAtivas = formacao.turmas.filter((t) => t.estado === "PLANEADA" || t.estado === "EM_CURSO");
  const totalInscritos = formacao.turmas.reduce((acc, t) => acc + t._count.matriculas, 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Catálogo de Formações · {NOMES_CATEGORIA[formacao.categoria]}
            </span>
            <Badge cor={formacao.categoria === "TECNICA" ? "azul" : "amarelo"}>
              {NOMES_CATEGORIA[formacao.categoria]}
            </Badge>
            {formacao.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {formacao.nome}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/formacoes" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às formações
          </LinkButton>
          {podeCriarTurma && formacao.ativa && (
            <LinkButton href={`/turmas/nova?formacaoId=${formacao.id}`}>
              <Plus className="size-4" aria-hidden /> Nova turma
            </LinkButton>
          )}
        </div>
      </div>

      {/* Bloco Editorial de Métricas + 3 Pílulas Horizontais Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs font-medium text-slate-500">Preço base de tabela</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {formatKz(formacao.preco)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Carga horária prevista</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {formacao.cargaHoraria}{" "}
              <span className="text-sm font-medium text-slate-500">horas</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Edições / Turmas</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {formacao.turmas.length}{" "}
              <span className="text-sm font-medium text-emerald-700">({totalInscritos} inscritos)</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Turmas abertas (planeadas / em curso)</span>
              <span className="font-semibold text-[#1C1D21]">{turmasAtivas.length}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span>Edições ativas</span>
              <span>{turmasAtivas.length} de {formacao.turmas.length}</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Formandos matriculados</span>
              <span className="font-semibold text-[#1C1D21]">{totalInscritos}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span>Total de inscrições</span>
              <span>{totalInscritos} formandos</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Enquadramento</span>
              <span className="font-semibold text-[#1C1D21]">{formacao.cargaHoraria} h</span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span>{NOMES_CATEGORIA[formacao.categoria]}</span>
              <span>{formacao.ativa ? "Ativa" : "Inativa"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Esquerda: Turmas desta Formação + Formulário de Edição (se tiver permissão) */}
        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1C1D21]">
                  Turmas desta Formação ({formacao.turmas.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Clique numa turma para consultar sessões, vagas e formandos inscritos.
                </p>
              </div>
            </div>

            {formacao.turmas.length === 0 ? (
              <Card>
                <Vazio>Ainda não há turmas criadas para esta formação.</Vazio>
              </Card>
            ) : (
              <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2">
                {formacao.turmas.map((t) => {
                  const inscritos = t._count.matriculas;
                  const vagas = t.vagas ?? 0;
                  const pctOcupacao = vagas > 0 ? Math.min(100, Math.round((inscritos / vagas) * 100)) : 50;

                  return (
                    <Link
                      key={t.id}
                      href={`/turmas/${t.id}`}
                      className="group flex flex-col justify-between rounded-[24px] border border-[#E5E3DC] bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#1C1D21]/30 hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-[#1C1D21] px-2.5 py-1 font-mono text-xs font-bold text-[#FBD34D]">
                            {t.codigo}
                          </span>
                          <Badge cor={ESTADOS_TURMA[t.estado].cor}>{ESTADOS_TURMA[t.estado].nome}</Badge>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-[#F8F7F3] p-3 text-xs">
                          <div>
                            <div className="text-slate-500">Inscritos</div>
                            <div className="mt-0.5 font-semibold text-[#1C1D21]">
                              {inscritos}
                              {t.vagas ? <span className="font-normal text-slate-500"> / {t.vagas}</span> : null}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">Início</div>
                            <div className="mt-0.5 font-semibold text-[#1C1D21]">
                              {t.sessoes[0]
                                ? formatData(dataSimples(diaLocal(t.sessoes[0].inicio)))
                                : "Por agendar"}
                            </div>
                          </div>
                        </div>

                        {/* Barra de ocupação de dois tons */}
                        <div className="mt-3 rounded-2xl border border-[#ECEAE3] bg-white px-3.5 py-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Ocupação de vagas</span>
                            <span className="font-semibold text-[#1C1D21]">
                              {t.vagas ? `${pctOcupacao}%` : `${inscritos} inscrito(s)`}
                            </span>
                          </div>
                          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
                            <div className="bg-[#FBD34D]" style={{ width: `${pctOcupacao}%` }} />
                            <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctOcupacao)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-dotted border-[#E2E0D8] pt-3 text-xs">
                        <span className="text-slate-500">{t._count.sessoes} sessão(ões)</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] group-hover:translate-x-0.5 transition-transform">
                          Abrir turma <ArrowRight className="size-3.5" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </GrelhaProgressiva>
            )}
          </div>

          {editar && (
            <Card>
              <CardHeader
                titulo="Editar Dados da Formação"
                descricao="Atualize nome, carga horária, preço base ou descrição comercial."
              />
              <FormacaoForm
                acao={guardarFormacao.bind(null, formacao.id)}
                inicial={{
                  nome: formacao.nome,
                  slug: formacao.slug,
                  descricao: formacao.descricao ?? "",
                  cargaHoraria: formacao.cargaHoraria,
                  preco: centimosParaInput(formacao.preco),
                  categoria: formacao.categoria,
                  ativa: formacao.ativa,
                }}
              />
            </Card>
          )}
        </div>

        {/* Coluna Direita (350px) — Ficha Técnica da Formação (Referência 2) */}
        <div className="space-y-5">
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <BookOpen className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-[#1C1D21]">Ficha Técnica</div>
                <div className="text-xs text-slate-500">Resumo do curso e captação</div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline">
                <span className="text-slate-500">Categoria</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{NOMES_CATEGORIA[formacao.categoria]}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Carga horária</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{formacao.cargaHoraria} horas</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Preço base</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{formatKz(formacao.preco)}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Slug público</span>
                <span className="leader-dots" />
                <span className="font-mono font-semibold text-[#1C1D21]">{formacao.slug}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Turmas ativas</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{turmasAtivas.length}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Total inscritos</span>
                <span className="leader-dots" />
                <span className="font-bold text-emerald-700">{totalInscritos}</span>
              </div>
            </div>

            {/* Descrição */}
            <div className="mt-4 rounded-2xl bg-[#F8F7F3] p-3.5 text-xs">
              <div className="font-semibold text-[#1C1D21]">Descrição do Curso</div>
              <p className="mt-1 whitespace-pre-line text-slate-600">
                {formacao.descricao || "Sem descrição adicional registada para esta formação."}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#F8F7F3] p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="size-3.5" aria-hidden />
                  <span className="text-[11px]">Duração</span>
                </div>
                <div className="mt-1 text-base font-bold text-[#1C1D21]">{formacao.cargaHoraria} h</div>
              </div>
              <div className="rounded-2xl bg-[#FBD34D]/25 p-3">
                <div className="flex items-center gap-1.5 text-[#1C1D21]">
                  <UsersRound className="size-3.5" aria-hidden />
                  <span className="text-[11px] font-medium">Inscritos</span>
                </div>
                <div className="mt-1 text-base font-bold text-[#1C1D21]">{totalInscritos}</div>
              </div>
            </div>

            {formacao.ativa && (
              <Link
                href={`/p/${user.tenant.slug}/${formacao.slug}`}
                target="_blank"
                className="mt-4 flex w-full items-center justify-between rounded-2xl bg-[#1C1D21] px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#2A2C32]"
              >
                <span>Ver página pública de pré-cadastro</span>
                <ExternalLink className="size-3.5 text-[#FBD34D]" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


