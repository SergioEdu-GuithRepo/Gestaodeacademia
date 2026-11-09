import { ArrowLeft, Gift, MessageCircle, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BolhaWhatsapp } from "@/components/bolha-whatsapp";
import { BadgeEstadoMensagem } from "@/components/estado-mensagem";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, diaLocal, formatData, formatDataHora, hojeLocal } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { renderizar } from "@/lib/mensagens/modelos";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { NOMES_MESES, validarOrcamentoCampanha } from "@/lib/retencao";
import { alterarEstadoCampanha, dispararCampanhaWhatsapp, repetirCampanhaNoutroMes } from "../actions";
import {
  CORES_ESTADO_CAMPANHA,
  CORES_TIPO_CAMPANHA,
  NOMES_ESTADO_CAMPANHA,
  NOMES_TIPO_CAMPANHA,
  filtrarFormandosSegmento,
  obterSobraOperacionalMesAtual,
} from "../segmento";
import { AcoesCampanha } from "./acoes-campanha";

export const metadata = { title: "Detalhe da campanha" };

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function DetalheCampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("campanhas:ver");
  const podeEditar = pode(user.perfil, "campanhas:editar");

  const campanha = await db.campanha.findFirst({
    where: { id },
    include: {
      formacao: { select: { id: true, nome: true } },
      matriculas: {
        where: { estado: { not: "CANCELADA" } },
        orderBy: { createdAt: "desc" },
        include: {
          formando: { select: { id: true, nome: true, whatsapp: true } },
          turma: { select: { id: true, codigo: true, formacao: { select: { nome: true } } } },
        },
      },
      mensagens: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          formando: { select: { id: true, nome: true } },
        },
      },
    },
  });
  if (!campanha) notFound();

  const [formandosBrutos, margemMes] = await Promise.all([
    db.formando.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        whatsapp: true,
        profissao: true,
        intencaoCompra: true,
        avaliacaoEquipa: true,
        matriculas: {
          select: {
            estado: true,
            createdAt: true,
            parcelas: {
              select: {
                valor: true,
                vencimento: true,
                alocacoes: { select: { valor: true } },
              },
            },
          },
        },
      },
    }),
    obterSobraOperacionalMesAtual(db),
  ]);

  const hoje = dataSimples(hojeLocal());
  const segmento = filtrarFormandosSegmento(formandosBrutos, campanha, hoje);

  const descontoConsumido = campanha.matriculas.reduce((acc, m) => acc + m.desconto, 0n);
  const receitaGerada = campanha.matriculas.reduce((acc, m) => acc + m.valorTotal, 0n);

  const validacaoOrcamento = validarOrcamentoCampanha({
    orcamentoMax: campanha.orcamentoMax,
    descontojaConsumido: descontoConsumido,
    sobraOperacionalDisponivel: margemMes.sobraOperacional,
  });

  const percentagemOrcamento =
    campanha.orcamentoMax && campanha.orcamentoMax > 0n
      ? Math.min(100, Math.round((Number(descontoConsumido) / Number(campanha.orcamentoMax)) * 100))
      : 35;

  // Estatísticas de entrega das mensagens WhatsApp
  const stats = {
    pendentes: 0,
    enviadas: 0,
    entregues: 0,
    lidas: 0,
    falhadas: 0,
  };
  for (const m of campanha.mensagens) {
    if (m.estado === "PENDENTE" || m.estado === "ENVIANDO") stats.pendentes += 1;
    else if (m.estado === "ENVIADA") stats.enviadas += 1;
    else if (m.estado === "ENTREGUE") stats.entregues += 1;
    else if (m.estado === "LIDA") stats.lidas += 1;
    else if (m.estado === "FALHADA") stats.falhadas += 1;
  }

  const mesNome =
    campanha.mesValidade && NOMES_MESES[campanha.mesValidade]
      ? NOMES_MESES[campanha.mesValidade]
      : NOMES_MESES[margemMes.mesAtual] ?? "";

  const textoPreview = renderizar(campanha.mensagemTexto, {
    primeiroNome: "Ana",
    nome: "Ana Manuela Domingos",
    campanha: campanha.nome,
    desconto: `${campanha.descontoPct}%`,
    formacao: campanha.formacao?.nome ?? "nossas formações",
    mes: mesNome,
    centro: user.tenant.nome,
  });

  const validadeTexto =
    campanha.mesValidade && campanha.anoValidade
      ? `${NOMES_MESES[campanha.mesValidade] ?? campanha.mesValidade}/${campanha.anoValidade}`
      : "Contínua";

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Campanha {NOMES_TIPO_CAMPANHA[campanha.tipo]} · Validade {validadeTexto}
            </span>
            <Badge cor={CORES_TIPO_CAMPANHA[campanha.tipo]}>{NOMES_TIPO_CAMPANHA[campanha.tipo]}</Badge>
            <Badge cor={CORES_ESTADO_CAMPANHA[campanha.estado]}>{NOMES_ESTADO_CAMPANHA[campanha.estado]}</Badge>
            {campanha.descontoPct > 0 && (
              <span className="rounded-full bg-[#FBD34D] px-2.5 py-0.5 text-xs font-extrabold text-[#1C1D21]">
                -{campanha.descontoPct}% de desconto
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {campanha.nome}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/campanhas" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às campanhas
          </LinkButton>
        </div>
      </div>

      {/* Bloco Editorial de Métricas + 3 Pílulas Horizontais Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)] space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-xs font-medium text-slate-500">Segmento estimado</div>
              <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {segmento.length}{" "}
                <span className="text-sm font-medium text-slate-500">formando(s)</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Matrículas convertidas</div>
              <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {campanha.matriculas.length}{" "}
                <span className="text-sm font-medium text-emerald-700">({formatKz(receitaGerada)})</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Orçamento consumido</div>
              <div className="mt-1 text-2xl font-light tracking-tight text-[#1C1D21] sm:text-3xl">
                {formatKz(descontoConsumido)}{" "}
                <span className="text-xs font-medium text-slate-400">
                  / {campanha.orcamentoMax !== null ? formatKz(campanha.orcamentoMax) : "Sem limite"}
                </span>
              </div>
            </div>
          </div>

          {campanha.enviadaEm && (
            <span className="rounded-full bg-[#F6F5F0] px-3 py-1 text-xs font-medium text-slate-600">
              Último disparo: {formatDataHora(campanha.enviadaEm)}
            </span>
          )}
        </div>

        {/* 3 Pílulas Horizontais */}
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Formação alvo</span>
              <span className="font-semibold text-[#1C1D21]">{segmento.length} elegíveis</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span className="truncate">{campanha.formacao?.nome ?? "Todas as formações"}</span>
              <span className="shrink-0 pl-2">-{campanha.descontoPct}%</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Execução de orçamento</span>
              <span className="font-semibold text-[#1C1D21]">
                {campanha.orcamentoMax !== null ? `${percentagemOrcamento}%` : "Livre"}
              </span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span>Descontos aplicados</span>
              <span>{formatKz(descontoConsumido)}</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Sobra operacional do mês</span>
              <span className="font-semibold text-[#1C1D21]">
                {validacaoOrcamento.cabeNaSobraOperacional ? "Dentro da margem" : "Acima da sobra"}
              </span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span>Sobra disponível</span>
              <span>{formatKz(margemMes.sobraOperacional)}</span>
            </div>
          </div>
        </div>

        {/* Barra de dois tons do orçamento */}
        <div className="space-y-1.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
            <div
              className={!validacaoOrcamento.cabeNoOrcamentoCampanha ? "bg-red-500" : "bg-[#FBD34D]"}
              style={{ width: `${percentagemOrcamento}%` }}
            />
            <div
              className="bg-[#1C1D21]"
              style={{ width: `${Math.max(0, 100 - percentagemOrcamento)}%` }}
            />
          </div>
          {validacaoOrcamento.aviso && <Alerta tipo="aviso">{validacaoOrcamento.aviso}</Alerta>}
        </div>

        {/* Ações da campanha */}
        {podeEditar && (
          <div className="border-t border-dotted border-[#E2E0D8] pt-4">
            <AcoesCampanha
              estadoAtual={campanha.estado}
              totalSegmento={segmento.length}
              mesAtualCampanha={campanha.mesValidade}
              anoCampanha={campanha.anoValidade ?? margemMes.anoAtual}
              nomeCampanha={campanha.nome}
              dispararAcao={dispararCampanhaWhatsapp.bind(null, campanha.id)}
              repetirAcao={repetirCampanhaNoutroMes.bind(null, campanha.id)}
              encerrarAcao={alterarEstadoCampanha.bind(null, campanha.id, "ENCERRADA")}
              reativarAcao={alterarEstadoCampanha.bind(null, campanha.id, "ATIVA")}
            />
          </div>
        )}
      </div>

      {/* Grelha Assimétrica de 2 Colunas (Tabelas à esquerda + Ficha & WhatsApp à direita) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Esquerda */}
        <div className="min-w-0 space-y-6">
          {/* 1. Destinatários no Segmento */}
          <Card>
            <CardHeader
              titulo={`Destinatários no Segmento (${segmento.length})`}
              descricao="Formandos do centro que cumprem atualmente os critérios desta campanha."
            />
            {segmento.length === 0 ? (
              <Vazio>Nenhum formando corresponde aos filtros desta campanha.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Contacto</Th>
                    <Th className="text-right">Formações</Th>
                    <Th>Interesse</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {segmento.map((f) => (
                    <tr key={f.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              f.nivelInteresse === "MUITO"
                                ? "bg-[#FBD34D] text-[#1C1D21]"
                                : "bg-[#1C1D21] text-white"
                            }`}
                          >
                            {iniciais(f.nome)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/formandos/${f.id}`}
                              className="block truncate font-semibold text-[#1C1D21] hover:underline"
                            >
                              {f.nome}
                            </Link>
                            <div className="truncate text-xs text-slate-500">{f.profissao ?? "Sem profissão"}</div>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-slate-600">{f.whatsapp}</Td>
                      <Td className="text-right font-semibold text-[#1C1D21]">{f.formacoesCompradas}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Badge cor={f.nivelInteresse === "MUITO" ? "verde" : "cinza"}>
                            {f.nivelInteresse === "MUITO" ? "Muito interesse" : "Pouco interesse"}
                          </Badge>
                          <span className="text-xs font-semibold text-[#1C1D21]">{f.pontuacaoInteresse} pts</span>
                        </div>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <a
                          href={linkWhatsapp(f.whatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-[#DDD9CE] bg-white px-2.5 text-xs font-medium text-[#1C1D21] hover:bg-[#F5F4EF]"
                        >
                          <MessageCircle className="size-3.5 text-emerald-600" aria-hidden /> WhatsApp
                        </a>
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>

          {/* 2. Matrículas Convertidas */}
          <Card>
            <CardHeader
              titulo={`Matrículas Convertidas (${campanha.matriculas.length})`}
              descricao="Inscrições em que esta campanha foi aplicada."
            />
            {campanha.matriculas.length === 0 ? (
              <Vazio>Ainda não existem matrículas convertidas com esta campanha.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Formação / Turma</Th>
                    <Th>Data</Th>
                    <Th className="text-right">Desconto</Th>
                    <Th className="text-right">Valor final</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {campanha.matriculas.map((m) => (
                    <tr key={m.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                            {iniciais(m.formando.nome)}
                          </span>
                          <Link
                            href={`/formandos/${m.formando.id}`}
                            className="font-semibold text-[#1C1D21] hover:underline"
                          >
                            {m.formando.nome}
                          </Link>
                        </div>
                      </Td>
                      <Td>
                        <div className="font-medium text-[#1C1D21]">{m.turma.formacao.nome}</div>
                        <Link
                          href={`/turmas/${m.turma.id}`}
                          className="mt-0.5 inline-block rounded-full bg-[#F6F5F0] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#1C1D21] hover:bg-[#FBD34D]"
                        >
                          {m.turma.codigo}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-slate-600">
                        {formatData(dataSimples(diaLocal(m.createdAt)))}
                      </Td>
                      <Td className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                        -{formatKz(m.desconto)}
                      </Td>
                      <Td className="text-right font-bold text-[#1C1D21] whitespace-nowrap">
                        {formatKz(m.valorTotal)}
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>

          {/* 3. Estatísticas de Entrega WhatsApp */}
          <Card>
            <CardHeader
              titulo={`Envios por WhatsApp (${campanha.mensagens.length})`}
              descricao="Estado de entrega das mensagens disparadas nesta campanha."
            />
            <div className="grid grid-cols-2 gap-2.5 border-b border-[#ECEAE3] p-4 sm:grid-cols-5">
              <div className="bg-hatched rounded-2xl border border-[#E5E3DC] p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Pendentes</div>
                <div className="mt-0.5 text-xl font-bold text-[#1C1D21]">{stats.pendentes}</div>
              </div>
              <div className="rounded-2xl bg-[#FBD34D] p-3 text-[#1C1D21]">
                <div className="text-[11px] font-semibold opacity-75 uppercase">Enviadas</div>
                <div className="mt-0.5 text-xl font-bold">{stats.enviadas}</div>
              </div>
              <div className="rounded-2xl bg-[#1C1D21] p-3 text-white">
                <div className="text-[11px] font-semibold text-white/70 uppercase">Entregues</div>
                <div className="mt-0.5 text-xl font-bold text-[#FBD34D]">{stats.entregues}</div>
              </div>
              <div className="rounded-2xl border border-[#E5E3DC] bg-[#F8F7F3] p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Lidas</div>
                <div className="mt-0.5 text-xl font-bold text-[#1C1D21]">{stats.lidas}</div>
              </div>
              <div className="rounded-2xl border border-red-200/80 bg-[#FCE9E7]/60 p-3">
                <div className="text-[11px] font-semibold text-[#9E2A2B] uppercase">Falhadas</div>
                <div className="mt-0.5 text-xl font-bold text-[#9E2A2B]">{stats.falhadas}</div>
              </div>
            </div>

            {campanha.mensagens.length === 0 ? (
              <Vazio>Esta campanha ainda não foi disparada por WhatsApp.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Formando</Th>
                    <Th>Destino</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={4}>
                  {campanha.mensagens.map((msg) => (
                    <tr key={msg.id}>
                      <Td className="whitespace-nowrap text-xs">
                        <Link href={`/mensagens/${msg.id}`} className="font-medium text-[#1C1D21] hover:underline">
                          {formatDataHora(msg.createdAt)}
                        </Link>
                      </Td>
                      <Td>
                        {msg.formando ? (
                          <Link
                            href={`/formandos/${msg.formando.id}`}
                            className="font-semibold text-[#1C1D21] hover:underline"
                          >
                            {msg.formando.nome}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-slate-600">{msg.destino}</Td>
                      <Td>
                        <BadgeEstadoMensagem estado={msg.estado} />
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>

        {/* Coluna Direita (350px) — Ficha de Segmentação & Pré-visualização WhatsApp */}
        <div className="space-y-5">
          {/* Ficha de Critérios com Linhas Pontilhadas (Referência 2) */}
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <Gift className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-[#1C1D21]">Critérios de Segmentação</div>
                <div className="text-xs text-slate-500">Filtros de seleção do público-alvo</div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline">
                <span className="text-slate-500">Tipo</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{NOMES_TIPO_CAMPANHA[campanha.tipo]}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Validade</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{validadeTexto}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Nível de interesse</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {campanha.filtroNivelInteresse === "MUITO"
                    ? "Muito interesse"
                    : campanha.filtroNivelInteresse === "POUCO"
                      ? "Pouco interesse"
                      : "Todos"}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Formações anteriores</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {campanha.filtroMinFormacoes !== null || campanha.filtroMaxFormacoes !== null
                    ? `Mín: ${campanha.filtroMinFormacoes ?? 0} · Máx: ${campanha.filtroMaxFormacoes ?? "∞"}`
                    : "Qualquer"}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Profissão contém</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{campanha.filtroProfissao ?? "Qualquer"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Intenção de compra</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {campanha.filtroIntencaoCompra === true
                    ? "Sim"
                    : campanha.filtroIntencaoCompra === false
                      ? "Não"
                      : "Indiferente"}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#F8F7F3] p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Users className="size-3.5" aria-hidden />
                  <span className="text-[11px]">No segmento</span>
                </div>
                <div className="mt-1 text-lg font-bold text-[#1C1D21]">{segmento.length}</div>
              </div>
              <div className="rounded-2xl bg-[#FBD34D]/25 p-3">
                <div className="flex items-center gap-1.5 text-[#1C1D21]">
                  <Sparkles className="size-3.5" aria-hidden />
                  <span className="text-[11px] font-medium">Desconto</span>
                </div>
                <div className="mt-1 text-lg font-bold text-[#1C1D21]">-{campanha.descontoPct}%</div>
              </div>
            </div>
          </div>

          {/* Pré-visualização do Modelo WhatsApp */}
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-[#1C1D21]">Mensagem de WhatsApp</h3>
              <p className="text-xs text-slate-500">Pré-visualização do texto enviado ao segmento</p>
            </div>
            <BolhaWhatsapp texto={textoPreview} hora="09:00" />
          </div>
        </div>
      </div>
    </div>
  );
}


