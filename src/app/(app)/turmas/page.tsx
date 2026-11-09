import Link from "next/link";
import { ArrowRight, CalendarDays, DoorOpen, Plus, UsersRound } from "lucide-react";
import type { EstadoTurma, Prisma } from "@prisma/client";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Button, Card, LinkButton, Select, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatDataHora } from "@/lib/datas";
import { pode } from "@/lib/rbac";
import { BadgeTurma, ESTADOS_TURMA } from "./rotulos";

export const metadata = { title: "Turmas" };

export default async function TurmasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; formacao?: string }>;
}) {
  const { user, db } = await exigir("agenda:ver");
  const sp = await searchParams;
  const estado = sp.estado && sp.estado in ESTADOS_TURMA ? (sp.estado as EstadoTurma) : undefined;
  const where: Prisma.TurmaWhereInput = {
    ...(estado ? { estado } : { estado: { in: ["PLANEADA", "EM_CURSO"] } }),
    ...(sp.formacao ? { formacaoId: sp.formacao } : {}),
  };
  const agora = new Date();

  const [turmas, formacoes] = await Promise.all([
    db.turma.findMany({
      where,
      orderBy: [{ estado: "asc" }, { codigo: "asc" }],
      include: {
        formacao: { select: { nome: true } },
        _count: {
          select: {
            matriculas: { where: { estado: { not: "CANCELADA" } } },
            sessoes: { where: { estado: { not: "CANCELADA" } } },
          },
        },
        sessoes: {
          where: { estado: "AGENDADA", inicio: { gte: agora } },
          orderBy: { inicio: "asc" },
          take: 1,
          select: { inicio: true, sala: { select: { nome: true } } },
        },
      },
    }),
    db.formacao.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const totalPlaneadas = turmas.filter((t) => t.estado === "PLANEADA").length;
  const totalEmCurso = turmas.filter((t) => t.estado === "EM_CURSO").length;
  const totalInscritos = turmas.reduce((acc, t) => acc + t._count.matriculas, 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Edições, Vagas & Aulas
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            Turmas
          </h1>
        </div>
        {pode(user.perfil, "agenda:editar") && (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/turmas/nova">
              <Plus className="size-4" aria-hidden /> Nova turma
            </LinkButton>
          </div>
        )}
      </div>

      {/* Bloco Editorial + 3 Pílulas Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs font-medium text-slate-500">Turmas listadas</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {turmas.length}{" "}
              <span className="text-sm font-medium text-slate-500">turma(s)</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Formandos inscritos</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {totalInscritos}{" "}
              <span className="text-sm font-medium text-emerald-700">matrículas ativas</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <Link href="/turmas?estado=PLANEADA" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Planeadas (abertas a inscrição)</span>
              <span className="font-semibold text-[#1C1D21]">{totalPlaneadas}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21] transition-transform group-hover:scale-[1.01]">
              <span>Turmas Planeadas</span>
              <span>{totalPlaneadas}</span>
            </div>
          </Link>

          <Link href="/turmas?estado=EM_CURSO" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Em curso</span>
              <span className="font-semibold text-[#1C1D21]">{totalEmCurso}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white transition-transform group-hover:scale-[1.01]">
              <span>Aulas a decorrer</span>
              <span>{totalEmCurso}</span>
            </div>
          </Link>

          <Link href="/turmas?estado=CONCLUIDA" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Histórico</span>
              <span className="font-semibold text-[#1C1D21]">Ver concluídas</span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21] transition-transform group-hover:scale-[1.01]">
              <span>Turmas Concluídas</span>
              <span>Abrir →</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div className="min-w-44 flex-1 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="estado">
              Estado
            </label>
            <Select id="estado" name="estado" defaultValue={estado ?? ""}>
              <option value="">Ativas (planeadas e em curso)</option>
              {Object.entries(ESTADOS_TURMA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-52 flex-1 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="formacao">
              Formação
            </label>
            <Select id="formacao" name="formacao" defaultValue={sp.formacao ?? ""}>
              <option value="">Todas</option>
              {formacoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variante="secundario">
            Filtrar
          </Button>
          {(estado || sp.formacao) && (
            <LinkButton href="/turmas" variante="fantasma">
              Limpar
            </LinkButton>
          )}
        </form>
      </Card>

      {turmas.length === 0 ? (
        <Card>
          <Vazio>Nenhuma turma encontrada.</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {turmas.map((t) => {
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
                    <BadgeTurma estado={t.estado} />
                  </div>

                  <h3 className="mt-3 font-semibold text-[#1C1D21] group-hover:underline">{t.formacao.nome}</h3>

                  {/* Bloco de Inscritos e Sessões */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-[#F8F7F3] p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <UsersRound className="size-3.5 text-slate-400" aria-hidden />
                        <span>Inscritos</span>
                      </div>
                      <div className="mt-0.5 font-semibold text-[#1C1D21]">
                        {inscritos}
                        {t.vagas ? <span className="font-normal text-slate-500"> / {t.vagas} vagas</span> : null}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
                        <span>Total de aulas</span>
                      </div>
                      <div className="mt-0.5 font-semibold text-[#1C1D21]">{t._count.sessoes} sessão(ões)</div>
                    </div>
                  </div>

                  {/* Barra de ocupação de dois tons (Referência 2) */}
                  <div className="mt-3 rounded-2xl border border-[#ECEAE3] bg-white px-3.5 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Ocupação da turma</span>
                      <span className="font-semibold text-[#1C1D21]">
                        {t.vagas ? `${pctOcupacao}%` : `${inscritos} inscrito(s)`}
                      </span>
                    </div>
                    <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
                      <div className="bg-[#FBD34D]" style={{ width: `${pctOcupacao}%` }} />
                      <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctOcupacao)}%` }} />
                    </div>
                  </div>

                  {/* Próxima sessão */}
                  <div className="mt-2.5 rounded-2xl border border-[#ECEAE3] bg-[#F8F7F3]/60 px-3.5 py-2 text-xs">
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Próxima sessão agendada</div>
                    {t.sessoes[0] ? (
                      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 font-medium text-[#1C1D21]">
                        <span>{formatDataHora(t.sessoes[0].inicio)}</span>
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <DoorOpen className="size-3.5" aria-hidden /> {t.sessoes[0].sala.nome}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-slate-400">Sem sessões futuras agendadas</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-dotted border-[#E2E0D8] pt-3 text-xs">
                  <span className="text-slate-500">Vagas e formandos</span>
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
  );
}

