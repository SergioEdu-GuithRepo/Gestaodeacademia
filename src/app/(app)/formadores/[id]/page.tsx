import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, Smartphone, Star, Trash2 } from "lucide-react";
import { GrelhaProgressiva, TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Button, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { CRITERIOS, formatNota, mediaAvaliacao, mediasAvaliacoes } from "@/lib/avaliacoes";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { formatDataHora, formatDiaSemana, formatHora } from "@/lib/datas";
import { centimosParaInput, formatKz } from "@/lib/money";
import { formatHoras, precoHoraFormador, totalHoras } from "@/lib/precos-formador";
import { pode } from "@/lib/rbac";
import { BotoesPortal } from "../../portais/botoes-portal";
import { adicionarAvaliacao, guardarFormador, guardarPreco, removerPreco } from "../actions";
import { carregarAreasCompetencias } from "../dados";
import { FormadorForm } from "../formador-form";
import { AvaliacaoForm, PrecoForm } from "../forms";

export const metadata = { title: "Ficha do Formador" };

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "FM";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
}

export default async function FormadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("formadores:ver");
  const editar = pode(user.perfil, "formadores:editar");
  const gerirPrecos = pode(user.perfil, "formadores:precos");
  const avaliar = pode(user.perfil, "formadores:avaliar");
  const agora = new Date();

  const formador = await db.formador.findFirst({
    where: { id },
    include: {
      areas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      competencias: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      precos: { include: { formacao: { select: { id: true, nome: true, categoria: true } } } },
      avaliacoes: { orderBy: { createdAt: "desc" }, include: { turma: { select: { id: true, codigo: true } } } },
    },
  });
  if (!formador) notFound();

  const [opcoes, formacoes, turmas, proximas, realizadas] = await Promise.all([
    editar ? carregarAreasCompetencias(db) : null,
    gerirPrecos
      ? db.formacao.findMany({
          where: { ativa: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, categoria: true },
        })
      : [],
    avaliar
      ? db.turma.findMany({
          where: { sessoes: { some: { formadorId: id } } },
          orderBy: { createdAt: "desc" },
          select: { id: true, codigo: true, formacao: { select: { nome: true } } },
        })
      : [],
    db.sessao.findMany({
      where: { formadorId: id, estado: "AGENDADA", inicio: { gte: agora } },
      orderBy: { inicio: "asc" },
      include: {
        turma: { select: { id: true, codigo: true, formacao: { select: { id: true, nome: true } } } },
        sala: { select: { nome: true } },
      },
    }),
    db.sessao.findMany({
      where: { formadorId: id, estado: "REALIZADA" },
      select: { inicio: true, fim: true, horasLecionadas: true },
    }),
  ]);

  const horas = totalHoras(realizadas);
  const medias = mediasAvaliacoes(formador.avaliacoes);
  const precos = [...formador.precos].sort((a, b) => a.formacao.nome.localeCompare(b.formacao.nome, "pt"));

  const somaAtividade = Math.max(1, realizadas.length + proximas.length + medias.total);
  const pctRealizadas = Math.max(25, Math.round((realizadas.length * 100) / somaAtividade));
  const pctAgendadas = Math.max(20, Math.round((proximas.length * 100) / somaAtividade));
  const pctAvaliacoes = Math.max(15, 100 - pctRealizadas - pctAgendadas);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-lg font-bold text-[#FBD34D]">
            {iniciais(formador.nome)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{formador.nome}</h1>
              {formador.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge cor="cinza">Inativo</Badge>}
              {medias.geral !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FBD34D]/35 px-3 py-1 text-xs font-bold text-[#1C1D21]">
                  <Star className="size-3.5 fill-[#1C1D21] text-[#1C1D21]" aria-hidden />
                  {formatNota(medias.geral)} / 5
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {[formador.email, formador.telefone].filter(Boolean).join(" · ") || "Sem contactos diretos registados"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/formadores" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar aos formadores
          </LinkButton>
          <LinkButton href={`/agenda?vista=formador&id=${formador.id}`} variante="secundario">
            <CalendarDays className="size-4" aria-hidden /> Ver calendário
          </LinkButton>
        </div>
      </div>

      {/* Bloco de Métrica Principal + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">
              Total de horas lecionadas / Avaliação global de desempenho
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {formatHoras(horas)}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-700 sm:text-3xl">
                {medias.geral !== null ? `${formatNota(medias.geral)} ★` : "Sem nota"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
              Comportamental: <strong>{formatKz(formador.precoHoraComportamental)}/h</strong>
            </span>
            <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
              Técnica: <strong>{formatKz(formador.precoHoraTecnica)}/h</strong>
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: pctRealizadas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Sessões realizadas</span>
              <span className="font-semibold text-zinc-800">{realizadas.length} aula(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>Concluídas</span>
              <span>{pctRealizadas}%</span>
            </div>
          </div>

          <div style={{ flex: pctAgendadas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Próximas sessões</span>
              <span className="font-semibold text-zinc-800">{proximas.length} agendada(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Agenda futura</span>
              <span>{pctAgendadas}%</span>
            </div>
          </div>

          <div style={{ flex: pctAvaliacoes }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Avaliações</span>
              <span className="font-semibold text-zinc-700">{medias.total} registo(s)</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Qualidade</span>
              <span>{pctAvaliacoes}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Principal */}
        <div className="min-w-0 space-y-6">
          {/* 1. Próximas Sessões Agendadas */}
          <Card>
            <CardHeader
              titulo={`Próximas Sessões Agendadas (${proximas.length})`}
              descricao="Calendário de aulas atribuídas a este formador."
            />
            {proximas.length === 0 ? (
              <Vazio>Sem sessões futuras agendadas para este formador.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data / Hora</Th>
                    <Th>Formação / Turma</Th>
                    <Th>Sala</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={4}>
                  {proximas.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[#FBD34D]/10">
                      <Td className="whitespace-nowrap">
                        <div className="font-semibold text-zinc-900">{formatDiaSemana(s.inicio)}</div>
                        <div className="text-[11px] text-zinc-500">
                          {formatHora(s.inicio)}–{formatHora(s.fim)}
                        </div>
                      </Td>
                      <Td>
                        <Link
                          href={`/turmas/${s.turma.id}`}
                          className="font-semibold text-zinc-900 hover:underline"
                        >
                          {s.turma.formacao.nome}
                        </Link>
                        <div className="text-[11px] text-zinc-500">Turma {s.turma.codigo}</div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="rounded-full bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80">
                          {s.sala.nome}
                        </span>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <Link
                          href={`/turmas/${s.turma.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F5] px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]"
                        >
                          Abrir turma <ArrowUpRight className="size-3.5" aria-hidden />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>

          {/* 2. Avaliações de Desempenho (5 Critérios) */}
          <Card>
            <CardHeader
              titulo={`Avaliações de Desempenho (${medias.total})`}
              descricao="Classificação pedagógica nos 5 critérios oficiais da academia."
            />
            {medias.total > 0 && (
              <div className="space-y-3 border-b border-zinc-100 p-6">
                {CRITERIOS.map((c) => {
                  const v = medias.porCriterio[c.campo] ?? 0;
                  const pct = Math.min(100, Math.round((v / 5) * 100));
                  return (
                    <div
                      key={c.campo}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[19rem_1fr_auto]"
                    >
                      <span className="text-xs font-medium text-zinc-700">{c.nome}</span>
                      <div className="order-last col-span-2 flex h-2 overflow-hidden rounded-full bg-zinc-100 sm:order-none sm:col-span-1">
                        <div className="bg-[#FBD34D]" style={{ width: `${pct}%` }} />
                        <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pct)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-zinc-900 tabular-nums">
                        {formatNota(medias.porCriterio[c.campo])} / 5
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-end gap-1.5 pt-2 text-xs font-bold text-zinc-900">
                  <Star className="size-4 fill-[#FBD34D] text-[#E5A900]" aria-hidden />
                  Média geral: {formatNota(medias.geral)} / 5
                </div>
              </div>
            )}

            {formador.avaliacoes.length === 0 ? (
              <Vazio>Ainda sem avaliações registadas para este formador.</Vazio>
            ) : (
              <div className="p-6">
                <GrelhaProgressiva passo={10} labelItem="avaliações" className="space-y-3">
                  {formador.avaliacoes.map((a) => (
                    <div key={a.id} className="rounded-2xl bg-[#FAF9F5] p-4 text-sm ring-1 ring-zinc-200/70">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1D21] px-2.5 py-0.5 text-xs font-bold text-[#FBD34D]">
                            <Star className="size-3 fill-[#FBD34D] text-[#FBD34D]" aria-hidden />
                            {formatNota(mediaAvaliacao(a))}
                          </span>
                          {a.turma && (
                            <Link
                              href={`/turmas/${a.turma.id}`}
                              className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-[#FBD34D]/30"
                            >
                              Turma {a.turma.codigo}
                            </Link>
                          )}
                        </div>
                        <span className="text-xs text-zinc-400">
                          {a.avaliadoPor ? `${a.avaliadoPor} · ` : ""}
                          {formatDataHora(a.createdAt)}
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-zinc-600">
                        {CRITERIOS.map((c) => (
                          <span
                            key={c.campo}
                            title={c.nome}
                            className="rounded-lg bg-white px-2 py-0.5 ring-1 ring-zinc-200/80"
                          >
                            {c.curto}: <strong className="text-zinc-900">{a[c.campo]}</strong>
                          </span>
                        ))}
                      </div>

                      {a.comentario && (
                        <p className="mt-2.5 whitespace-pre-line text-xs leading-relaxed text-zinc-700">
                          {a.comentario}
                        </p>
                      )}
                    </div>
                  ))}
                </GrelhaProgressiva>
              </div>
            )}

            {avaliar && (
              <AvaliacaoForm
                acao={adicionarAvaliacao.bind(null, formador.id)}
                avaliador={user.nome}
                turmas={turmas.map((t) => ({ id: t.id, nome: `${t.codigo} — ${t.formacao.nome}` }))}
              />
            )}
          </Card>

          {/* 3. Preços Específicos por Formação */}
          <Card>
            <CardHeader
              titulo={`Preços por Formação (${precos.length})`}
              descricao="Valor/hora específico que substitui o valor padrão da categoria nessa formação."
            />
            {precos.length === 0 ? (
              <Vazio>Sem preços específicos — aplica-se o valor/hora da categoria.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formação</Th>
                    <Th className="text-right">Valor/hora específico</Th>
                    <Th className="hidden text-right sm:table-cell">Valor da categoria</Th>
                    {gerirPrecos && (
                      <Th className="w-12 text-right">
                        <span className="sr-only">Ações</span>
                      </Th>
                    )}
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={gerirPrecos ? 4 : 3}>
                  {precos.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-[#FBD34D]/10">
                      <Td>
                        <Link href={`/formacoes/${p.formacao.id}`} className="font-semibold text-zinc-900 hover:underline">
                          {p.formacao.nome}
                        </Link>
                        <div className="text-xs text-zinc-500">{NOMES_CATEGORIA[p.formacao.categoria]}</div>
                      </Td>
                      <Td className="text-right font-bold whitespace-nowrap text-zinc-900">
                        {formatKz(precoHoraFormador(formador, p.formacao.categoria, p.precoHora))}
                      </Td>
                      <Td className="hidden text-right whitespace-nowrap text-zinc-500 sm:table-cell">
                        {formatKz(precoHoraFormador(formador, p.formacao.categoria))}
                      </Td>
                      {gerirPrecos && (
                        <Td className="py-1.5 text-right">
                          <form action={removerPreco.bind(null, formador.id, p.id)}>
                            <Button type="submit" variante="fantasma" className="px-2" title="Remover preço específico">
                              <Trash2 className="size-4 text-red-600" aria-hidden />
                              <span className="sr-only">Remover preço de {p.formacao.nome}</span>
                            </Button>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
            {gerirPrecos && (
              <PrecoForm
                acao={guardarPreco.bind(null, formador.id)}
                formacoes={formacoes.map((f) => ({ id: f.id, nome: f.nome, categoria: NOMES_CATEGORIA[f.categoria] }))}
              />
            )}
          </Card>

          {/* 4. Formulário de Edição do Formador */}
          {editar && opcoes && (
            <Card>
              <CardHeader
                titulo="Editar Dados do Formador"
                descricao="Atualizar contactos, áreas, competências, estado e valores/hora base."
              />
              <FormadorForm
                acao={guardarFormador.bind(null, formador.id)}
                areas={opcoes.areas}
                grupos={opcoes.grupos}
                inicial={{
                  nome: formador.nome,
                  email: formador.email ?? "",
                  telefone: formador.telefone ?? "",
                  notas: formador.notas ?? "",
                  ativo: formador.ativo,
                  precoHoraComportamental: centimosParaInput(formador.precoHoraComportamental),
                  precoHoraTecnica: centimosParaInput(formador.precoHoraTecnica),
                  areas: formador.areas.map((a) => a.id),
                  competencias: formador.competencias.map((c) => c.id),
                }}
              />
            </Card>
          )}
        </div>

        {/* Coluna Lateral Direita (350px) */}
        <aside className="space-y-6">
          {/* Ficha Técnica do Formador */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <h2 className="text-base font-bold text-zinc-900">Ficha do Formador</h2>
            <p className="text-xs text-zinc-400">Resumo técnico e enquadramento</p>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Estado</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{formador.ativo ? "Ativo" : "Inativo"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Email</span>
                <span className="leader-dots" />
                <span className="max-w-[180px] truncate font-semibold text-zinc-800">{formador.email || "—"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Telefone</span>
                <span className="leader-dots" />
                <span className="font-semibold text-zinc-800">{formador.telefone || "—"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Horas lecionadas</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{formatHoras(horas)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Sessões concluídas</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{realizadas.length}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Valor/h Comportamental</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{formatKz(formador.precoHoraComportamental)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Valor/h Técnica</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{formatKz(formador.precoHoraTecnica)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Nota média</span>
                <span className="leader-dots" />
                <span className="font-bold text-emerald-700">
                  {medias.geral !== null ? `${formatNota(medias.geral)} / 5` : "—"}
                </span>
              </div>
            </div>

            {/* Áreas e Competências */}
            <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4 text-xs">
              <div>
                <div className="mb-1.5 font-semibold text-zinc-500">Áreas de formação</div>
                {formador.areas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {formador.areas.map((a) => (
                      <Badge key={a.id} cor="azul">
                        {a.nome}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-400">Nenhuma área atribuída</span>
                )}
              </div>

              <div>
                <div className="mb-1.5 font-semibold text-zinc-500">Competências</div>
                {formador.competencias.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {formador.competencias.map((c) => (
                      <span
                        key={c.id}
                        className="rounded-lg bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80"
                      >
                        {c.nome}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-400">Nenhuma competência atribuída</span>
                )}
              </div>

              {formador.notas && (
                <div>
                  <div className="mb-1 font-semibold text-zinc-500">Observações</div>
                  <p className="whitespace-pre-line rounded-2xl bg-[#FAF9F5] p-3 text-zinc-700">{formador.notas}</p>
                </div>
              )}
            </div>
          </div>

          {/* Cartão do Portal do Formador */}
          {formador.ativo && (
            <div className="rounded-3xl bg-[#1C1D21] p-6 text-white shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-[#FBD34D]">
                  <Smartphone className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Portal do Formador</h3>
                  <p className="text-[11px] text-zinc-400">Acesso móvel para confirmar aulas e ver honorários</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-3.5 text-zinc-900">
                <BotoesPortal
                  tipo="formador"
                  id={formador.id}
                  nome={formador.nome}
                  portalToken={formador.portalToken}
                  temTelefone={Boolean(formador.telefone)}
                />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
