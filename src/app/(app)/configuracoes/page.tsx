import Link from "next/link";
import { MessageCircle, ShieldUser } from "lucide-react";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { MODELOS_PADRAO, TIPOS_MODELO } from "@/lib/mensagens/modelos";
import { pode } from "@/lib/rbac";
import { decifrar, mascarar } from "@/lib/segredos";
import { cn } from "@/lib/utils";
import { GestaoUtilizadores } from "../utilizadores/gestao-utilizadores";
import {
  desligarWhatsapp,
  enviarMensagemTeste,
  gerarQrCodeWhatsapp,
  guardarAutomacoes,
  guardarBancariosCertificadosAction,
  guardarFidelizacaoAction,
  guardarModelo,
  guardarRelatoriosIaAction,
  guardarWhatsapp,
  reporModelo,
  testarLigacao,
} from "./actions";
import {
  AutomacoesForm,
  BancariosCertificadosForm,
  EmparelharWhatsapp,
  EnviarTesteForm,
  FidelizacaoForm,
  ModeloEditor,
  RelatoriosIaConfigForm,
  WhatsappForm,
} from "./forms";

export const metadata = { title: "Configurações" };

const SEPARADORES = [
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "automacoes", nome: "Automações" },
  { id: "pagamentos", nome: "Bancos e Certificados" },
  { id: "ia", nome: "Relatórios IA (Claude)" },
  { id: "modelos", nome: "Modelos de Mensagem" },
  { id: "fidelizacao", nome: "Fidelização e Indicação" },
  { id: "utilizadores", nome: "Equipa" },
] as const;
type Separador = (typeof SEPARADORES)[number]["id"];

