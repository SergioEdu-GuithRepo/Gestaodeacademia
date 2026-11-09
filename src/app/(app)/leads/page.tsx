import type { EstadoLead, Prisma } from "@prisma/client";
import { ArrowUpRight, MessageCircle, Search } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Button, Card, CardHeader, Input, LinkButton, Select, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { urlBase } from "@/lib/configuracoes";
import { formatDataHora, instanteLocal } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { CORES_ESTADO_LEAD, estatisticasCampanhas, NOMES_ESTADO_LEAD } from "@/lib/leads";
import { origemLead } from "@/lib/mensagens/eventos";
import { formatKz } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CopiarUrlLanding } from "./lead-forms";

export const metadata = { title: "Leads" };

const DIA_MS = 24 * 60 * 60 * 1000;
const ESTADOS = Object.keys(NOMES_ESTADO_LEAD) as EstadoLead[];

type Filtros = {
  id?: string;
  estado?: string;
  formacaoId?: string;
  campanha?: string;
  de?: string;
  ate?: string;
  q?: string;
};

function dataValida(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function inicioDia(iso: string): Date | null {
  try {
    return instanteLocal(iso, "00:00");
  } catch {
    return null;
  }
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "L";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const { user, db } = await exigir("leads:ver");
  const sp = await searchParams;

  if (sp.id) {
    redirect(`/leads/${sp.id}`);
  }

  const h = await headers();
  const base = urlBase(process.env.APP_URL, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const urlLanding = `${base}/p/${user.tenant.slug}`;

  const filtroEstado = sp.estado ?? "ABERTOS";
  const estadoUnico = ESTADOS.find((e) => e === filtroEstado);
  const formacaoId = sp.formacaoId?.trim() || "";
  const campanha = sp.campanha?.trim() || "";
  const de = dataValida(sp.de);
  const ate = dataValida(sp.ate);
  const q = sp.q?.trim().slice(0, 100) || "";

  const criadaEm: Prisma.DateTimeFilter = {};
  const ini = de ? inicioDia(de) : null;
  const fim = ate ? inicioDia(ate) : null;
  if (ini) criadaEm.gte = ini;
  if (fim) criadaEm.lt = new Date(fim.getTime() + DIA_MS);

  const whereBasePeriodo: Prisma.LeadWhereInput = {
    ...(formacaoId ? { formacaoId } : {}),
    ...(campanha ? { utmCampaign: campanha } : {}),
    ...(ini || fim ? { createdAt: criadaEm } : {}),
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { whatsapp: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const where: Prisma.LeadWhereInput = {
    ...whereBasePeriodo,
    ...(estadoUnico
      ? { estado: estadoUnico }
      : filtroEstado === "ABERTOS"
        ? { estado: { in: ["NOVO", "CONTACTADO"] } }
        : {}),
  };

  const [leads, contadoresRaw, formacoes, campanhasRaw, leadsPeriodo] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        formacao: { select: { id: true, nome: true } },
        turma: { select: { id: true, codigo: true } },
      },
    }),
    db.lead.groupBy({ by: ["estado"], _count: { _all: true } }),
    db.formacao.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.lead.findMany({
      where: { utmCampaign: { not: null } },
      distinct: ["utmCampaign"],
      select: { utmCampaign: true },
    }),
    db.lead.findMany({
      where: whereBasePeriodo,
      select: { estado: true, utmSource: true, utmMedium: true, utmCampaign: true, fbclid: true },
    }),
  ]);

  const contadores = new Map(contadoresRaw.map((c) => [c.estado, c._count._all]));
  const nNovo = contadores.get("NOVO") ?? 0;
  const nContactado = contadores.get("CONTACTADO") ?? 0;
  const nConvertido = contadores.get("CONVERTIDO") ?? 0;
  const nPerdido = contadores.get("PERDIDO") ?? 0;
  const somaEstados = nNovo + nContactado + nConvertido + nPerdido || 1;

  const pctNovo = Math.max(20, Math.round((nNovo / somaEstados) * 100));
  const pctContactado = Math.max(16, Math.round((nContactado / somaEstados) * 100));
  const pctConvertido = Math.max(18, Math.round((nConvertido / somaEstados) * 100));
  const pctPerdido = Math.max(12, 100 - pctNovo - pctContactado - pctConvertido);

  const campanhas = campanhasRaw.map((c) => c.utmCampaign).filter((c): c is string => !!c).sort();
  const estatisticas = estatisticasCampanhas(leadsPeriodo);
  const filtrosAtivos = !!(filtroEstado !== "ABERTOS" || formacaoId || campanha || de || ate || q);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Captação e Pré-Cadastros
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">Pipeline de Leads</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarUrlLanding url={urlLanding} />
        </div>
      </div>

      {/* Bloco Editorial de Métricas + 4 Barras Proporcionais + Filtros (Referência 3) */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <span className="text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {nNovo + nContactado}
              </span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">em aberto</span>
            </div>
            <span className="text-2xl font-light text-zinc-300">/</span>
            <div>
              <span className="text-2xl font-normal tracking-tight text-emerald-700 sm:text-3xl">{nConvertido}</span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">convertidos em formando</span>
            </div>
          </div>

          {/* Pílulas de estado rápido */}
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1">
            <Link
              href="/leads?estado=ABERTOS"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                filtroEstado === "ABERTOS"
                  ? "bg-[#1C1D21] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Em aberto ({nNovo + nContactado})
            </Link>
            {ESTADOS.map((e) => (
              <Link
                key={e}
                href={`/leads?estado=${e}`}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  filtroEstado === e
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                {NOMES_ESTADO_LEAD[e]} ({contadores.get(e) ?? 0})
              </Link>
            ))}
            <Link
              href="/leads?estado=TODOS"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                filtroEstado === "TODOS"
                  ? "bg-[#1C1D21] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Todos
            </Link>
          </div>
        </div>

        {/* 4 Barras Horizontais Proporcionais em Pílula (Referência 3) */}
        <div className="mt-5 flex h-10 w-full items-stretch gap-2 overflow-hidden">
          <Link
            href="/leads?estado=NOVO"
            style={{ width: `${pctNovo}%` }}
            className="flex min-w-24 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21] transition-transform hover:scale-[1.01]"
          >
            <span>Novos</span>
            <span>{nNovo}</span>
          </Link>
          <Link
            href="/leads?estado=CONTACTADO"
            style={{ width: `${pctContactado}%` }}
            className="flex min-w-24 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white transition-transform hover:scale-[1.01]"
          >
            <span>Contactados</span>
            <span>{nContactado}</span>
          </Link>
          <Link
            href="/leads?estado=CONVERTIDO"
            style={{ width: `${pctConvertido}%` }}
            className="bg-hatched flex min-w-24 items-center justify-between rounded-full border border-zinc-300/80 px-4 text-xs font-semibold text-[#1C1D21] transition-transform hover:scale-[1.01]"
          >
            <span>Convertidos</span>
            <span>{nConvertido}</span>
          </Link>
          <Link
            href="/leads?estado=PERDIDO"
            style={{ width: `${pctPerdido}%` }}
            className="flex min-w-20 items-center justify-between rounded-full border border-zinc-200 bg-[#F5F4EF] px-3.5 text-xs font-medium text-zinc-600 transition-transform hover:scale-[1.01]"
          >
            <span className="truncate">Perdidos</span>
            <span>{nPerdido}</span>
          </Link>
        </div>

        {/* Filtros Detalhados */}
        <form
          method="get"
          className="mt-5 grid gap-3 border-t border-dotted border-zinc-200 pt-5 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_9rem_9rem_auto] lg:items-end"
        >
          <input type="hidden" name="estado" value={filtroEstado} />
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Pesquisar</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <Input name="q" defaultValue={q} placeholder="Nome ou WhatsApp…" type="search" className="pl-9" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Formação</span>
            <Select name="formacaoId" defaultValue={formacaoId}>
              <option value="">Todas as formações</option>
              {formacoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Campanha (UTM)</span>
            <Select name="campanha" defaultValue={campanha}>
              <option value="">Todas</option>
              {campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">De</span>
            <Input name="de" type="date" defaultValue={de ?? ""} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Até</span>
            <Input name="ate" type="date" defaultValue={ate ?? ""} />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variante="primario">
              Filtrar
            </Button>
            {filtrosAtivos && (
              <LinkButton href="/leads" variante="fantasma">
                Limpar
              </LinkButton>
            )}
          </div>
        </form>
      </div>

      {/* Grelha de Cards de Leads (10 em 10) */}
      {leads.length === 0 ? (
        <Card className="p-6">
          <Vazio>{filtrosAtivos ? "Nenhum lead corresponde aos filtros." : "Não há leads em aberto."}</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map((l, idx) => (
            <div
              key={l.id}
              className="group flex flex-col justify-between rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-all hover:border-zinc-300"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/leads/${l.id}`} className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        idx % 2 === 0 ? "bg-[#1C1D21] text-[#FBD34D]" : "bg-[#FBD34D] text-[#1C1D21]",
                      )}
                    >
                      {iniciais(l.nome)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[#1C1D21] group-hover:underline">{l.nome}</h3>
                      <p className="truncate text-xs text-zinc-500">
                        {l.profissao ?? "Candidato"} · {formatDataHora(l.createdAt)}
                      </p>
                    </div>
                  </Link>
                  <Badge cor={CORES_ESTADO_LEAD[l.estado]}>{NOMES_ESTADO_LEAD[l.estado]}</Badge>
                </div>

                {/* Formação, Turma e Preço Aceite */}
                <div className="mt-4 rounded-2xl bg-[#FAF9F5] p-3.5 text-xs">
                  <div className="font-semibold text-[#1C1D21]">{l.formacao.nome}</div>
                  <div className="mt-1.5 flex items-center justify-between text-zinc-500">
                    <span>{l.turma ? `Turma ${l.turma.codigo}` : "Qualquer turma"}</span>
                    <span className="font-bold text-[#1C1D21]">{formatKz(l.precoApresentado)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-dotted border-zinc-200 pt-2 text-[11px] text-zinc-500">
                    <span>Origem:</span>
                    <span className="rounded-full bg-white px-2.5 py-0.5 font-medium text-[#1C1D21] shadow-2xs">
                      {origemLead(l)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-1 text-xs">
                <a
                  href={linkWhatsapp(l.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FBD34D] px-3 font-semibold text-[#1C1D21] transition-colors hover:bg-[#f5c82e]"
                >
                  <MessageCircle className="size-3.5" aria-hidden /> {l.whatsapp}
                </a>

                <Link
                  href={`/leads/${l.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1C1D21] px-3.5 font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Converter <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          ))}
        </GrelhaProgressiva>
      )}

      {/* Desempenho por Origem / Campanha estilo Statistics da Referência 2 */}
      {estatisticas.length > 0 && (
        <Card className="p-6">
          <CardHeader
            titulo="Conversão por Origem e Campanha (UTM)"
            descricao="Taxa de conversão de pré-cadastros em matrículas para o período selecionado."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {estatisticas.map((c, idx) => (
              <div key={c.origem} className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-semibold text-[#1C1D21]">{c.origem}</span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[#1C1D21] shadow-2xs">
                    {c.taxa}% conv.
                  </span>
                </div>
                <div className="mt-3 flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-[#ECEAE2]">
                  {c.taxa > 0 && (
                    <div
                      className={cn("h-full rounded-full", idx % 2 === 0 ? "bg-[#FBD34D]" : "bg-[#1C1D21]")}
                      style={{ width: `${Math.max(8, c.taxa)}%` }}
                    />
                  )}
                </div>
                <div className="mt-2.5 flex justify-between text-xs text-zinc-500">
                  <span>
                    Leads: <strong className="text-[#1C1D21]">{c.total}</strong>
                  </span>
                  <span>
                    Convertidos: <strong className="text-emerald-700">{c.convertidos}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
