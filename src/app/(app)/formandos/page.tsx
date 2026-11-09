import type { Prisma } from "@prisma/client";
import { ArrowUpRight, MessageCircle, Plus, Search } from "lucide-react";
import Link from "next/link";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Button, Card, Input, LinkButton, Select, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { linkWhatsapp, metricasFormando } from "@/lib/formandos";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const metadata = { title: "Formandos" };

type Params = Record<string, string | string[] | undefined>;

function um(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "F";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function FormandosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, db } = await exigir("formandos:ver");
  const sp = await searchParams;
  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const podeEditar = pode(user.perfil, "formandos:editar");

  const filtros = {
    q: um(sp.q),
    profissao: um(sp.profissao),
    interesse: um(sp.interesse),
    formacoes: um(sp.formacoes),
    intencao: um(sp.intencao),
    pagamento: um(sp.pagamento),
    atraso: um(sp.atraso) === "1" && verPagamentos ? "1" : "",
  };

  const where: Prisma.FormandoWhereInput = {};
  if (filtros.q) {
    const digitos = filtros.q.replace(/\D/g, "");
    where.OR = [
      { nome: { contains: filtros.q, mode: "insensitive" } },
      ...(digitos.length >= 3 ? [{ whatsapp: { contains: digitos } }] : []),
    ];
  }
  if (filtros.profissao) where.profissao = { equals: filtros.profissao, mode: "insensitive" };
  if (filtros.intencao === "sim") where.intencaoCompra = true;
  if (filtros.intencao === "nao") where.intencaoCompra = false;
  if (filtros.pagamento === "PRONTO" || filtros.pagamento === "PARCELADO") {
    where.formaPagamentoPreferida = filtros.pagamento;
  }

  const [formandos, profissoes] = await Promise.all([
    db.formando.findMany({
      where,
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        whatsapp: true,
        profissao: true,
        intencaoCompra: true,
        formaPagamentoPreferida: true,
        avaliacaoEquipa: true,
        matriculas: {
          select: {
            estado: true,
            createdAt: true,
            parcelas: { select: { valor: true, vencimento: true, alocacoes: { select: { valor: true } } } },
          },
        },
      },
    }),
    db.formando.findMany({
      where: { profissao: { not: null } },
      distinct: ["profissao"],
      select: { profissao: true },
      orderBy: { profissao: "asc" },
    }),
  ]);

  const hoje = dataSimples(hojeLocal());
  const todosMetricas = formandos.map((f) => ({ ...f, m: metricasFormando(f, hoje) }));

  const nMuitoInteresse = todosMetricas.filter((f) => f.m.interesse.nivel === "MUITO").length;
  const nComAtraso = todosMetricas.filter((f) => f.m.resumo.parcelasEmAtraso > 0).length;
  const nRegularizados = Math.max(0, todosMetricas.length - nComAtraso);

  const somaIndicadores = nMuitoInteresse + nRegularizados + nComAtraso || 1;
  const pctInteresse = Math.max(22, Math.round((nMuitoInteresse / somaIndicadores) * 100));
  const pctRegular = Math.max(25, Math.round((nRegularizados / somaIndicadores) * 100));
  const pctAtraso = Math.max(15, 100 - pctInteresse - pctRegular);

  const linhas = todosMetricas.filter(({ m }) => {
    if (filtros.interesse === "muito" && m.interesse.nivel !== "MUITO") return false;
    if (filtros.interesse === "pouco" && m.interesse.nivel !== "POUCO") return false;
    if (
      filtros.formacoes === "3+"
        ? m.formacoesCompradas < 3
        : filtros.formacoes !== "" && m.formacoesCompradas !== Number(filtros.formacoes)
    )
      return false;
    if (filtros.atraso && m.resumo.parcelasEmAtraso === 0) return false;
    return true;
  });

  const filtrado = Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Clientes e Fidelização
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">Formandos</h1>
        </div>
        {podeEditar && (
          <LinkButton href="/formandos/novo" variante="primario">
            <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Novo formando
          </LinkButton>
        )}
      </div>

      {/* Bloco de Métricas Proporcionais + Filtros em Pílula (Referência 3) */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <span className="text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">{linhas.length}</span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">formandos na lista</span>
            </div>
            <span className="text-2xl font-light text-zinc-300">/</span>
            <div>
              <span className="text-2xl font-normal tracking-tight text-emerald-700 sm:text-3xl">
                {nMuitoInteresse}
              </span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">com muito interesse</span>
            </div>
          </div>

          {/* Pílulas de segmento rápido */}
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1">
            <Link
              href="/formandos"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                !filtrado ? "bg-[#1C1D21] text-white shadow-2xs" : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Todos ({todosMetricas.length})
            </Link>
            <Link
              href="/formandos?interesse=muito"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                filtros.interesse === "muito"
                  ? "bg-[#1C1D21] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Muito interesse ({nMuitoInteresse})
            </Link>
            {verPagamentos && (
              <Link
                href="/formandos?atraso=1"
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  filtros.atraso === "1"
                    ? "bg-red-600 text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                Com atraso ({nComAtraso})
              </Link>
            )}
          </div>
        </div>

        {/* 3 Barras Proporcionais em Pílula */}
        <div className="mt-5 flex h-10 w-full items-stretch gap-2 overflow-hidden">
          <Link
            href="/formandos?interesse=muito"
            style={{ width: `${pctInteresse}%` }}
            className="flex min-w-28 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21]"
          >
            <span>Muito interesse</span>
            <span>{nMuitoInteresse}</span>
          </Link>
          <Link
            href="/formandos"
            style={{ width: `${pctRegular}%` }}
            className="flex min-w-28 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white"
          >
            <span>Regularizados</span>
            <span>{nRegularizados}</span>
          </Link>
          <Link
            href={verPagamentos ? "/formandos?atraso=1" : "/formandos"}
            style={{ width: `${pctAtraso}%` }}
            className="bg-hatched flex min-w-24 items-center justify-between rounded-full border border-zinc-300/80 px-4 text-xs font-semibold text-[#1C1D21]"
          >
            <span>Em atraso</span>
            <span>{nComAtraso}</span>
          </Link>
        </div>

        {/* Filtros de Segmentação */}
        <form
          method="get"
          className="mt-5 grid gap-3 border-t border-dotted border-zinc-200 pt-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={filtros.q}
              placeholder="Pesquisar por nome ou WhatsApp…"
              aria-label="Pesquisar por nome ou WhatsApp"
              className="pl-9"
            />
          </div>
          <Select name="profissao" defaultValue={filtros.profissao} aria-label="Profissão">
            <option value="">Todas as profissões</option>
            {profissoes.map((p) => (
              <option key={p.profissao} value={p.profissao ?? ""}>
                {p.profissao}
              </option>
            ))}
          </Select>
          <Select name="interesse" defaultValue={filtros.interesse} aria-label="Nível de interesse">
            <option value="">Qualquer interesse</option>
            <option value="muito">Muito interesse</option>
            <option value="pouco">Pouco interesse</option>
          </Select>
          <Select name="formacoes" defaultValue={filtros.formacoes} aria-label="Formações compradas">
            <option value="">Qualquer n.º de formações</option>
            <option value="0">Nenhuma formação</option>
            <option value="1">1 formação</option>
            <option value="2">2 formações</option>
            <option value="3+">3 ou mais formações</option>
          </Select>
          <Select name="intencao" defaultValue={filtros.intencao} aria-label="Intenção de comprar">
            <option value="">Intenção de comprar: todos</option>
            <option value="sim">Com intenção de comprar</option>
            <option value="nao">Sem intenção de comprar</option>
          </Select>
          <Select name="pagamento" defaultValue={filtros.pagamento} aria-label="Forma de pagamento preferida">
            <option value="">Qualquer forma de pagamento</option>
            <option value="PRONTO">Prefere a pronto</option>
            <option value="PARCELADO">Prefere parcelado</option>
          </Select>
          <div className="flex items-center justify-end gap-2">
            {filtrado && (
              <LinkButton href="/formandos" variante="fantasma">
                Limpar
              </LinkButton>
            )}
            <Button type="submit" variante="primario" className="w-full sm:w-auto">
              Filtrar
            </Button>
          </div>
        </form>
      </div>

      {/* Grelha de Cards de Formandos (10 em 10, estilo Referência 2) */}
      {linhas.length === 0 ? (
        <Card className="p-6">
          <Vazio>{filtrado ? "Nenhum formando corresponde aos filtros." : "Ainda não há formandos registados."}</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {linhas.map((f, idx) => {
            const emAtraso = f.m.resumo.parcelasEmAtraso > 0;
            const temDivida = f.m.resumo.divida > 0n;
            const pctInteresseCard = Math.max(12, Math.min(100, f.m.interesse.pontuacao));

            return (
              <div
                key={f.id}
                className="group flex flex-col justify-between rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:border-zinc-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/formandos/${f.id}`} className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          idx % 2 === 0 ? "bg-[#FBD34D] text-[#1C1D21]" : "bg-[#1C1D21] text-white",
                        )}
                      >
                        {iniciais(f.nome)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-[#1C1D21] group-hover:underline">{f.nome}</h3>
                        <p className="truncate text-xs text-zinc-500">{f.profissao ?? "Formando"}</p>
                      </div>
                    </Link>

                    <Badge cor={f.m.interesse.nivel === "MUITO" ? "verde" : "cinza"}>
                      {f.m.interesse.nivel === "MUITO" ? "Muito interesse" : "Pouco interesse"}
                    </Badge>
                  </div>

                  {/* Barra bicolor estilo Referência 2 + Resumo */}
                  <div className="mt-4 rounded-2xl bg-[#FAF9F5] p-3.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">
                        Formações: <strong className="text-[#1C1D21]">{f.m.formacoesCompradas}</strong>
                      </span>
                      {verPagamentos ? (
                        temDivida ? (
                          <span className={cn("font-semibold", emAtraso ? "text-red-600" : "text-[#1C1D21]")}>
                            Dívida: {formatKz(f.m.resumo.divida)}
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-700">Regularizado</span>
                        )
                      ) : (
                        <span className="text-zinc-500">
                          Intenção: <strong className="text-[#1C1D21]">{f.intencaoCompra ? "Sim" : "Não"}</strong>
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex h-2 w-full gap-1 overflow-hidden rounded-full bg-[#ECEAE2]">
                      <div
                        className="h-full rounded-full bg-[#FBD34D]"
                        style={{ width: `${pctInteresseCard}%` }}
                      />
                      {pctInteresseCard < 100 && (
                        <div
                          className="h-full rounded-full bg-[#1C1D21]"
                          style={{ width: `${100 - pctInteresseCard}%` }}
                        />
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Score de interesse: {f.m.interesse.pontuacao}/100</span>
                      {emAtraso && (
                        <span className="font-semibold text-red-600">
                          {f.m.resumo.parcelasEmAtraso} parc. vencida(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-1 text-xs">
                  <a
                    href={linkWhatsapp(f.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FBD34D] px-3 font-semibold text-[#1C1D21] transition-colors hover:bg-[#f5c82e]"
                  >
                    <MessageCircle className="size-3.5" aria-hidden /> {f.whatsapp}
                  </a>

                  <Link
                    href={`/formandos/${f.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1C1D21] px-3.5 font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Abrir ficha <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            );
          })}
        </GrelhaProgressiva>
      )}
    </div>
  );
}
