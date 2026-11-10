import {
  ArrowLeft,
  Award,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  FileSpreadsheet,
  MessageCircle,
  Pencil,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { verificarElegibilidadeCertificado } from "@/lib/certificados";
import { dataSimples, formatDiaSemana, formatHora, hojeLocal } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { calcularAssiduidade } from "@/lib/presencas";
import { pode } from "@/lib/rbac";
import { alterarEstadoSessao, apagarSessao, emitirCertificadoInternoAction } from "../actions";
import { SessaoForm } from "../forms";
import { BadgeSessao, BadgeTurma } from "../rotulos";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function TurmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { user, db } = await exigir("agenda:ver");
  const { id } = await params;
  const { aviso } = await searchParams;

  const [turma, cfg] = await Promise.all([
    db.turma.findFirst({
      where: { id },
      include: {
        formacao: true,
        sessoes: {
          orderBy: { inicio: "asc" },
          include: {
            formador: { select: { id: true, nome: true } },
            sala: { select: { nome: true } },
            presencas: { select: { matriculaId: true, estado: true } },
          },
        },
        matriculas: {
          where: { estado: { not: "CANCELADA" } },
          orderBy: { formando: { nome: "asc" } },
          include: {
            formando: { select: { id: true, nome: true, whatsapp: true, profissao: true } },
            parcelas: { include: { alocacoes: { select: { valor: true } } } },
            certificado: true,
          },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);
  if (!turma) notFound();

  const editar = pode(user.perfil, "agenda:editar");
  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const podeRegistarPagamento = pode(user.perfil, "pagamentos:registar");
  const podeMatricular = pode(user.perfil, "matriculas:editar");
  const podeVerFormandos = pode(user.perfil, "formandos:ver");
  const podeGerirCertificados = pode(user.perfil, "certificados:gerir");

  const [formadores, salas] = editar
    ? await Promise.all([
        db.formador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
        db.sala.findMany({
          where: { ativa: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, capacidade: true },
        }),
      ])
    : [[], []];

  const hoje = dataSimples(hojeLocal());
  const agora = new Date();
  const sessoesValidas = turma.sessoes.filter((s) => s.estado !== "CANCELADA");
  const sessoesRealizadas = sessoesValidas.filter((s) => s.estado === "REALIZADA").length;
  const proximaSessao = sessoesValidas.find((s) => s.estado === "AGENDADA" && s.inicio >= agora) ?? sessoesValidas[0];

  const horasAgendadas = sessoesValidas.reduce(
    (t, s) => t + (s.fim.getTime() - s.inicio.getTime()) / 3_600_000,
    0,
  );
  const preco = turma.preco ?? turma.formacao.preco;
  const inscritos = turma.matriculas.length;
  const vagas = turma.vagas ?? 0;
  const lotada = turma.vagas !== null && inscritos >= turma.vagas;
  const pctOcupacao = vagas > 0 ? Math.min(100, Math.round((inscritos / vagas) * 100)) : 50;
  const vagasRestantes = turma.vagas !== null ? Math.max(0, turma.vagas - inscritos) : null;

  // Cálculo de assiduidade e risco de desistência por formando inscrito
  const matriculasEnriquecidas = turma.matriculas.map((m) => {
    const resumo = resumirParcelas(m.parcelas.map(comPago), hoje);
    const assiduidade = calcularAssiduidade(
      sessoesValidas.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        estado: s.estado,
        temChamadaLancada: s.presencas.length > 0,
        estadoAluno: s.presencas.find((p) => p.matriculaId === m.id)?.estado ?? null,
      })),
    );
    const estadoParaElegibilidade =
      m.estado === "ATIVA" && turma.estado === "CONCLUIDA" && resumo.divida <= 0n ? "CONCLUIDA" : m.estado;
    const elegibilidade = verificarElegibilidadeCertificado({
      estadoMatricula: estadoParaElegibilidade,
      dividaCentimos: resumo.divida,
      assiduidadePct: assiduidade.assiduidadePct,
      minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
      revogado: Boolean(m.certificado?.revogadoEm),
    });
    return { m, resumo, assiduidade, elegibilidade };
  });

  const alunosEmRiscoAbandono = matriculasEnriquecidas.filter((item) => item.assiduidade.alertaFaltasSeguidas);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/formacoes/${turma.formacao.id}`}
              className="text-xs font-semibold tracking-wider text-slate-500 uppercase hover:text-[#1C1D21] hover:underline"
            >
              {turma.formacao.nome}
            </Link>
            <BadgeTurma estado={turma.estado} />
            {lotada && <Badge cor="amarelo">Turma completa</Badge>}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            Turma {turma.codigo}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/turmas" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às turmas
          </LinkButton>
          <LinkButton href={`/turmas/${turma.id}/folha-presencas`} variante="secundario">
            <FileSpreadsheet className="size-4" aria-hidden /> Lista de Presenças / Pauta A4
          </LinkButton>
          {editar && (
            <LinkButton href={`/turmas/${turma.id}/editar`} variante="secundario">
              <Pencil className="size-4" aria-hidden /> Editar turma
            </LinkButton>
          )}
          {podeMatricular && (
            <LinkButton href={`/matriculas/nova?turmaId=${turma.id}`}>
              <UserPlus className="size-4" aria-hidden /> Matricular formando
            </LinkButton>
          )}
        </div>
      </div>

      {aviso && <Alerta tipo="aviso">{aviso}</Alerta>}

      {/* Alerta Automático de Risco de Desistência (2+ faltas consecutivas) */}
      {alunosEmRiscoAbandono.length > 0 && (
        <Alerta tipo="aviso">
          <div className="space-y-2">
            <div className="font-semibold text-[#1C1D21]">
              Alerta de retenção pedagógica — {alunosEmRiscoAbandono.length} formando(s) com 2 ou mais faltas consecutivas:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {alunosEmRiscoAbandono.map(({ m, assiduidade }) => {
                const msg = `Olá ${m.formando.nome.split(" ")[0]}, notámos a sua ausência nas últimas ${assiduidade.faltasSeguidas} sessões da turma ${turma.codigo} (${turma.formacao.nome}). Está tudo bem consigo? Conte connosco para apoiar o seu acompanhamento.`;
                return (
                  <div
                    key={m.id}
                    className="inline-flex flex-wrap items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-3 py-1 text-xs shadow-2xs"
                  >
                    <span className="font-semibold text-[#1C1D21]">{m.formando.nome}</span>
                    <span className="rounded-full bg-[#FDECEB] px-2 py-0.5 text-[11px] font-bold text-[#B42318]">
                      {assiduidade.faltasSeguidas} faltas seguidas
                    </span>
                    <a
                      href={`${linkWhatsapp(m.formando.whatsapp)}?text=${encodeURIComponent(msg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> Contactar WhatsApp
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </Alerta>
      )}

      {/* Bloco Editorial de Métricas + 3 Pílulas Horizontais Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)] space-y-5">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs font-medium text-slate-500">Formandos inscritos</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {inscritos}{" "}
              <span className="text-sm font-medium text-slate-500">
                {turma.vagas ? `de ${turma.vagas} vagas` : "inscrito(s)"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Carga agendada</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {horasAgendadas.toLocaleString("pt-AO", { maximumFractionDigits: 1 })} h{" "}
              <span className="text-sm font-medium text-slate-500">de {turma.formacao.cargaHoraria} h</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Propina da turma</div>
            <div className="mt-1 text-2xl font-light tracking-tight text-[#1C1D21] sm:text-3xl">
              {formatKz(preco)}
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Ocupação de vagas</span>
              <span className="font-semibold text-[#1C1D21]">
                {turma.vagas ? `${pctOcupacao}%` : `${inscritos} inscrito(s)`}
              </span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span>Inscritos ativos</span>
              <span>
                {inscritos}
                {turma.vagas ? ` / ${turma.vagas}` : ""}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Execução de aulas</span>
              <span className="font-semibold text-[#1C1D21]">{sessoesValidas.length} sessão(ões)</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span>Sessões realizadas</span>
              <span>
                {sessoesRealizadas} de {sessoesValidas.length}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Disponibilidade</span>
              <span className="font-semibold text-[#1C1D21]">
                {vagasRestantes !== null ? `${vagasRestantes} vaga(s)` : "Aberta"}
              </span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span>Vagas livres</span>
              <span>{vagasRestantes !== null ? vagasRestantes : "Sem limite"}</span>
            </div>
          </div>
        </div>

        {/* Barra de ocupação de dois tons */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
          <div className="bg-[#FBD34D]" style={{ width: `${pctOcupacao}%` }} />
          <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctOcupacao)}%` }} />
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas (Tabelas à esquerda + Ficha da Turma sempre presente à direita) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Esquerda */}
        <div className="min-w-0 space-y-6">
          {/* 1. Sessões Agendadas */}
          <Card>
            <CardHeader
              titulo={`Calendário de Sessões (${turma.sessoes.length})`}
              descricao={`${horasAgendadas.toLocaleString("pt-AO", { maximumFractionDigits: 1 })} h agendadas de ${turma.formacao.cargaHoraria} h previstas`}
            />
            {turma.sessoes.length === 0 ? (
              <Vazio>Ainda não há sessões agendadas para esta turma.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data e Horário</Th>
                    <Th>Formador · Sala</Th>
                    <Th>Estado / Chamada</Th>
                    <Th className="text-right">Ações</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={4}>
                  {turma.sessoes.map((s) => {
                    const numPresentes = s.presencas.filter((p) => p.estado !== "FALTA").length;
                    return (
                      <tr key={s.id} className={s.estado === "CANCELADA" ? "opacity-60" : undefined}>
                        <Td className="whitespace-nowrap">
                          <div className="font-semibold text-[#1C1D21] capitalize">{formatDiaSemana(s.inicio)}</div>
                          <div className="text-xs text-slate-500">
                            {formatHora(s.inicio)} – {formatHora(s.fim)}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                              {iniciais(s.formador.nome)}
                            </span>
                            <div className="min-w-0">
                              {pode(user.perfil, "formadores:ver") ? (
                                <Link
                                  href={`/formadores/${s.formador.id}`}
                                  className="block truncate font-semibold text-[#1C1D21] hover:underline"
                                >
                                  {s.formador.nome}
                                </Link>
                              ) : (
                                <span className="block truncate font-semibold text-[#1C1D21]">{s.formador.nome}</span>
                              )}
                              <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <DoorOpen className="size-3" aria-hidden /> {s.sala.nome}
                              </div>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <BadgeSessao estado={s.estado} />
                            {s.presencas.length > 0 && (
                              <Badge cor="verde">
                                {numPresentes}/{s.presencas.length} pres.
                              </Badge>
                            )}
                          </div>
                          {s.horasLecionadas !== null && (
                            <div className="mt-1 text-xs font-medium text-slate-600">
                              {Number(s.horasLecionadas)} h lecionadas
                            </div>
                          )}
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {s.estado !== "CANCELADA" && (
                              <Link
                                href={`/turmas/${turma.id}/sessoes/${s.id}`}
                                className="inline-flex h-8 items-center gap-1 rounded-full border border-[#DDD9CE] bg-[#FAF9F5] px-2.5 text-xs font-semibold text-[#1C1D21] transition-colors hover:border-[#FBD34D] hover:bg-[#FBD34D]/40"
                              >
                                <ClipboardCheck className="size-3.5" aria-hidden />
                                {editar ? "Chamada" : "Ver chamada"}
                              </Link>
                            )}
                            {editar && s.estado === "AGENDADA" && (
                              <>
                                <form action={alterarEstadoSessao} className="flex items-center gap-1">
                                  <input type="hidden" name="sessaoId" value={s.id} />
                                  <input type="hidden" name="estado" value="REALIZADA" />
                                  <input
                                    name="horasLecionadas"
                                    inputMode="decimal"
                                    aria-label="Horas lecionadas"
                                    placeholder={String((s.fim.getTime() - s.inicio.getTime()) / 3_600_000)}
                                    className="h-8 w-12 rounded-lg border border-[#DDD9CE] bg-white px-1 text-center text-xs"
                                  />
                                  <BotaoMini>Realizada</BotaoMini>
                                </form>
                                <AcaoEstado id={s.id} estado="CANCELADA">
                                  Cancelar
                                </AcaoEstado>
                              </>
                            )}
                            {editar && s.estado === "REALIZADA" && (
                              <AcaoEstado id={s.id} estado="AGENDADA">
                                Desfazer
                              </AcaoEstado>
                            )}
                            {editar && s.estado === "CANCELADA" && (
                              <>
                                <AcaoEstado id={s.id} estado="AGENDADA">
                                  Reativar
                                </AcaoEstado>
                                <form action={apagarSessao}>
                                  <input type="hidden" name="sessaoId" value={s.id} />
                                  <BotaoMini perigo>Apagar</BotaoMini>
                                </form>
                              </>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>

          {/* 2. Formandos Inscritos */}
          <Card>
            <CardHeader
              titulo={`Formandos Inscritos (${inscritos})`}
              descricao={`${inscritos}${turma.vagas ? ` de ${turma.vagas} vagas preenchidas` : " formandos matriculados"} · Assiduidade mín. certificado: ${cfg.minAssiduidadeCertificadoPct}%`}
              acoes={lotada ? <Badge cor="amarelo">Turma completa</Badge> : undefined}
            />
            {inscritos === 0 ? (
              <Vazio>Ainda não há formandos inscritos nesta turma.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Assiduidade</Th>
                    {verPagamentos && <Th className="text-right">Situação Financeira</Th>}
                    <Th className="text-right">Certificado / Ações</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={verPagamentos ? 4 : 3}>
                  {matriculasEnriquecidas.map(({ m, resumo: r, assiduidade, elegibilidade }) => {
                    const turmaOuMatriculaConcluida = m.estado === "CONCLUIDA" || turma.estado === "CONCLUIDA";
                    const certAtivo = m.certificado && !m.certificado.revogadoEm ? m.certificado : null;
                    const corAssiduidade =
                      assiduidade.sessoesComChamada === 0
                        ? "cinza"
                        : assiduidade.assiduidadePct >= cfg.minAssiduidadeCertificadoPct
                          ? "verde"
                          : "vermelho";

                    return (
                      <tr key={m.id}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                r.parcelasEmAtraso > 0 || assiduidade.alertaFaltasSeguidas
                                  ? "bg-[#FCE9E7] text-[#9E2A2B]"
                                  : "bg-[#FBD34D] text-[#1C1D21]"
                              }`}
                            >
                              {iniciais(m.formando.nome)}
                            </span>
                            <div className="min-w-0">
                              {podeVerFormandos ? (
                                <Link
                                  href={`/formandos/${m.formando.id}`}
                                  className="block truncate font-semibold text-[#1C1D21] hover:underline"
                                >
                                  {m.formando.nome}
                                </Link>
                              ) : (
                                <span className="block truncate font-semibold text-[#1C1D21]">{m.formando.nome}</span>
                              )}
                              <div className="truncate font-mono text-[11px] text-slate-500">
                                {m.formando.whatsapp}
                                {m.formando.profissao ? ` · ${m.formando.profissao}` : ""}
                              </div>
                            </div>
                          </div>
                        </Td>

                        <Td className="whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <Badge cor={corAssiduidade}>
                              {assiduidade.sessoesComChamada === 0
                                ? "Sem chamada"
                                : `${assiduidade.assiduidadePct}% (${assiduidade.presencas + assiduidade.justificadas}/${assiduidade.sessoesComChamada})`}
                            </Badge>
                            {assiduidade.alertaFaltasSeguidas && (
                              <span className="text-[11px] font-bold text-[#B42318]">
                                {assiduidade.faltasSeguidas} faltas seguidas
                              </span>
                            )}
                          </div>
                        </Td>

                        {verPagamentos && (
                          <Td className="text-right whitespace-nowrap">
                            {r.divida === 0n ? (
                              <Badge cor="verde">Plano pago</Badge>
                            ) : (
                              <div className="inline-flex flex-col items-end">
                                <Badge cor={r.parcelasEmAtraso > 0 ? "vermelho" : "amarelo"}>
                                  {r.parcelasEmAtraso > 0
                                    ? `${r.parcelasEmAtraso} em atraso`
                                    : `${r.parcelasEmFalta} em falta`}
                                </Badge>
                                <span className="mt-1 text-xs font-bold text-[#1C1D21]">{formatKz(r.divida)}</span>
                              </div>
                            )}
                          </Td>
                        )}

                        <Td className="text-right whitespace-nowrap">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {certAtivo ? (
                              podeVerFormandos ? (
                                <Link
                                  href={`/formandos/${m.formando.id}/certificado/${m.id}`}
                                  className="inline-flex h-8 items-center gap-1 rounded-full bg-[#E7F4E8] px-2.5 text-xs font-semibold text-[#1E6332] transition-colors hover:bg-[#d5ecd7]"
                                  title={`Certificado ${certAtivo.codigo}`}
                                >
                                  <Award className="size-3.5" aria-hidden /> {certAtivo.codigo}
                                </Link>
                              ) : (
                                <Badge cor="verde">{certAtivo.codigo}</Badge>
                              )
                            ) : turmaOuMatriculaConcluida && elegibilidade.elegivel ? (
                              podeGerirCertificados ? (
                                <form
                                  action={async () => {
                                    "use server";
                                    const res = await emitirCertificadoInternoAction(turma.id, m.id);
                                    if (res?.erro) {
                                      redirect(`/turmas/${turma.id}?aviso=${encodeURIComponent(res.erro)}`);
                                    }
                                  }}
                                >
                                  <button
                                    type="submit"
                                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-[#FBD34D] px-3 text-xs font-bold text-[#1C1D21] shadow-2xs transition-colors hover:bg-[#f5c82e]"
                                  >
                                    <Award className="size-3.5" aria-hidden /> Emitir Certificado
                                  </button>
                                </form>
                              ) : podeVerFormandos ? (
                                <Link
                                  href={`/formandos/${m.formando.id}/certificado/${m.id}`}
                                  className="inline-flex h-8 items-center gap-1 rounded-full bg-[#E7F4E8] px-2.5 text-xs font-semibold text-[#1E6332]"
                                >
                                  <Award className="size-3.5" aria-hidden /> Elegível
                                </Link>
                              ) : (
                                <Badge cor="verde">Elegível</Badge>
                              )
                            ) : turmaOuMatriculaConcluida ? (
                              <span
                                title={elegibilidade.motivosBloqueio.join(" ")}
                                className="inline-flex h-8 items-center rounded-full bg-[#FEF3C7] px-2.5 text-[11px] font-semibold text-[#92400E]"
                              >
                                {r.divida > 0n
                                  ? "Cert. retido (dívida)"
                                  : assiduidade.assiduidadePct < cfg.minAssiduidadeCertificadoPct
                                    ? "Assid. insuficiente"
                                    : "Aguarda fecho"}
                              </span>
                            ) : null}

                            {verPagamentos && podeRegistarPagamento && r.divida > 0n && m.estado === "ATIVA" && (
                              <Link
                                href={`/formandos/${m.formando.id}/pagamento?matriculaId=${m.id}`}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1C1D21] px-2.5 text-xs font-semibold text-white hover:bg-[#2A2C32]"
                              >
                                <CreditCard className="size-3 text-[#FBD34D]" aria-hidden /> Receber
                              </Link>
                            )}
                            <a
                              href={linkWhatsapp(m.formando.whatsapp)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-full border border-[#DDD9CE] bg-white px-2.5 text-xs font-medium text-[#1C1D21] hover:bg-[#F5F4EF]"
                            >
                              <MessageCircle className="size-3.5 text-emerald-600" aria-hidden /> WhatsApp
                            </a>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>

        {/* Coluna Direita (350px) — Ficha da Turma (sempre visível) + Agendar Sessão (se editar) */}
        <div className="space-y-5">
          {/* Ficha da Turma com Linhas Pontilhadas (Referência 2) */}
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] font-mono text-xs font-bold text-[#FBD34D]">
                {turma.codigo.slice(0, 3)}
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-[#1C1D21]">Ficha da Turma</div>
                <div className="truncate text-xs text-slate-500">{turma.formacao.nome}</div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline">
                <span className="text-slate-500">Código</span>
                <span className="leader-dots" />
                <span className="font-mono font-bold text-[#1C1D21]">{turma.codigo}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Propina</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{formatKz(preco)}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Carga prevista</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{turma.formacao.cargaHoraria} h</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Horas agendadas</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {horasAgendadas.toLocaleString("pt-AO", { maximumFractionDigits: 1 })} h
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Assiduidade mín.</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{cfg.minAssiduidadeCertificadoPct}%</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Inscritos</span>
                <span className="leader-dots" />
                <span className="font-bold text-emerald-700">
                  {inscritos}
                  {turma.vagas ? ` / ${turma.vagas}` : ""}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Próxima sessão</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {proximaSessao ? formatDiaSemana(proximaSessao.inicio) : "Sem agenda"}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {podeMatricular && (
                <Link
                  href={`/matriculas/nova?turmaId=${turma.id}`}
                  className="flex flex-col justify-between rounded-2xl bg-[#FBD34D]/25 p-3 transition-colors hover:bg-[#FBD34D]/40"
                >
                  <UsersRound className="size-4 text-[#1C1D21]" aria-hidden />
                  <div className="mt-2">
                    <div className="text-xs font-bold text-[#1C1D21]">Matricular</div>
                    <div className="text-[11px] text-slate-600">Inscrever formando</div>
                  </div>
                </Link>
              )}
              <Link
                href={`/turmas/${turma.id}/folha-presencas`}
                className="flex flex-col justify-between rounded-2xl bg-[#FAF9F5] border border-[#E5E3DC] p-3 transition-colors hover:bg-[#ECEAE2]"
              >
                <FileSpreadsheet className="size-4 text-[#1C1D21]" aria-hidden />
                <div className="mt-2">
                  <div className="text-xs font-bold text-[#1C1D21]">Pauta A4</div>
                  <div className="text-[11px] text-slate-500">INEFOP e sala</div>
                </div>
              </Link>
              <Link
                href={`/formacoes/${turma.formacao.id}`}
                className={`flex flex-col justify-between rounded-2xl bg-[#F6F5F0] p-3 transition-colors hover:bg-[#ECEAE2] ${podeMatricular ? "col-span-2" : ""}`}
              >
                <BookOpen className="size-4 text-[#1C1D21]" aria-hidden />
                <div className="mt-2">
                  <div className="text-xs font-bold text-[#1C1D21]">Ver Formação</div>
                  <div className="text-[11px] text-slate-500">Catálogo do curso</div>
                </div>
              </Link>
            </div>
          </div>

          {editar && (
            <Card>
              <CardHeader
                titulo="Agendar Sessão"
                descricao="Turma, formador e sala são validados contra conflitos de horário."
              />
              <div className="p-4">
                <SessaoForm turmaId={turma.id} formadores={formadores} salas={salas} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BotaoMini({ children, perigo }: { children: React.ReactNode; perigo?: boolean }) {
  return (
    <button
      type="submit"
      className={`inline-flex h-8 items-center rounded-full px-2.5 text-xs font-medium ${
        perigo ? "text-red-700 hover:bg-red-50" : "text-[#1C1D21] hover:bg-[#F5F4EF]"
      }`}
    >
      {children}
    </button>
  );
}

function AcaoEstado({ id, estado, children }: { id: string; estado: string; children: React.ReactNode }) {
  return (
    <form action={alterarEstadoSessao}>
      <input type="hidden" name="sessaoId" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <BotaoMini perigo={estado === "CANCELADA"}>{children}</BotaoMini>
    </form>
  );
}
