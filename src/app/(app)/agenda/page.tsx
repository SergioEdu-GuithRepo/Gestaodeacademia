import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { diaLocal, formatDiaSemana, formatHora, formatMes, hojeLocal, instanteLocal } from "@/lib/datas";
import { formatHoras, totalHoras } from "@/lib/precos-formador";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { AgendaFiltros } from "./filtros";

export const metadata = { title: "Calendário" };

const CORES = [
  "bg-[#1C1D21] border-[#FBD34D] text-white",
  "bg-[#FBD34D]/45 border-[#1C1D21] text-[#1C1D21]",
  "bg-[#EEF4FB] border-[#2B579A] text-[#1D3E6E]",
  "bg-[#EAF5EE] border-[#216E39] text-[#174E2B]",
  "bg-[#FAF9F5] border-zinc-500 text-zinc-900",
  "bg-[#FEF5E7] border-[#B9770E] text-[#784212]",
];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function isoDia(a: number, m: number, d: number) {
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; vista?: string; id?: string }>;
}) {
  const { user, db } = await exigir("agenda:ver");
  const podeEditar = pode(user.perfil, "agenda:editar");
  const sp = await searchParams;

  const hoje = hojeLocal();
  const [ah, mh] = hoje.split("-").map(Number);
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? "");
  const ano = m ? Number(m[1]) : ah;
  const mes = m ? Math.min(Math.max(Number(m[2]), 1), 12) : mh;

  const inicioMes = instanteLocal(isoDia(ano, mes, 1), "00:00");
  const [anoSeg, mesSeg] = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  const [anoAnt, mesAnt] = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
  const fimMes = instanteLocal(isoDia(anoSeg, mesSeg, 1), "00:00");

  const filtro: Prisma.SessaoWhereInput = {};
  if (sp.id && sp.vista === "formador") filtro.formadorId = sp.id;
  if (sp.id && sp.vista === "sala") filtro.salaId = sp.id;
  if (sp.id && sp.vista === "turma") filtro.turmaId = sp.id;

  const [sessoes, formadores, salas, turmas] = await Promise.all([
    db.sessao.findMany({
      where: { ...filtro, estado: { not: "CANCELADA" }, inicio: { lt: fimMes }, fim: { gt: inicioMes } },
      orderBy: { inicio: "asc" },
      include: {
        turma: { select: { id: true, codigo: true, formacao: { select: { id: true, nome: true } } } },
        formador: { select: { id: true, nome: true } },
        sala: { select: { id: true, nome: true } },
      },
    }),
    db.formador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.sala.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.turma.findMany({
      where: { estado: { in: ["PLANEADA", "EM_CURSO"] } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, formacao: { select: { nome: true } } },
    }),
  ]);

  // Cor estável por turma
  const corTurma = new Map<string, string>();
  for (const s of sessoes) {
    if (!corTurma.has(s.turma.id)) {
      corTurma.set(s.turma.id, CORES[corTurma.size % CORES.length]);
    }
  }

  const porDia = new Map<string, typeof sessoes>();
  for (const s of sessoes) {
    const k = diaLocal(s.inicio);
    porDia.set(k, [...(porDia.get(k) ?? []), s]);
  }

  // Grelha mensal começando à segunda-feira
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaSemana1 = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7; // 0 = segunda
  const celulas: (string | null)[] = [
    ...Array.from({ length: diaSemana1 }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => isoDia(ano, mes, i + 1)),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);

  const qs = (a: number, mm: number) => {
    const p = new URLSearchParams();
    p.set("mes", `${a}-${String(mm).padStart(2, "0")}`);
    if (sp.vista) p.set("vista", sp.vista);
    if (sp.id) p.set("id", sp.id);
    return `?${p.toString()}`;
  };

  const detalhe = (s: (typeof sessoes)[number]) =>
    sp.vista === "formador"
      ? s.sala.nome
      : sp.vista === "sala"
        ? s.formador.nome
        : `${s.formador.nome} · ${s.sala.nome}`;

  const agendadasCount = sessoes.filter((s) => s.estado === "AGENDADA").length;
  const realizadasCount = sessoes.filter((s) => s.estado === "REALIZADA").length;
  const turmasDistintas = corTurma.size;
  const horasNoMes = totalHoras(sessoes);

  const somaBase = Math.max(1, agendadasCount + realizadasCount + turmasDistintas);
  const pctAgendadas = Math.max(25, Math.round((agendadasCount * 100) / somaBase));
  const pctRealizadas = Math.max(20, Math.round((realizadasCount * 100) / somaBase));
  const pctTurmas = Math.max(15, 100 - pctAgendadas - pctRealizadas);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Calendário de Aulas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Planeamento mensal de sessões por turma, formador ou sala
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Suspense>
            <AgendaFiltros
              formadores={formadores}
              salas={salas}
              turmas={turmas.map((t) => ({ id: t.id, nome: `${t.codigo} — ${t.formacao.nome}` }))}
            />
          </Suspense>
          {podeEditar && (
            <LinkButton href="/turmas/nova">
              <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova turma
            </LinkButton>
          )}
        </div>
      </div>

      {/* Bloco de Métrica Editorial + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">
              Sessões programadas em {formatMes(ano, mes)} / Carga horária mensal
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {sessoes.length} {sessoes.length === 1 ? "sessão" : "sessões"}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-700 sm:text-3xl">
                {formatHoras(horasNoMes)}
              </span>
            </div>
          </div>

          <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
            {turmasDistintas} {turmasDistintas === 1 ? "turma com aulas no mês" : "turmas com aulas no mês"}
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: pctAgendadas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Sessões agendadas</span>
              <span className="font-semibold text-zinc-800">{agendadasCount} aula(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>Por lecionar</span>
              <span>{pctAgendadas}%</span>
            </div>
          </div>

          <div style={{ flex: pctRealizadas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Sessões realizadas</span>
              <span className="font-semibold text-zinc-800">{realizadasCount} concluída(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Concluídas</span>
              <span>{pctRealizadas}%</span>
            </div>
          </div>

          <div style={{ flex: pctTurmas }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Turmas ativas no mês</span>
              <span className="font-semibold text-zinc-700">{turmasDistintas} turma(s)</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Edições</span>
              <span>{pctTurmas}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Mensal Editorial (Inspirada na Referência 2) */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-1.5">
            <Link
              href={qs(anoAnt, mesAnt)}
              className="flex size-9 items-center justify-center rounded-full bg-[#FAF9F5] text-zinc-700 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={qs(anoSeg, mesSeg)}
              className="flex size-9 items-center justify-center rounded-full bg-[#FAF9F5] text-zinc-700 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]"
              aria-label="Mês seguinte"
            >
              <ChevronRight className="size-4" />
            </Link>
            <h2 className="ml-2 text-lg font-bold capitalize tracking-tight text-zinc-900">
              {formatMes(ano, mes)}
            </h2>
          </div>
          <LinkButton href={qs(ah, mh)} variante="secundario" className="min-h-9">
            Mês atual
          </LinkButton>
        </div>

        {/* Grelha (tablet/desktop) */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 border-b border-zinc-100 bg-[#FAF9F5] text-center text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-2.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map((dia, i) => (
              <div
                key={i}
                className={cn(
                  "min-h-32 border-r border-b border-zinc-100 p-2 [&:nth-child(7n)]:border-r-0",
                  !dia && "bg-[#FAF9F5]/60",
                  dia === hoje && "bg-[#FBD34D]/10",
                )}
              >
                {dia && (
                  <>
                    <div
                      className={cn(
                        "mb-1.5 flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        dia === hoje
                          ? "bg-[#1C1D21] font-bold text-[#FBD34D]"
                          : "text-zinc-500",
                      )}
                    >
                      {Number(dia.slice(8))}
                    </div>
                    <div className="space-y-1.5">
                      {(porDia.get(dia) ?? []).map((s) => (
                        <Link
                          key={s.id}
                          href={`/turmas/${s.turma.id}`}
                          title={`${s.turma.formacao.nome} (${s.turma.codigo}) — ${s.formador.nome}, ${s.sala.nome}`}
                          className={cn(
                            "block rounded-xl border-l-3 px-2 py-1 text-[11px] leading-tight transition-transform hover:scale-[1.01]",
                            corTurma.get(s.turma.id),
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold">{formatHora(s.inicio)}</span>
                            <span className="truncate font-semibold opacity-90">{s.turma.codigo}</span>
                          </div>
                          <div className="mt-0.5 truncate opacity-75">{detalhe(s)}</div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabela Diretório Cronológica das Sessões do Mês (10 em 10) */}
      <Card>
        <CardHeader
          titulo={`Lista de Sessões de ${formatMes(ano, mes)} (${sessoes.length})`}
          descricao="Vista detalhada das sessões do mês selecionado."
        />
        {sessoes.length === 0 ? (
          <Vazio>Sem sessões registadas neste mês.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data / Hora</Th>
                <Th>Formação / Turma</Th>
                <Th>Formador</Th>
                <Th>Sala</Th>
                <Th>Estado</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <TbodyProgressivo passo={10} colSpan={6}>
              {sessoes.map((s) => (
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
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/salas/${s.sala.id}`}
                      className="rounded-full bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-[#FBD34D]/30"
                    >
                      {s.sala.nome}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Badge cor={s.estado === "REALIZADA" ? "verde" : "azul"}>
                      {s.estado === "REALIZADA" ? "Realizada" : "Agendada"}
                    </Badge>
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
    </div>
  );
}