const NOMES_MODO = {
  DESATIVADO: "Desativado",
  SIMULACAO: "Modo de Teste",
  EVOLUTION: "WhatsApp Ativo",
} as const;

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, db } = await exigir("configuracoes:editar");
  const { tab } = await searchParams;
  const gerirUtilizadores = pode(user.perfil, "utilizadores:gerir");
  const separadores = SEPARADORES.filter((s) => s.id !== "utilizadores" || gerirUtilizadores);
  const atual: Separador = separadores.find((s) => s.id === tab)?.id ?? "whatsapp";

  const cfg = await obterConfiguracao(comoCliente(db), user.tenantId);

  const automacoesAtivasCount =
    (cfg.lembretesAtivos ? 1 : 0) + (cfg.confirmacoesAtivas ? 1 : 0) + (cfg.aniversariosAtivos ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Configurações do Centro</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ligação de WhatsApp, regras de automação, fidelização e equipa de <strong>{user.tenant.nome}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/mensagens"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <MessageCircle className="size-3.5 text-zinc-500" aria-hidden /> Histórico de WhatsApp
          </Link>
          {gerirUtilizadores && (
            <Link
              href="/utilizadores"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
            >
              <ShieldUser className="size-3.5 text-[#FBD34D]" aria-hidden /> Gerir Equipa
            </Link>
          )}
        </div>
      </div>

      {/* Bloco de Métrica Principal + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">
              Estado do canal WhatsApp / Benefício de Fidelização e Indicação
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {NOMES_MODO[cfg.whatsappModo]}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-700 sm:text-3xl">
                {cfg.descontoFidelizacaoPct}% fidelização · +{cfg.pontosPorIndicacao} pts
              </span>
            </div>
          </div>

          <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
            Envio automático às {String(cfg.horaEnvio).padStart(2, "0")}:00 · Pausa {cfg.intervaloEnvioSegundos}s
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: 38 }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Canal de comunicação</span>
              <span className="font-semibold text-zinc-800">{NOMES_MODO[cfg.whatsappModo]}</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>WhatsApp</span>
              <span>{automacoesAtivasCount}/3 regras ativas</span>
            </div>
          </div>

          <div style={{ flex: 32 }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Desconto de fidelização</span>
              <span className="font-semibold text-zinc-800">{cfg.descontoFidelizacaoPct}% recorrentes</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Fidelização</span>
              <span>-{cfg.descontoFidelizacaoPct}%</span>
            </div>
          </div>

          <div style={{ flex: 30 }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Programa de indicação</span>
              <span className="font-semibold text-zinc-700">Até {cfg.limiteDescontoIndicacaoPct}% máx.</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Indicação</span>
              <span>+{cfg.pontosPorIndicacao} pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Separadores em Pílula */}
      <nav aria-label="Secções de configuração" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="inline-flex min-w-max items-center gap-1 rounded-full bg-white p-1.5 shadow-2xs ring-1 ring-zinc-200/80">
          {separadores.map((s) => {
            const ativo = s.id === atual;
            return (
              <li key={s.id}>
                <Link
                  href={`/configuracoes?tab=${s.id}`}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full px-4 text-xs font-semibold whitespace-nowrap transition-colors",
                    ativo
                      ? "bg-[#1C1D21] text-[#FBD34D] shadow-2xs"
                      : "text-zinc-600 hover:bg-[#FAF9F5] hover:text-zinc-900",
                  )}
                >
                  {s.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {atual === "whatsapp" && <SeparadorWhatsapp cfg={cfg} />}

      {atual === "automacoes" && (
        <Card>
          <CardHeader
            titulo="Automações e Apresentação Pública"
            descricao="Mensagens enviadas automaticamente aos formandos, alertas comerciais e texto público do catálogo."
          />
          {cfg.whatsappModo === "DESATIVADO" && (
            <div className="px-6 pt-4">
              <Alerta tipo="aviso">
                O WhatsApp está desativado: nenhuma automação é enviada.{" "}
                <Link href="/configuracoes?tab=whatsapp" className="font-semibold underline">
                  Ativar canal
                </Link>
              </Alerta>
            </div>
          )}
          <AutomacoesForm
            acao={guardarAutomacoes}
            valores={{
              lembretesAtivos: cfg.lembretesAtivos,
              diasAntesVencimento: cfg.diasAntesVencimento,
              diasAposAtraso: cfg.diasAposAtraso.join(", "),
              confirmacoesAtivas: cfg.confirmacoesAtivas,
              aniversariosAtivos: cfg.aniversariosAtivos,
              horaEnvio: cfg.horaEnvio,
              numerosEquipaComercial: cfg.numerosEquipaComercial.join("\n"),
              apresentacaoPublica: cfg.apresentacaoPublica ?? "",
            }}
          />
        </Card>
      )}

      {atual === "pagamentos" && (
        <Card>
          <CardHeader
            titulo="Dados Bancários (IBAN / Express) e Emissão de Certificados"
            descricao="Configure as coordenadas bancárias apresentadas no Portal do Formando e a assiduidade mínima exigida para emissão automática de certificados com QR Code."
          />
          <BancariosCertificadosForm
            acao={guardarBancariosCertificadosAction}
            valores={{
              bancoNome: cfg.bancoNome ?? "",
              iban: cfg.iban ?? "",
              titularConta: cfg.titularConta ?? "",
              multicaixaExpress: cfg.multicaixaExpress ?? "",
              minAssiduidadeCertificadoPct: cfg.minAssiduidadeCertificadoPct,
            }}
          />
        </Card>
      )}

      {atual === "ia" && (
        <Card>
          <CardHeader
            titulo="Relatórios Automáticos IA (Claude) e Alertas de Anomalia"
            descricao="Defina frequência (semanal, mensal e alertas imediatos), canal de entrega (WhatsApp / E-mail), destinatários e chave API do Claude."
          />
          <RelatoriosIaConfigForm
            acao={guardarRelatoriosIaAction}
            valores={{
              iaAtiva: cfg.iaAtiva,
              temChaveClaudePropria: Boolean(cfg.anthropicApiKey),
              chaveClaudeMascarada: mascarar(decifrar(cfg.anthropicApiKey)),
              temChaveClaudeGlobal: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
              modeloClaude: cfg.modeloClaude,
              relatorioSemanalAtivo: cfg.relatorioSemanalAtivo,
              diaSemanaRelatorio: cfg.diaSemanaRelatorio,
              relatorioMensalAtivo: cfg.relatorioMensalAtivo,
              diaMesRelatorio: cfg.diaMesRelatorio,
              horaRelatorio: cfg.horaRelatorio,
              alertasImediatosAtivos: cfg.alertasImediatosAtivos,
              limiarInadimplenciaPct: cfg.limiarInadimplenciaPct,
              canalRelatorio: cfg.canalRelatorio,
              destinatariosWhatsappRelatorio: cfg.destinatariosWhatsappRelatorio.join("\n"),
              destinatariosEmailRelatorio: cfg.destinatariosEmailRelatorio.join("\n"),
              temChaveEmailPropria: Boolean(cfg.resendApiKey),
              chaveEmailMascarada: mascarar(decifrar(cfg.resendApiKey)),
              emailRemetente: cfg.emailRemetente ?? "",
            }}
          />
        </Card>
      )}

      {atual === "modelos" && <SeparadorModelos centro={user.tenant.nome} />}

      {atual === "fidelizacao" && (
        <Card>
          <CardHeader
            titulo="Fidelização e Programa de Indicação"
            descricao="Configure o desconto de fidelização para formandos recorrentes e as regras de acumulação e resgate de pontos por indicação."
          />
          <FidelizacaoForm
            acao={guardarFidelizacaoAction}
            valores={{
              descontoFidelizacaoPct: cfg.descontoFidelizacaoPct,
              pontosPorIndicacao: cfg.pontosPorIndicacao,
              percentagemPorPonto: cfg.percentagemPorPonto,
              limiteDescontoIndicacaoPct: cfg.limiteDescontoIndicacaoPct,
              validadePontosMeses: cfg.validadePontosMeses,
            }}
          />
        </Card>
      )}

      {atual === "utilizadores" && gerirUtilizadores && <GestaoUtilizadores meuId={user.id} />}
    </div>
  );
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

function SeparadorWhatsapp({ cfg }: { cfg: Awaited<ReturnType<typeof obterConfiguracao>> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="self-start">
        <CardHeader
          titulo="Modo de Envio do WhatsApp"
          descricao="Defina se o centro envia mensagens reais, valida em modo de teste ou desativa o envio."
          acoes={
            <Badge cor={cfg.whatsappModo === "EVOLUTION" ? "verde" : cfg.whatsappModo === "SIMULACAO" ? "amarelo" : "cinza"}>
              {NOMES_MODO[cfg.whatsappModo]}
            </Badge>
          }
        />
        <WhatsappForm
          acao={guardarWhatsapp}
          valores={{
            whatsappModo: cfg.whatsappModo,
            intervaloEnvioSegundos: cfg.intervaloEnvioSegundos,
          }}
        />
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader
            titulo="1. Associar Telemóvel do Centro"
            descricao="Ligue o WhatsApp do centro através da leitura do QR Code."
          />
          <EmparelharWhatsapp
            gerarQr={gerarQrCodeWhatsapp}
            testar={testarLigacao}
            desligar={desligarWhatsapp}
          />
        </Card>

        <Card>
          <CardHeader titulo="2. Enviar Mensagem de Teste" descricao="Verifique se o telemóvel recebe a mensagem." />
          <div className="p-6">
            <EnviarTesteForm acao={enviarMensagemTeste} />
            <p className="mt-2.5 text-xs text-zinc-500">
              {cfg.whatsappModo === "SIMULACAO"
                ? "Em modo de teste a mensagem fica registada no histórico, sem envio externo."
                : "A mensagem é enviada de imediato e fica registada no histórico."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Modelos ──────────────────────────────────────────────────────────────────

async function SeparadorModelos({ centro }: { centro: string }) {
  const { db } = await exigir("configuracoes:editar");
  const personalizados = await db.modeloMensagem.findMany();
  const porTipo = new Map(personalizados.map((m) => [m.tipo, m]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white px-5 py-3.5 text-xs text-zinc-600 shadow-2xs ring-1 ring-zinc-200/70">
        Personalize o texto de cada mensagem automática. Mensagens desativadas não são enviadas. As variáveis{" "}
        <code className="rounded bg-[#FAF9F5] px-1.5 py-0.5 font-mono font-semibold text-zinc-900">{"{{…}}"}</code> são
        substituídas automaticamente no momento do envio.
      </div>
      <GrelhaProgressiva passo={10} labelItem="modelos" className="space-y-4">
        {TIPOS_MODELO.map((tipo) => {
          const def = MODELOS_PADRAO[tipo];
          const p = porTipo.get(tipo);
          return (
            <Card key={tipo}>
              <ModeloEditor
                tipo={tipo}
                acao={guardarModelo.bind(null, tipo)}
                repor={reporModelo.bind(null, tipo)}
                nome={def.nome}
                descricao={def.descricao}
                variaveis={def.variaveis}
                texto={p?.texto ?? def.texto}
                padrao={def.texto}
                ativo={p?.ativo ?? true}
                personalizado={!!p}
                centro={centro}
              />
            </Card>
          );
        })}
      </GrelhaProgressiva>
    </div>
  );
}
