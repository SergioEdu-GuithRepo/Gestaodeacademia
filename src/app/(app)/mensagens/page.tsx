import type { EstadoMensagem, Prisma, TipoMensagem } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { BadgeEstadoMensagem } from "@/components/estado-mensagem";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Button, Card, Input, LinkButton, Select, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { NOMES_ESTADO_MENSAGEM, truncar } from "@/lib/configuracoes";
import { formatDataHora, hojeLocal, instanteLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { NOMES_TIPO_MENSAGEM } from "@/lib/mensagens/modelos";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { cancelarMensagem, tentarDeNovo, tentarDeNovoTodas } from "./actions";
import { BotaoMensagem } from "./botoes";

export const metadata = { title: "WhatsApp · Mensagens" };

const POR_PAGINA = 50;
const DIA_MS = 24 * 60 * 60 * 1000;
const ESTADOS = Object.keys(NOMES_ESTADO_MENSAGEM) as EstadoMensagem[];
const TIPOS = Object.keys(NOMES_TIPO_MENSAGEM) as TipoMensagem[];

type Filtros = {
  estado?: string;
  tipo?: string;
  de?: string;
  ate?: string;
  q?: string;
  formandoId?: string;
  pagina?: string;
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

export default async function MensagensPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const { user, db } = await exigir("mensagens:ver");
  const sp = await searchParams;
  const podeGerir = pode(user.perfil, "mensagens:gerir");
  const eAdmin = pode(user.perfil, "configuracoes:editar");

  const estado = ESTADOS.find((e) => e === sp.estado);
  const tipo = TIPOS.find((t) => t === sp.tipo);
  const de = dataValida(sp.de);
  const ate = dataValida(sp.ate);
  const q = sp.q?.trim().slice(0, 100) || "";
  const formandoId = sp.formandoId?.trim() || "";
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(sp.pagina ?? "1", 10) || 1));

  const criadaEm: Prisma.DateTimeFilter = {};
  const inicio = de ? inicioDia(de) : null;
  const fimDia = ate ? inicioDia(ate) : null;
  if (inicio) criadaEm.gte = inicio;
  if (fimDia) criadaEm.lt = new Date(fimDia.getTime() + DIA_MS);

  const where: Prisma.MensagemWhereInput = {
    ...(estado ? { estado } : {}),
    ...(tipo ? { tipo } : {}),
    ...(inicio || fimDia ? { createdAt: criadaEm } : {}),
    ...(formandoId ? { formandoId } : {}),
    ...(q
      ? {
          OR: [
            { destino: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } },
            { texto: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const agora = new Date();
  const inicioHoje = inicioDia(hojeLocal()) ?? agora;
  const [cfg, total, mensagens, nPendentes, nFalhadas7, nEnviadasHoje, nFalhadasTotal, formando] = await Promise.all([
    obterConfiguracao(comoCliente(db), user.tenantId),
    db.mensagem.count({ where }),
    db.mensagem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        formando: { select: { id: true, nome: true } },
        lead: { select: { id: true, nome: true } },
      },
    }),
    db.mensagem.count({ where: { estado: "PENDENTE" } }),
    db.mensagem.count({ where: { estado: "FALHADA", updatedAt: { gte: new Date(agora.getTime() - 7 * DIA_MS) } } }),
    db.mensagem.count({ where: { enviadaEm: { gte: inicioHoje } } }),
    podeGerir ? db.mensagem.count({ where: { estado: "FALHADA" } }) : Promise.resolve(0),
    formandoId ? db.formando.findFirst({ where: { id: formandoId }, select: { id: true, nome: true } }) : Promise.resolve(null),
  ]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrosAtivos = !!(estado || tipo || de || ate || q || formandoId);

  function urlPagina(p: number) {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (tipo) params.set("tipo", tipo);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    if (q) params.set("q", q);
    if (formandoId) params.set("formandoId", formandoId);
    if (p > 1) params.set("pagina", String(p));
    const s = params.toString();
    return s ? `/mensagens?${s}` : "/mensagens";
  }

  const somaIndicadores = nEnviadasHoje + nPendentes + nFalhadas7 || 1;
  const pctEnviadas = Math.max(25, Math.round((nEnviadasHoje / somaIndicadores) * 100));
  const pctPendentes = Math.max(18, Math.round((nPendentes / somaIndicadores) * 100));
  const pctFalhadas = Math.max(15, 100 - pctEnviadas - pctPendentes);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Comunicações e Alertas
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">WhatsApp e Cobranças</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eAdmin && cfg.whatsappModo !== "EVOLUTION" && (
            <Link
              href="/configuracoes?tab=whatsapp"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-[#1C1D21] hover:text-[#1C1D21]"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  cfg.whatsappModo === "SIMULACAO" ? "bg-[#FBD34D]" : "bg-zinc-400",
                )}
              />
              {cfg.whatsappModo === "SIMULACAO"
                ? "Modo de teste · Configurar WhatsApp →"
                : "Canal WhatsApp desativado · Ativar →"}
            </Link>
          )}
          {podeGerir && nFalhadasTotal > 0 && (
            <BotaoMensagem
              acao={tentarDeNovoTodas}
              rotulo={`Reenviar falhadas (${nFalhadasTotal})`}
              pendenteRotulo="A reenfileirar…"
              confirmar={`Voltar a enviar as ${nFalhadasTotal} mensagens falhadas?`}
            />
          )}
        </div>
      </div>

      {/* Bloco de Métricas Proporcionais + Filtros em Pílula (Referência 3) */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <span className="text-3xl font-light tracking-tight text-[#1C1D21]">{total}</span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">mensagens no histórico</span>
            </div>
            <span className="text-2xl font-light text-zinc-300">/</span>
            <div>
              <span className="text-2xl font-normal tracking-tight text-[#1C1D21]">{nEnviadasHoje}</span>
              <span className="ml-1.5 text-xs font-medium text-zinc-500">enviadas hoje</span>
            </div>
          </div>

          {/* Pílulas de estado rápido */}
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1">
            <Link
              href="/mensagens"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                !estado ? "bg-[#1C1D21] text-white shadow-2xs" : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Todas
            </Link>
            <Link
              href="/mensagens?estado=PENDENTE"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                estado === "PENDENTE" ? "bg-[#1C1D21] text-white shadow-2xs" : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Pendentes ({nPendentes})
            </Link>
            <Link
              href="/mensagens?estado=FALHADA"
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                estado === "FALHADA" ? "bg-red-600 text-white shadow-2xs" : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              Falhadas ({nFalhadas7})
            </Link>
          </div>
        </div>

        {/* Barras Proporcionais em Pílula */}
        <div className="mt-5 flex h-10 w-full items-stretch gap-2 overflow-hidden">
          <div
            style={{ width: `${pctEnviadas}%` }}
            className="flex min-w-28 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21]"
          >
            <span>Enviadas hoje</span>
            <span>{nEnviadasHoje}</span>
          </div>
          <Link
            href="/mensagens?estado=PENDENTE"
            style={{ width: `${pctPendentes}%` }}
            className="flex min-w-24 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-zinc-800"
          >
            <span>Na fila</span>
            <span>{nPendentes}</span>
          </Link>
          <Link
            href="/mensagens?estado=FALHADA"
            style={{ width: `${pctFalhadas}%` }}
            className="bg-hatched flex min-w-24 items-center justify-between rounded-full border border-zinc-300/80 px-4 text-xs font-semibold text-[#1C1D21]"
          >
            <span>Falhadas (7d)</span>
            <span>{nFalhadas7}</span>
          </Link>
        </div>

        {/* Barra de Filtros */}
        <form
          method="get"
          className="mt-5 grid gap-3 border-t border-dotted border-zinc-200 pt-5 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_12rem_9.5rem_9.5rem_auto] lg:items-end"
        >
          {formandoId && <input type="hidden" name="formandoId" value={formandoId} />}
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Pesquisar</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <Input name="q" defaultValue={q} placeholder="Número ou texto…" type="search" className="pl-9" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Estado</span>
            <Select name="estado" defaultValue={estado ?? ""}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {NOMES_ESTADO_MENSAGEM[e]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-zinc-600">Tipo</span>
            <Select name="tipo" defaultValue={tipo ?? ""}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMES_TIPO_MENSAGEM[t]}
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
              <LinkButton href="/mensagens" variante="fantasma">
                Limpar
              </LinkButton>
            )}
          </div>
        </form>

        {formandoId && (
          <div className="mt-4 rounded-2xl bg-[#FAF9F5] px-4 py-2.5 text-xs text-zinc-600">
            A filtrar mensagens de{" "}
            {formando ? (
              <Link href={`/formandos/${formando.id}`} className="font-semibold text-[#1C1D21] hover:underline">
                {formando.nome}
              </Link>
            ) : (
              "formando desconhecido"
            )}
          </div>
        )}
      </div>

      {/* Tabela Diretório de Mensagens (Referência 3, 10 em 10) */}
      <Card className="p-6">
        {mensagens.length === 0 ? (
          <Vazio>{filtrosAtivos ? "Nenhuma mensagem corresponde aos filtros." : "Ainda não há mensagens."}</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data / Hora</Th>
                <Th>Tipo de Alerta</Th>
                <Th>Destinatário</Th>
                <Th>Estado / Entrega</Th>
                <Th className="text-right">Detalhe</Th>
              </tr>
            </thead>
            <TbodyProgressivo passo={10} colSpan={5}>
              {mensagens.map((m, idx) => (
                <tr
                  key={m.id}
                  className={cn(
                    "transition-colors",
                    idx === 0 ? "bg-[#FBD34D]/20 hover:bg-[#FBD34D]/35" : "hover:bg-[#FBD34D]/15",
                  )}
                >
                  <Td className="whitespace-nowrap">
                    <Link href={`/mensagens/${m.id}`} className="font-medium text-[#1C1D21] hover:underline">
                      {formatDataHora(m.createdAt)}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap font-medium text-[#1C1D21]">{NOMES_TIPO_MENSAGEM[m.tipo]}</Td>
                  <Td>
                    <div className="font-mono text-xs whitespace-nowrap text-zinc-700">{m.destino}</div>
                    {m.formando && (
                      <Link
                        href={`/formandos/${m.formando.id}`}
                        className="text-xs font-medium text-zinc-600 hover:text-[#1C1D21] hover:underline"
                      >
                        {m.formando.nome}
                      </Link>
                    )}
                    {!m.formando && m.lead && (
                      <Link
                        href={`/leads/${m.lead.id}`}
                        className="text-xs font-medium text-zinc-600 hover:text-[#1C1D21] hover:underline"
                      >
                        Lead: {m.lead.nome}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeEstadoMensagem estado={m.estado} />
                      {m.tentativas > 1 && (
                        <span className="text-[11px] text-zinc-400">{m.tentativas} tent.</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {m.lidaEm
                        ? `Lida ${formatDataHora(m.lidaEm)}`
                        : m.entregueEm
                          ? `Entregue ${formatDataHora(m.entregueEm)}`
                          : m.enviadaEm
                            ? `Enviada ${formatDataHora(m.enviadaEm)}`
                            : m.estado === "PENDENTE" && m.proximaTentativa > agora
                              ? `Agendada ${formatDataHora(m.proximaTentativa)}`
                              : null}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {m.erro ? (
                        <Link
                          href={`/mensagens/${m.id}`}
                          title={m.erro}
                          className="text-xs text-red-700 hover:underline"
                        >
                          {truncar(m.erro, 36)}
                        </Link>
                      ) : (
                        <Link
                          href={`/mensagens/${m.id}`}
                          className="text-xs font-medium text-zinc-600 hover:text-[#1C1D21] hover:underline"
                        >
                          Ver →
                        </Link>
                      )}
                      {podeGerir && m.estado === "FALHADA" && (
                        <BotaoMensagem acao={tentarDeNovo.bind(null, m.id)} rotulo="Reenviar" pendenteRotulo="…" />
                      )}
                      {podeGerir && m.estado === "PENDENTE" && (
                        <BotaoMensagem
                          acao={cancelarMensagem.bind(null, m.id)}
                          rotulo="Cancelar"
                          pendenteRotulo="…"
                          variante="fantasma"
                          confirmar="Cancelar o envio desta mensagem?"
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TbodyProgressivo>
          </Tabela>
        )}
        {total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dotted border-zinc-200 pt-4 text-xs text-zinc-500">
            <span>
              {total} mensagem(ns) · página {Math.min(pagina, paginas)} de {paginas}
            </span>
            <div className="flex gap-2">
              {pagina > 1 && (
                <LinkButton href={urlPagina(pagina - 1)} variante="secundario" aria-label="Página anterior">
                  <ChevronLeft className="size-4" aria-hidden /> Anterior
                </LinkButton>
              )}
              {pagina < paginas && (
                <LinkButton href={urlPagina(pagina + 1)} variante="secundario" aria-label="Página seguinte">
                  Seguinte <ChevronRight className="size-4" aria-hidden />
                </LinkButton>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
