import Link from "next/link";
import { ArrowUpRight, CalendarDays, DoorOpen, Plus, Users } from "lucide-react";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, LinkButton, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { pode } from "@/lib/rbac";

export const metadata = { title: "Salas" };

export default async function SalasPage() {
  const { user, db } = await exigir("salas:ver");
  const editar = pode(user.perfil, "formacoes:editar");
  const agora = new Date();

  const salas = await db.sala.findMany({
    orderBy: [{ ativa: "desc" }, { nome: "asc" }],
    include: {
      _count: {
        select: {
          sessoes: { where: { estado: "AGENDADA", inicio: { gte: agora } } },
        },
      },
    },
  });

  const salasAtivas = salas.filter((s) => s.ativa).length;
  const capacidadeTotal = salas.filter((s) => s.ativa).reduce((acc, s) => acc + (s.capacidade ?? 0), 0);
  const totalSessoesAgendadas = salas.reduce((acc, s) => acc + s._count.sessoes, 0);
  const maxCap = Math.max(25, ...salas.map((s) => s.capacidade ?? 20));

  const somaBase = Math.max(1, salasAtivas * 10 + totalSessoesAgendadas * 5 + Math.round(capacidadeTotal / 2));
  const pctAtivas = Math.max(25, Math.min(50, Math.round((salasAtivas * 10 * 100) / somaBase)));
  const pctSessoes = Math.max(20, Math.min(45, Math.round((totalSessoesAgendadas * 5 * 100) / somaBase)));
  const pctCap = Math.max(15, 100 - pctAtivas - pctSessoes);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Salas & Laboratórios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Espaços físicos, lotação máxima instalada e ocupação de aulas agendadas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/agenda?vista=sala" variante="secundario">
            <CalendarDays className="size-4" aria-hidden /> Calendário por sala
          </LinkButton>
          {editar && (
            <LinkButton href="/salas/nova">
              <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova sala
            </LinkButton>
          )}
        </div>
      </div>

      {/* Bloco de Métrica Principal + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">
              Salas ativas disponíveis / Capacidade total instalada
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {salasAtivas} {salasAtivas === 1 ? "sala ativa" : "salas ativas"}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-700 sm:text-3xl">
                {capacidadeTotal} lugares
              </span>
            </div>
          </div>

          <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
            {totalSessoesAgendadas} {totalSessoesAgendadas === 1 ? "sessão futura" : "sessões futuras"}
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: pctAtivas }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Salas operacionais</span>
              <span className="font-semibold text-zinc-800">
                {salasAtivas} de {salas.length}
              </span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>Ativas</span>
              <span>{pctAtivas}%</span>
            </div>
          </div>

          <div style={{ flex: pctSessoes }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Aulas agendadas</span>
              <span className="font-semibold text-zinc-800">{totalSessoesAgendadas} sessão(ões)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Ocupação</span>
              <span>{pctSessoes}%</span>
            </div>
          </div>

          <div style={{ flex: pctCap }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Capacidade total</span>
              <span className="font-semibold text-zinc-700">{capacidadeTotal} lugares</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Lotação</span>
              <span>{pctCap}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Progressiva de Salas (10 em 10) */}
      {salas.length === 0 ? (
        <Card>
          <Vazio>Ainda não há salas registadas.</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} labelItem="salas" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {salas.map((s) => {
            const pctLotacao = s.capacidade ? Math.min(100, Math.round((s.capacidade * 100) / maxCap)) : 50;

            return (
              <div
                key={s.id}
                className="group flex flex-col justify-between rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-[#FBD34D]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
                        <DoorOpen className="size-5" aria-hidden />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-zinc-900">{s.nome}</h3>
                        <p className="text-xs text-zinc-400">Espaço de formação</p>
                      </div>
                    </div>
                    {s.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
                  </div>

                  {/* Barra Bicolor de Capacidade Relativa */}
                  <div className="mt-4 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Lotação do espaço</span>
                      <span className="font-semibold text-zinc-700">
                        {s.capacidade ? `${s.capacidade} lugares` : "Lotação livre"}
                      </span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="bg-[#FBD34D]" style={{ width: `${pctLotacao}%` }} />
                      <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctLotacao)}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-[#FAF9F5] p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-zinc-400" aria-hidden />
                      <div>
                        <div className="text-[11px] text-zinc-400">Capacidade</div>
                        <div className="font-bold text-zinc-900">
                          {s.capacidade ? `${s.capacidade} lugares` : "Sem limite"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-zinc-400" aria-hidden />
                      <div>
                        <div className="text-[11px] text-zinc-400">Próximas aulas</div>
                        <div className="font-bold text-zinc-900">{s._count.sessoes} agendada(s)</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3.5 text-xs">
                  <Link
                    href={`/agenda?vista=sala&id=${s.id}`}
                    className="font-semibold text-zinc-600 hover:text-zinc-900 hover:underline"
                  >
                    Ver agenda da sala
                  </Link>
                  {editar && (
                    <Link
                      href={`/salas/${s.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F5] px-3 py-1.5 font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D] hover:text-[#1C1D21]"
                    >
                      Gerir sala <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </GrelhaProgressiva>
      )}
    </div>
  );
}
