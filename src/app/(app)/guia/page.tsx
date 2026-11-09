import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Compass,
  ExternalLink,
  Gift,
  GraduationCap,
  Megaphone,
  MessageCircle,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Guia Passo a Passo",
};

export default async function GuiaPage() {
  const { user, db } = await exigir("painel:ver");

  const [
    nFormacoes,
    nSalas,
    nFormadores,
    nTurmas,
    nSessoes,
    nLeads,
    nFormandos,
    nMatriculas,
    nPagamentos,
    nCampanhas,
    nDespesas,
    nMensagens,
    primeiroFormador,
    primeiroFormando,
    cfg,
  ] = await Promise.all([
    db.formacao.count({ where: { ativa: true } }),
    db.sala.count({ where: { ativa: true } }),
    db.formador.count({ where: { ativo: true } }),
    db.turma.count({ where: { estado: { in: ["PLANEADA", "EM_CURSO"] } } }),
    db.sessao.count({ where: { estado: { not: "CANCELADA" } } }),
    db.lead.count(),
    db.formando.count(),
    db.matricula.count({ where: { estado: { not: "CANCELADA" } } }),
    db.pagamento.count(),
    db.campanha.count(),
    db.despesa.count(),
    db.mensagem.count(),
    db.formador.findFirst({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, portalToken: true },
    }),
    db.formando.findFirst({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, portalToken: true },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  const etapas = [
    {
      num: "01",
      titulo: "Catálogo & Agenda",
      resumo: `${nFormacoes} formações · ${nTurmas} turmas · ${nSessoes} sessões`,
      href: "/formacoes",
      pronto: nFormacoes > 0 && nSalas > 0 && nFormadores > 0 && nTurmas > 0,
      destaque: "ouro" as const,
    },
    {
      num: "02",
      titulo: "Página Pública & Leads",
      resumo: `${nLeads} lead(s) captado(s) em /p/${user.tenant.slug}`,
      href: "/leads",
      pronto: nLeads > 0,
      destaque: "escuro" as const,
    },
    {
      num: "03",
      titulo: "Matrículas & Parcelas",
      resumo: `${nFormandos} formandos · ${nMatriculas} matrículas ativas`,
      href: "/matriculas/nova",
      pronto: nFormandos > 0 && nMatriculas > 0,
      destaque: "ouro" as const,
    },
    {
      num: "04",
      titulo: "WhatsApp & Campanhas",
      resumo: `Modo ${cfg.whatsappModo} · ${nCampanhas} campanha(s)`,
      href: "/campanhas",
      pronto: cfg.whatsappModo !== "DESATIVADO" || nMensagens > 0 || nCampanhas > 0,
      destaque: "tracejado" as const,
    },
    {
      num: "05",
      titulo: "Tesouraria & Formadores",
      resumo: `${nPagamentos} recebimentos · ${nDespesas} despesas`,
      href: "/financeiro",
      pronto: nDespesas > 0 || nPagamentos > 0,
      destaque: "escuro" as const,
    },
    {
      num: "06",
      titulo: "Portais Pessoais",
      resumo: "Links diretos para formadores e formandos",
      href: "/portais",
      pronto: Boolean(primeiroFormador && primeiroFormando),
      destaque: "ouro" as const,
    },
  ];

  const etapasProntas = etapas.filter((e) => e.pronto).length;
  const pctPronto = Math.round((etapasProntas / etapas.length) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Roteiro de Operação"
        descricao={`Guia prático e estado operacional de ${user.tenant.nome} passo a passo.`}
        acoes={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/p/${user.tenant.slug}`} target="_blank" variante="secundario">
              Catálogo Público <ExternalLink className="size-3.5" aria-hidden />
            </LinkButton>
            <LinkButton href="/portais" variante="primario">
              <Smartphone className="size-4 text-[#FBD34D]" aria-hidden /> Abrir Portais
            </LinkButton>
          </div>
        }
      />

      {/* 4 Cartões KPI Editoriais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Maturidade Operacional</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
              <Compass className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {etapasProntas} / {etapas.length}
            </span>
            <span className="text-xs font-semibold text-zinc-500">({pctPronto}%)</span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE2]">
            <div
              style={{ width: `${Math.max(8, pctPronto)}%` }}
              className="h-full rounded-full bg-[#FBD34D] transition-all duration-500"
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Ensino & Agenda</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#FBD34D] text-[#1C1D21]">
              <GraduationCap className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {nTurmas} <span className="text-sm font-medium text-zinc-500">turma(s)</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nFormacoes} formações · {nFormadores} formadores · {nSessoes} sessões
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Comercial & Retenção</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#F5F4EF] text-[#1C1D21]">
              <Megaphone className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {nFormandos} <span className="text-sm font-medium text-zinc-500">formando(s)</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nLeads} leads · {nMatriculas} matrículas · {nCampanhas} campanhas
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Tesouraria & WhatsApp</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#E7F4E8] text-[#1E6332]">
              <Wallet className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {nPagamentos} <span className="text-sm font-medium text-zinc-500">pagamento(s)</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nDespesas} despesas · {nMensagens} mensagens ({cfg.whatsappModo})
          </p>
        </Card>
      </div>

      {/* Mapa Visual Resumido do Fluxo com Pílulas e Linhas Pontilhadas */}
      <Card>
        <CardHeader
          titulo="Fluxo Integrado da Academia (1 → 6)"
          descricao="Da abertura do catálogo de formações até ao apuramento da sobra operacional e acesso nos portais pessoais."
          acoes={<Badge cor="azul">Atalho de pesquisa: ⌘K ou Ctrl+K</Badge>}
        />
        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {etapas.map((item) => (
            <Link
              key={item.num}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1C1D21]/30 hover:bg-white hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={
                        item.pronto
                          ? "flex size-7 items-center justify-center rounded-full bg-[#1C1D21] text-xs font-bold text-[#FBD34D]"
                          : "flex size-7 items-center justify-center rounded-full bg-[#ECEAE2] text-xs font-bold text-zinc-600"
                      }
                    >
                      {item.num}
                    </span>
                    <span className="text-sm font-semibold text-[#1C1D21]">{item.titulo}</span>
                  </div>
                  {item.pronto ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[#288042]" aria-hidden />
                  ) : (
                    <CircleDot className="size-4 shrink-0 text-[#D97706]" aria-hidden />
                  )}
                </div>
                <p className="mt-2.5 text-xs text-zinc-500">{item.resumo}</p>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-dotted border-zinc-200/90 pt-2.5 text-xs">
                <span className={item.pronto ? "font-medium text-[#1E6332]" : "font-medium text-[#92400E]"}>
                  {item.pronto ? "Com dados registados" : "Pronto a iniciar"}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] transition-transform group-hover:translate-x-0.5">
                  Abrir <ArrowUpRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Os 6 Cenários Detalhados */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CENÁRIO 1 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="01 · Ensino, Turmas e Agenda Sem Conflitos"
              descricao="Configure formações, salas, formadores com preço/hora e planeie sessões."
              acoes={
                <Badge cor={nTurmas > 0 ? "verde" : "amarelo"}>
                  {nTurmas > 0 ? `${nTurmas} turma(s) ativa(s)` : "Comece por aqui"}
                </Badge>
              }
            />
            <div className="space-y-4 p-6">
              <div className="space-y-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs">
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Formações ativas no catálogo</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{nFormacoes}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Salas & laboratórios disponíveis</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{nSalas}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Corpo de formadores ativos</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{nFormadores}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Sessões programadas ou realizadas</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{nSessoes}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Formações & Salas:</strong> registe o curso com carga horária, categoria (Técnica ou Comportamental), preço em Kwanzas e a capacidade de cada sala.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Formadores:</strong> defina o valor/hora por categoria ou por formação e registe avaliações nos 5 critérios pedagógicos (escala de 1 a 5).
                </p>
                <p>
                  <strong className="text-[#1C1D21]">3. Validação anti-conflito:</strong> ao agendar sessões numa turma, o sistema impede automaticamente sobreposições de sala, formador ou turma no mesmo horário.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton href="/formacoes" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              <BookOpen className="size-3.5" aria-hidden /> Formações
            </LinkButton>
            <LinkButton href="/salas" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Salas
            </LinkButton>
            <LinkButton href="/formadores" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              <GraduationCap className="size-3.5" aria-hidden /> Formadores
            </LinkButton>
            <LinkButton href="/turmas" variante="primario" className="min-h-8.5 px-3.5 text-xs">
              Turmas & Sessões
            </LinkButton>
            <LinkButton href="/agenda" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Agenda
            </LinkButton>
          </div>
        </Card>

        {/* CENÁRIO 2 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="02 · Catálogo Público e Funil de Leads"
              descricao="Capte pré-cadastros qualificados a partir de campanhas digitais com aceitação explícita de preço e datas."
              acoes={<Badge cor={nLeads > 0 ? "verde" : "cinza"}>{nLeads} lead(s)</Badge>}
            />
            <div className="space-y-4 p-6">
              <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs">
                <div className="font-semibold text-[#1C1D21]">Endereço público para anúncios (Instagram / Facebook):</div>
                <code className="mt-1.5 block rounded-xl bg-white px-3 py-2 font-mono text-[11px] text-[#1C1D21] ring-1 ring-zinc-200/80">
                  /p/{user.tenant.slug}?utm_source=instagram&amp;utm_campaign=destaque
                </code>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Catálogo automático:</strong> todas as formações ativas com pelo menos uma turma aberta e sessões futuras ficam disponíveis na página pública do centro.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Dupla confirmação:</strong> o interessado escolhe a turma e confirma que aceita o preço e o calendário de aulas antes de submeter.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">3. Conversão num clique:</strong> em <em>Leads</em>, acompanhe a origem UTM e converta o contacto diretamente em Formando rumo à matrícula.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton
              href={`/p/${user.tenant.slug}?utm_source=instagram&utm_campaign=destaque`}
              target="_blank"
              variante="primario"
              className="min-h-8.5 px-3.5 text-xs"
            >
              Ver Catálogo Público <ExternalLink className="size-3.5" aria-hidden />
            </LinkButton>
            <LinkButton href="/leads" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              <Megaphone className="size-3.5" aria-hidden /> Funil de Leads ({nLeads})
            </LinkButton>
          </div>
        </Card>

        {/* CENÁRIO 3 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="03 · Matrículas, Benefícios e Plano de Parcelas"
              descricao="Inscreva formandos a pronto ou às prestações com descontos cumulativos e crédito automático de indicação."
              acoes={
                <Badge cor={nMatriculas > 0 ? "verde" : "cinza"}>
                  {nMatriculas} matrícula(s) · {nPagamentos} pagamento(s)
                </Badge>
              }
            />
            <div className="space-y-4 p-6">
              <div className="space-y-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs">
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Desconto de fidelização (ex-formandos)</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{cfg.descontoFidelizacaoPct}%</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Crédito por cada novo indicado matriculado</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{cfg.pontosPorIndicacao} pontos</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Limite de resgate de pontos por matrícula</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">Até {cfg.limiteDescontoIndicacaoPct}%</span>
                </div>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Recomendação entre formandos:</strong> ao registar um formando com <em>Indicado por</em>, a primeira matrícula credita automaticamente pontos a quem o recomendou.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Simulação de prestações:</strong> defina de 1 a 12 parcelas mensais e registe logo o pagamento da 1.ª prestação com emissão de confirmação por WhatsApp.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton href="/matriculas/nova" variante="primario" className="min-h-8.5 px-3.5 text-xs">
              + Nova Matrícula
            </LinkButton>
            <LinkButton href="/formandos" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              <UserRound className="size-3.5" aria-hidden /> Formandos ({nFormandos})
            </LinkButton>
            {primeiroFormando && (
              <LinkButton href={`/formandos/${primeiroFormando.id}`} variante="secundario" className="min-h-8.5 px-3.5 text-xs">
                Ficha de {primeiroFormando.nome.split(" ")[0]}
              </LinkButton>
            )}
          </div>
        </Card>

        {/* CENÁRIO 4 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="04 · WhatsApp Automático e Campanhas Sazonais"
              descricao="Gerencie lembretes de vencimento, mensagens de aniversário e campanhas segmentadas com controlo de orçamento."
              acoes={
                <Badge cor={cfg.whatsappModo === "EVOLUTION" ? "verde" : cfg.whatsappModo === "SIMULACAO" ? "azul" : "amarelo"}>
                  WhatsApp: {cfg.whatsappModo}
                </Badge>
              }
            />
            <div className="space-y-4 p-6">
              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Ligação por QR Code ou Simulação:</strong> em <em>Configurações</em>, emparelhe o WhatsApp do centro ou utilize o modo de simulação para validar todos os disparos na fila.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Campanhas com validação de margem:</strong> crie campanhas sazonais (até 20%) ou segmentadas por profissão e nível de interesse, comparando o orçamento com a sobra operacional do mês.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">3. Rastreio de entregas:</strong> acompanhe em <em>Mensagens</em> o estado de cada envio (Pendente, Enviada, Entregue, Lida ou Falhada).
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton href="/campanhas" variante="primario" className="min-h-8.5 px-3.5 text-xs">
              <Gift className="size-3.5" aria-hidden /> Campanhas ({nCampanhas})
            </LinkButton>
            <LinkButton href="/mensagens" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              <MessageCircle className="size-3.5" aria-hidden /> Mensagens ({nMensagens})
            </LinkButton>
            <LinkButton href="/configuracoes" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Configurações
            </LinkButton>
          </div>
        </Card>

        {/* CENÁRIO 5 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="05 · Tesouraria, Honorários e Rentabilidade"
              descricao="Apure automaticamente o valor devido aos formadores pelas aulas realizadas, registe despesas e exporte relatórios."
              acoes={<Badge cor={nDespesas > 0 ? "verde" : "cinza"}>{nDespesas} despesa(s)</Badge>}
            />
            <div className="space-y-4 p-6">
              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Folha de formadores automática:</strong> cada sessão confirmada como <em>Realizada</em> multiplica as horas lecionadas pelo valor/hora do formador e permite liquidar em 1 clique.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Rentabilidade por formação:</strong> compare receitas arrecadadas, custos de formadores e despesas diretas de cada curso.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">3. Previsão 30/60/90 dias & CSV:</strong> projete entradas de parcelas face às aulas agendadas e exporte ficheiros para a contabilidade.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton href="/financeiro" variante="primario" className="min-h-8.5 px-3.5 text-xs">
              <Wallet className="size-3.5" aria-hidden /> Tesouraria
            </LinkButton>
            <LinkButton href="/financeiro?tab=formadores" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Honorários
            </LinkButton>
            <LinkButton href="/financeiro?tab=formacoes" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Rentabilidade
            </LinkButton>
            <LinkButton href="/financeiro?tab=previsao" variante="secundario" className="min-h-8.5 px-3.5 text-xs">
              Previsão 30/60/90 d
            </LinkButton>
          </div>
        </Card>

        {/* CENÁRIO 6 */}
        <Card className="flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader
              titulo="06 · Portais Pessoais do Formador e do Formando"
              descricao="Links individuais seguros enviados por WhatsApp para acesso imediato no telemóvel sem necessidade de palavras-passe."
              acoes={<Badge cor="azul">Acesso Móvel Direto</Badge>}
            />
            <div className="space-y-4 p-6">
              <div className="space-y-2 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong className="text-[#1C1D21]">1. Portal do Formador:</strong> consulta de próximas aulas, confirmação de sessões lecionadas e sumários, extrato de honorários e média de avaliações.
                </p>
                <p>
                  <strong className="text-[#1C1D21]">2. Portal do Formando:</strong> consulta de turmas e horários, plano de parcelas (pagas, pendentes ou em atraso), saldo de pontos e botão para convidar amigos no WhatsApp.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
            <LinkButton href="/portais" variante="primario" className="min-h-8.5 px-3.5 text-xs">
              <Smartphone className="size-3.5" aria-hidden /> Central de Portais
            </LinkButton>
            {primeiroFormador && (
              <LinkButton
                href={`/portal/formador/${primeiroFormador.portalToken}`}
                target="_blank"
                variante="secundario"
                className="min-h-8.5 px-3.5 text-xs"
              >
                Portal de {primeiroFormador.nome.split(" ")[0]} <ExternalLink className="size-3" aria-hidden />
              </LinkButton>
            )}
            {primeiroFormando && (
              <LinkButton
                href={`/portal/formando/${primeiroFormando.portalToken}`}
                target="_blank"
                variante="secundario"
                className="min-h-8.5 px-3.5 text-xs"
              >
                Portal de {primeiroFormando.nome.split(" ")[0]} <ExternalLink className="size-3" aria-hidden />
              </LinkButton>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
