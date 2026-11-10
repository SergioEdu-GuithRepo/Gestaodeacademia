import { ArrowLeft, CalendarDays, ClipboardCheck, DoorOpen, GraduationCap, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { diaLocal, formatDiaSemana, formatHora } from "@/lib/datas";
import { CORES_ESTADO_PRESENCA, NOMES_ESTADO_PRESENCA } from "@/lib/presencas";
import { pode } from "@/lib/rbac";
import { SessaoForm } from "../../../forms";
import { BadgeSessao } from "../../../rotulos";
import { ChamadaForm } from "./chamada-form";

export const metadata = { title: "Sessão e Chamada Nominal" };

export default async function SessaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string; sessaoId: string }>;
}) {
  const { user, db } = await exigir("agenda:ver");
  const podeEditar = pode(user.perfil, "agenda:editar");
  const { id, sessaoId } = await params;

  const [sessao, formadores, salas] = await Promise.all([
    db.sessao.findFirst({
      where: { id: sessaoId, turmaId: id },
      include: {
        formador: { select: { id: true, nome: true } },
        sala: { select: { id: true, nome: true } },
        presencas: { select: { matriculaId: true, estado: true, observacao: true } },
        turma: {
          include: {
            formacao: { select: { id: true, nome: true } },
            matriculas: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { formando: { nome: "asc" } },
              include: {
                formando: { select: { id: true, nome: true, whatsapp: true, profissao: true } },
              },
            },
          },
        },
      },
    }),
    podeEditar
      ? db.formador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
      : Promise.resolve([]),
    podeEditar
      ? db.sala.findMany({
          where: { ativa: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, capacidade: true },
        })
      : Promise.resolve([]),
  ]);

  if (!sessao) notFound();

  const mapaPresencas = new Map(sessao.presencas.map((p) => [p.matriculaId, p]));
  const temChamadaLancada = sessao.presencas.length > 0;
  const duracaoPadraoHoras = Math.max(0.5, (sessao.fim.getTime() - sessao.inicio.getTime()) / 3_600_000);

  const alunos = sessao.turma.matriculas.map((m) => {
    const registo = mapaPresencas.get(m.id);
    return {
      matriculaId: m.id,
      formandoId: m.formando.id,
      nome: m.formando.nome,
      whatsapp: m.formando.whatsapp,
      profissao: m.formando.profissao,
      estadoInicial: registo?.estado ?? "PRESENTE",
      observacaoInicial: registo?.observacao ?? "",
    };
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/turmas/${sessao.turma.id}`}
              className="text-xs font-semibold tracking-wider text-zinc-500 uppercase hover:text-[#1C1D21] hover:underline"
            >
              {sessao.turma.formacao.nome} · Turma {sessao.turma.codigo}
            </Link>
            <BadgeSessao estado={sessao.estado} />
            {temChamadaLancada && <Badge cor="verde">Chamada registada</Badge>}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl capitalize">
            {formatDiaSemana(sessao.inicio)} · {formatHora(sessao.inicio)}–{formatHora(sessao.fim)}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="size-3.5 text-zinc-400" aria-hidden />
              Formador: <strong className="text-[#1C1D21]">{sessao.formador.nome}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <DoorOpen className="size-3.5 text-zinc-400" aria-hidden />
              Sala: <strong className="text-[#1C1D21]">{sessao.sala.nome}</strong>
            </span>
            {sessao.horasLecionadas !== null && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-zinc-400" aria-hidden />
                Horas lecionadas: <strong className="text-[#1C1D21]">{Number(sessao.horasLecionadas)} h</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={`/turmas/${sessao.turma.id}`} variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar à turma
          </LinkButton>
          <LinkButton href={`/turmas/${sessao.turma.id}/folha-presencas`} variante="secundario">
            <Printer className="size-4" aria-hidden /> Folha de Presenças A4
          </LinkButton>
        </div>
      </div>

      {/* 1. Chamada Nominal da Sessão */}
      <Card>
        <CardHeader
          titulo="Chamada Nominal da Sessão"
          descricao={
            podeEditar
              ? "Registe as presenças, faltas e faltas justificadas dos formandos inscritos nesta turma."
              : "Consulta da lista de presenças registadas para esta sessão."
          }
          acoes={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3 py-1 text-xs font-semibold text-[#1C1D21]">
              <ClipboardCheck className="size-3.5 text-zinc-600" aria-hidden />
              {alunos.length} inscrito(s)
            </span>
          }
        />

        <div className="p-4 sm:p-6">
          {alunos.length === 0 ? (
            <Vazio>Ainda não existem formandos inscritos nesta turma para registar presenças.</Vazio>
          ) : sessao.estado === "CANCELADA" ? (
            <Alerta tipo="aviso">Esta sessão encontra-se cancelada e não aceita registo de chamada nominal.</Alerta>
          ) : podeEditar ? (
            <ChamadaForm
              turmaId={sessao.turma.id}
              sessaoId={sessao.id}
              estadoSessao={sessao.estado}
              duracaoPadraoHoras={duracaoPadraoHoras}
              horasLecionadasAtual={sessao.horasLecionadas !== null ? Number(sessao.horasLecionadas) : null}
              notasAtuais={sessao.notas}
              alunos={alunos}
            />
          ) : (
            <div className="space-y-4">
              {!temChamadaLancada && (
                <Alerta tipo="aviso">
                  A coordenação pedagógica ainda não lançou a chamada nominal desta sessão.
                </Alerta>
              )}
              {sessao.notas && (
                <div className="rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-3.5 text-xs text-zinc-700">
                  <div className="mb-1 font-semibold text-[#1C1D21]">Sumário / Notas da aula</div>
                  {sessao.notas}
                </div>
              )}
              <Tabela>
                <thead>
                  <tr>
                    <Th>N.º</Th>
                    <Th>Formando</Th>
                    <Th>WhatsApp</Th>
                    <Th>Estado</Th>
                    <Th>Observação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={15} colSpan={5}>
                  {alunos.map((a, idx) => {
                    const reg = mapaPresencas.get(a.matriculaId);
                    return (
                      <tr key={a.matriculaId}>
                        <Td className="font-mono text-xs text-zinc-400">{idx + 1}</Td>
                        <Td>
                          <div className="font-semibold text-[#1C1D21]">{a.nome}</div>
                          {a.profissao && <div className="text-xs text-zinc-500">{a.profissao}</div>}
                        </Td>
                        <Td className="font-mono text-xs text-zinc-600">{a.whatsapp}</Td>
                        <Td>
                          {reg ? (
                            <Badge cor={CORES_ESTADO_PRESENCA[reg.estado]}>
                              {NOMES_ESTADO_PRESENCA[reg.estado]}
                            </Badge>
                          ) : temChamadaLancada ? (
                            <Badge cor="verde">Presente</Badge>
                          ) : (
                            <Badge cor="cinza">Por registar</Badge>
                          )}
                        </Td>
                        <Td className="text-xs text-zinc-500">{reg?.observacao || "—"}</Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Edição do Horário / Formador / Sala (apenas para quem tem agenda:editar) */}
      {podeEditar && (
        <Card className="max-w-3xl">
          <CardHeader
            titulo="Dados de Agendamento da Sessão"
            descricao="As alterações de data, horário, formador e sala são validadas contra conflitos de agenda."
          />
          <div className="p-4 sm:p-6">
            <SessaoForm
              turmaId={id}
              formadores={formadores}
              salas={salas}
              sessao={{
                id: sessao.id,
                data: diaLocal(sessao.inicio),
                horaInicio: formatHora(sessao.inicio),
                horaFim: formatHora(sessao.fim),
                formadorId: sessao.formadorId,
                salaId: sessao.salaId,
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
