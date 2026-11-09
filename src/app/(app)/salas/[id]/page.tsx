import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, DoorOpen } from "lucide-react";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatDiaSemana, formatHora } from "@/lib/datas";
import { guardarSala } from "../actions";
import { SalaForm } from "../sala-form";

export const metadata = { title: "Detalhe da Sala" };

export default async function EditarSalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await exigir("formacoes:editar");
  const agora = new Date();

  const sala = await db.sala.findFirst({
    where: { id },
    include: {
      sessoes: {
        where: { estado: "AGENDADA", inicio: { gte: agora } },
        orderBy: { inicio: "asc" },
        include: {
          turma: { select: { id: true, codigo: true, formacao: { select: { nome: true } } } },
          formador: { select: { id: true, nome: true } },
        },
      },
      _count: {
        select: {
          sessoes: { where: { estado: "REALIZADA" } },
        },
      },
    },
  });
  if (!sala) notFound();

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
            <DoorOpen className="size-6" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{sala.nome}</h1>
              {sala.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {sala.capacidade ? `Capacidade máxima: ${sala.capacidade} lugares` : "Sem limite fixo de lotação"} ·{" "}
              {sala.sessoes.length} próxima(s) aula(s)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/salas" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às salas
          </LinkButton>
          <LinkButton href={`/agenda?vista=sala&id=${sala.id}`} variante="secundario">
            <CalendarDays className="size-4" aria-hidden /> Ver no calendário
          </LinkButton>
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Próximas Sessões na Sala */}
          <Card>
            <CardHeader
              titulo={`Próximas Sessões nesta Sala (${sala.sessoes.length})`}
              descricao="Aulas agendadas que ocupam este espaço."
            />
            {sala.sessoes.length === 0 ? (
              <Vazio>Sem sessões futuras agendadas para esta sala.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data / Hora</Th>
                    <Th>Formação / Turma</Th>
                    <Th>Formador</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={4}>
                  {sala.sessoes.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[#FBD34D]/10">
                      <Td className="whitespace-nowrap">
                        <div className="font-semibold text-zinc-900">{formatDiaSemana(s.inicio)}</div>
                        <div className="text-[11px] text-zinc-500">
                          {formatHora(s.inicio)}–{formatHora(s.fim)}
                        </div>
                      </Td>
                      <Td>
                        <Link href={`/turmas/${s.turma.id}`} className="font-semibold text-zinc-900 hover:underline">
                          {s.turma.formacao.nome}
                        </Link>
                        <div className="text-[11px] text-zinc-500">Turma {s.turma.codigo}</div>
                      </Td>
                      <Td>
                        <Link href={`/formadores/${s.formador.id}`} className="font-medium text-zinc-800 hover:underline">
                          {s.formador.nome}
                        </Link>
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

          {/* Editar Dados da Sala */}
          <Card>
            <CardHeader titulo="Configuração da Sala" descricao="Atualizar nome, lotação máxima e disponibilidade." />
            <SalaForm
              acao={guardarSala.bind(null, sala.id)}
              inicial={{ nome: sala.nome, capacidade: sala.capacidade, ativa: sala.ativa }}
            />
          </Card>
        </div>

        {/* Coluna Lateral Direita */}
        <aside className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <h2 className="text-base font-bold text-zinc-900">Ficha do Espaço</h2>
            <p className="text-xs text-zinc-400">Resumo de capacidade e utilização</p>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Estado</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{sala.ativa ? "Ativa" : "Inativa"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Capacidade</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">
                  {sala.capacidade ? `${sala.capacidade} lugares` : "Sem limite"}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Aulas agendadas</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">{sala.sessoes.length}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Aulas realizadas</span>
                <span className="leader-dots" />
                <span className="font-bold text-emerald-700">{sala._count.sessoes}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
