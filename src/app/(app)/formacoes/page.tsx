import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Plus, UsersRound } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Button, Card, LinkButton, Select, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";

export const metadata = { title: "Formações" };

type SP = Promise<Record<string, string | string[] | undefined>>;

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function FormacoesPage({ searchParams }: { searchParams: SP }) {
  const { user, db } = await exigir("formacoes:ver");
  const editar = pode(user.perfil, "formacoes:editar");
  const sp = await searchParams;
  const estado = param(sp.estado); // "" | "ativas" | "inativas"
  const categoria = param(sp.categoria);

  const where: Prisma.FormacaoWhereInput = {};
  if (estado === "ativas") where.ativa = true;
  if (estado === "inativas") where.ativa = false;
  if (categoria === "COMPORTAMENTAL" || categoria === "TECNICA") where.categoria = categoria;

  const formacoes = await db.formacao.findMany({
    where,
    orderBy: [{ ativa: "desc" }, { nome: "asc" }],
    include: { _count: { select: { turmas: true } } },
  });
  const filtrado = estado !== "" || categoria !== "";

  const totalAtivas = formacoes.filter((f) => f.ativa).length;
  const totalTecnicas = formacoes.filter((f) => f.categoria === "TECNICA").length;
  const totalComportamentais = formacoes.filter((f) => f.categoria === "COMPORTAMENTAL").length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Catálogo do Centro · Cursos e Preçário
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            Formações
          </h1>
        </div>
        {editar && (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/formacoes/nova">
              <Plus className="size-4" aria-hidden /> Nova formação
            </LinkButton>
          </div>
        )}
      </div>

      {/* Bloco Editorial + 3 Pílulas Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs font-medium text-slate-500">Catálogo visível</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {formacoes.length}{" "}
              <span className="text-sm font-medium text-slate-500">formações</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Formações ativas</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {totalAtivas}{" "}
              <span className="text-sm font-medium text-emerald-700">disponíveis</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <Link href="/formacoes?estado=ativas" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Formações ativas</span>
              <span className="font-semibold text-[#1C1D21]">{totalAtivas}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21] transition-transform group-hover:scale-[1.01]">
              <span>Ativas no catálogo</span>
              <span>{totalAtivas}</span>
            </div>
          </Link>

          <Link href="/formacoes?categoria=TECNICA" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Categoria Técnica</span>
              <span className="font-semibold text-[#1C1D21]">{totalTecnicas}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white transition-transform group-hover:scale-[1.01]">
              <span>Formações Técnicas</span>
              <span>{totalTecnicas}</span>
            </div>
          </Link>

          <Link href="/formacoes?categoria=COMPORTAMENTAL" className="group block">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Categoria Comportamental</span>
              <span className="font-semibold text-[#1C1D21]">{totalComportamentais}</span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21] transition-transform group-hover:scale-[1.01]">
              <span>Comportamentais</span>
              <span>{totalComportamentais}</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-slate-600">Estado</span>
            <Select name="estado" defaultValue={estado} className="sm:w-40">
              <option value="">Todas</option>
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-slate-600">Categoria</span>
            <Select name="categoria" defaultValue={categoria} className="sm:w-48">
              <option value="">Todas</option>
              <option value="COMPORTAMENTAL">Comportamental</option>
              <option value="TECNICA">Técnica</option>
            </Select>
          </label>
          <div className="col-span-2 flex gap-2">
            <Button type="submit" variante="secundario" className="flex-1 sm:flex-none">
              Filtrar
            </Button>
            {filtrado && (
              <LinkButton href="/formacoes" variante="fantasma">
                Limpar
              </LinkButton>
            )}
          </div>
        </form>
      </Card>

      {formacoes.length === 0 ? (
        <Card>
          <Vazio>{filtrado ? "Nenhuma formação corresponde aos filtros." : "Ainda não há formações no catálogo."}</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {formacoes.map((f) => (
            <Link
              key={f.id}
              href={`/formacoes/${f.id}`}
              className="group flex flex-col justify-between rounded-[24px] border border-[#E5E3DC] bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#1C1D21]/30 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge cor={f.categoria === "TECNICA" ? "azul" : "amarelo"}>
                    {NOMES_CATEGORIA[f.categoria]}
                  </Badge>
                  {f.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
                </div>

                <div className="mt-3.5 flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D] transition-colors group-hover:bg-[#FBD34D] group-hover:text-[#1C1D21]">
                    <BookOpen className="size-4.5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[#1C1D21] group-hover:underline">{f.nome}</h3>
                    {f.descricao ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{f.descricao}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Sem descrição adicional</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#F8F7F3] p-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Clock className="size-3.5 text-slate-400" aria-hidden />
                    <span>
                      Carga: <strong className="text-[#1C1D21]">{f.cargaHoraria} h</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <UsersRound className="size-3.5 text-slate-400" aria-hidden />
                    <span>
                      Turmas: <strong className="text-[#1C1D21]">{f._count.turmas}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-dotted border-[#E2E0D8] pt-3">
                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase">Preço base</div>
                  <div className="text-base font-bold text-[#1C1D21]">{formatKz(f.preco)}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1C1D21] group-hover:translate-x-0.5 transition-transform">
                  Ver formação <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </Link>
          ))}
        </GrelhaProgressiva>
      )}
    </div>
  );
}

