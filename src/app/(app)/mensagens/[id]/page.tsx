import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BolhaWhatsapp } from "@/components/bolha-whatsapp";
import { BadgeEstadoMensagem } from "@/components/estado-mensagem";
import { Alerta, Card, CardHeader, LinkButton } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatDataHora, formatHora } from "@/lib/datas";
import { NOMES_TIPO_MENSAGEM } from "@/lib/mensagens/modelos";
import { pode } from "@/lib/rbac";
import { cancelarMensagem, tentarDeNovo } from "../actions";
import { BotaoMensagem } from "../botoes";

export const metadata = { title: "Detalhe da mensagem" };

export default async function DetalheMensagemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("mensagens:ver");
  const podeGerir = pode(user.perfil, "mensagens:gerir");

  const m = await db.mensagem.findFirst({
    where: { id },
    include: {
      formando: { select: { id: true, nome: true } },
      lead: { select: { id: true, nome: true } },
    },
  });
  if (!m) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link
            href="/mensagens"
            className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-zinc-500 uppercase hover:text-[#1C1D21]"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Voltar ao histórico de mensagens
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-semibold tracking-tight text-[#1C1D21]">{NOMES_TIPO_MENSAGEM[m.tipo]}</h1>
            <BadgeEstadoMensagem estado={m.estado} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Destinatário: <span className="font-mono font-medium text-[#1C1D21]">{m.destino}</span> · criada em{" "}
            {formatDataHora(m.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/mensagens" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </LinkButton>
          {podeGerir && m.estado === "FALHADA" && (
            <BotaoMensagem
              acao={tentarDeNovo.bind(null, m.id)}
              rotulo="Tentar de novo"
              pendenteRotulo="A reenfileirar…"
            />
          )}
          {podeGerir && m.estado === "PENDENTE" && (
            <BotaoMensagem
              acao={cancelarMensagem.bind(null, m.id)}
              rotulo="Cancelar envio"
              pendenteRotulo="A cancelar…"
              variante="fantasma"
              confirmar="Cancelar o envio desta mensagem?"
            />
          )}
        </div>
      </div>

      {m.erro && (
        <Alerta tipo="erro">
          <strong>Motivo da falha:</strong>
          <div className="mt-1 font-mono text-xs break-words whitespace-pre-wrap">{m.erro}</div>
        </Alerta>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader titulo="Conteúdo da Mensagem" descricao="Texto enviado por WhatsApp ao destinatário" />
          <div className="p-6">
            <BolhaWhatsapp texto={m.texto} hora={formatHora(m.enviadaEm ?? m.createdAt)} />
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Ficha de Entrega" descricao="Registo cronológico e rastreio" />
          <div className="space-y-3 p-6 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Destinatário</span>
              <span className="leader-dots" />
              <span className="font-mono font-semibold text-[#1C1D21]">{m.destino}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Tipo de alerta</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">{NOMES_TIPO_MENSAGEM[m.tipo]}</span>
            </div>
            {m.formando && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-500">Formando</span>
                <span className="leader-dots" />
                <Link href={`/formandos/${m.formando.id}`} className="font-semibold text-[#1C1D21] hover:underline">
                  {m.formando.nome}
                </Link>
              </div>
            )}
            {m.lead && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-500">Lead</span>
                <span className="leader-dots" />
                <Link href={`/leads/${m.lead.id}`} className="font-semibold text-[#1C1D21] hover:underline">
                  {m.lead.nome}
                </Link>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Tentativas de envio</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">{m.tentativas}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Enviada em</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">{m.enviadaEm ? formatDataHora(m.enviadaEm) : "—"}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Entregue em</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">{m.entregueEm ? formatDataHora(m.entregueEm) : "—"}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Lida em</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">{m.lidaEm ? formatDataHora(m.lidaEm) : "—"}</span>
            </div>
            {m.idExterno && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-500">Referência de envio</span>
                <span className="leader-dots" />
                <span className="max-w-44 truncate font-mono text-[11px] text-zinc-600" title={m.idExterno}>
                  {m.idExterno}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
