import { ArrowLeft, CalendarClock, CheckCircle2, Globe2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, LinkButton, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatDataHora } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { CORES_ESTADO_LEAD, NOMES_ESTADO_LEAD } from "@/lib/leads";
import { origemLead } from "@/lib/mensagens/eventos";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { converterLeadEmFormando, guardarNotasLead, marcarEstadoLead, registarInteracaoLead } from "../actions";
import { BotaoAcaoLead, BotaoConverterLead, InteracaoLeadForm, NotasLeadForm } from "../lead-forms";

const NOMES_INTERACAO = {
  WHATSAPP: "WhatsApp",
  CHAMADA: "Chamada",
  REUNIAO: "Reunião / Presencial",
  EMAIL: "E-mail",
  NOTA: "Nota Interna",
} as const;

export const metadata = { title: "Ficha do lead" };

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function DetalheLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("leads:ver");
  const podeEditar = pode(user.perfil, "leads:editar");

  const lead = await db.lead.findFirst({
    where: { id },
    include: {
      formacao: { select: { id: true, nome: true } },
      turma: { select: { id: true, codigo: true } },
      formando: { select: { id: true, nome: true } },
      interacoes: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { nome: true } } },
      },
    },
  });
  if (!lead) notFound();

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-13 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-base font-bold text-[#FBD34D]">
            {iniciais(lead.nome)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Pré-Cadastro · Recebido em {formatDataHora(lead.createdAt)}
              </span>
              <Badge cor={CORES_ESTADO_LEAD[lead.estado]}>{NOMES_ESTADO_LEAD[lead.estado]}</Badge>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">{lead.nome}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/leads" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </LinkButton>
          <LinkButton
            href={linkWhatsapp(lead.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            variante="secundario"
          >
            <MessageCircle className="size-4 text-emerald-600" aria-hidden /> Abrir WhatsApp
          </LinkButton>
          {podeEditar && lead.estado !== "CONVERTIDO" && (
            <BotaoConverterLead acao={converterLeadEmFormando.bind(null, lead.id)} />
          )}
        </div>
      </div>

      {/* Bloco Editorial + 3 Pílulas Horizontais Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-xs font-medium text-slate-500">Preço aceite pelo candidato</div>
              <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {formatKz(lead.precoApresentado)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Formação escolhida</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-[#1C1D21] sm:text-2xl">
                {lead.formacao.nome}
              </div>
            </div>
          </div>

          {podeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              {lead.estado === "NOVO" && (
                <BotaoAcaoLead
                  acao={marcarEstadoLead.bind(null, lead.id, "CONTACTADO")}
                  rotulo="Marcar como contactado"
                />
              )}
              {lead.estado !== "PERDIDO" && lead.estado !== "CONVERTIDO" && (
                <BotaoAcaoLead
                  acao={marcarEstadoLead.bind(null, lead.id, "PERDIDO")}
                  rotulo="Marcar como perdido"
                  variante="fantasma"
                />
              )}
              {(lead.estado === "PERDIDO" || lead.estado === "CONTACTADO") && (
                <BotaoAcaoLead
                  acao={marcarEstadoLead.bind(null, lead.id, "NOVO")}
                  rotulo="Reabrir como novo"
                  variante="fantasma"
                />
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Qualificação de entrada</span>
              <span className="font-semibold text-[#1C1D21]">Confirmado</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" aria-hidden /> Aceitou preço e datas
              </span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Turma selecionada</span>
              <span className="font-semibold text-[#1C1D21]">{lead.turma?.codigo ?? "Aberta"}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span className="truncate">{lead.formacao.nome}</span>
              <span className="shrink-0 pl-2 font-mono text-[#FBD34D]">{lead.turma?.codigo ?? "—"}</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Origem de captação</span>
              <span className="font-semibold text-[#1C1D21]">{NOMES_ESTADO_LEAD[lead.estado]}</span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span className="truncate">{origemLead(lead)}</span>
              <span>{lead.utmSource ?? "Direto"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Esquerda: CRM Timeline + Notas */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              titulo={`Cronologia CRM e Follow-up (${lead.interacoes.length})`}
              descricao="Registe chamadas, WhatsApp, reuniões e agende o próximo contacto comercial."
            />
            {podeEditar && <InteracaoLeadForm acao={registarInteracaoLead.bind(null, lead.id)} />}

            <div className="border-t border-dotted border-zinc-200 p-5">
              {lead.interacoes.length === 0 ? (
                <Vazio>Nenhuma interação registada ainda neste lead.</Vazio>
              ) : (
                <GrelhaProgressiva passo={10} labelItem="interações" className="space-y-3">
                  {lead.interacoes.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge cor="azul">{NOMES_INTERACAO[it.tipo]}</Badge>
                          <span className="font-semibold text-[#1C1D21]">
                            {it.user?.nome ?? "Equipa Comercial"}
                          </span>
                        </div>
                        <span className="text-zinc-500">{formatDataHora(it.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-[#1C1D21]">{it.resumo}</p>
                      {it.proximoFollowUp && (
                        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D]/50 px-3 py-1 text-[11px] font-bold text-[#1C1D21]">
                          <CalendarClock className="size-3.5" aria-hidden />
                          Próximo follow-up: {formatDataHora(it.proximoFollowUp)}
                        </div>
                      )}
                    </div>
                  ))}
                </GrelhaProgressiva>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              titulo="Notas Fixas do Lead"
              descricao="Observações gerais do perfil do candidato."
            />
            {podeEditar ? (
              <NotasLeadForm acao={guardarNotasLead.bind(null, lead.id)} notasIniciais={lead.notas ?? ""} />
            ) : (
              <div className="p-4 text-sm whitespace-pre-line text-slate-700">{lead.notas || "Sem notas."}</div>
            )}
          </Card>
        </div>

        {/* Coluna Direita (350px) — Ficha do Candidato & Rastreio UTM */}
        <div className="space-y-5">
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <Globe2 className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-[#1C1D21]">Dados e Rastreio</div>
                <div className="text-xs text-slate-500">Informação do formulário público</div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline">
                <span className="text-slate-500">WhatsApp</span>
                <span className="leader-dots" />
                <a
                  href={linkWhatsapp(lead.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold text-[#1C1D21] hover:underline"
                >
                  {lead.whatsapp}
                </a>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Email</span>
                <span className="leader-dots" />
                <span className="max-w-44 truncate font-semibold text-[#1C1D21]">{lead.email ?? "—"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Profissão</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{lead.profissao ?? "—"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Formação</span>
                <span className="leader-dots" />
                <Link href={`/formacoes/${lead.formacao.id}`} className="font-bold text-[#1C1D21] hover:underline">
                  {lead.formacao.nome}
                </Link>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Turma</span>
                <span className="leader-dots" />
                {lead.turma ? (
                  <Link href={`/turmas/${lead.turma.id}`} className="font-mono font-bold text-[#1C1D21] hover:underline">
                    {lead.turma.codigo}
                  </Link>
                ) : (
                  <span className="text-slate-400">Sem turma</span>
                )}
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Contactado em</span>
                <span className="leader-dots" />
                <span className="font-semibold text-[#1C1D21]">
                  {lead.contactadoEm ? formatDataHora(lead.contactadoEm) : "—"}
                </span>
              </div>
              {lead.formando && (
                <div className="flex items-baseline">
                  <span className="text-slate-500">Ficha de formando</span>
                  <span className="leader-dots" />
                  <Link href={`/formandos/${lead.formando.id}`} className="font-bold text-emerald-700 hover:underline">
                    {lead.formando.nome}
                  </Link>
                </div>
              )}
              <div className="flex items-baseline">
                <span className="text-slate-500">utm_source</span>
                <span className="leader-dots" />
                <span className="font-mono font-semibold text-[#1C1D21]">{lead.utmSource ?? "—"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">utm_medium</span>
                <span className="leader-dots" />
                <span className="font-mono font-semibold text-[#1C1D21]">{lead.utmMedium ?? "—"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">utm_campaign</span>
                <span className="leader-dots" />
                <span className="font-mono font-semibold text-[#1C1D21]">{lead.utmCampaign ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

