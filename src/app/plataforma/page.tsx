import { Building2, ExternalLink, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { BotaoAcao } from "@/app/(app)/configuracoes/forms";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { LoginShowcase } from "@/components/login-showcase";
import { Alerta, Badge, Button, Card, CardHeader } from "@/components/ui";
import { urlBase } from "@/lib/configuracoes";
import { formatData } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { nomeInstanciaPadrao, temEvolutionGlobal } from "@/lib/mensagens/config";
import { decifrar, mascarar } from "@/lib/segredos";
import { autenticadoSuperAdmin } from "@/lib/superadmin";
import {
  alterarEstadoCentro,
  criarCentro,
  entrarComoAdminCentro,
  entrarSuperAdmin,
  guardarWhatsappCentroSuperAdmin,
  redefinirAdminCentro,
  sairSuperAdmin,
} from "./actions";
import {
  ConfigWhatsappCentroSuperAdminForm,
  LoginSuperAdminForm,
  NovoCentroForm,
  RedefinirAdminForm,
} from "./forms";

export const metadata = { title: "Painel da Plataforma (Super-Admin)" };

export default async function PlataformaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const autenticado = await autenticadoSuperAdmin();
  const { erro } = await searchParams;

  if (!autenticado) {
    return (
      <main className="grid min-h-dvh bg-[#F5F4EF] p-4 sm:p-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-8 lg:p-6">
        <div className="order-2 lg:order-1">
          <LoginShowcase />
        </div>

        <div className="order-1 flex items-center justify-center py-8 lg:order-2 lg:py-0">
          <div className="anim-enter w-full max-w-sm space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D] shadow-sm">
                <ShieldCheck className="size-6" aria-hidden />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1C1D21]">Painel Super-Admin</h1>
            </div>

            <Card>
              <LoginSuperAdminForm acao={entrarSuperAdmin} />
            </Card>
          </div>
        </div>
      </main>
    );
  }

  const h = await headers();
  const baseApp =
    urlBase(process.env.APP_URL, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")) ||
    "http://localhost:3100";
  const temGlobal = temEvolutionGlobal();

  const centros = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      configuracao: true,
      utilizadores: {
        orderBy: { createdAt: "asc" },
        select: { id: true, nome: true, email: true, perfil: true, ativo: true },
      },
      _count: {
        select: {
          formacoes: true,
          turmas: true,
          formandos: true,
          matriculas: true,
          leads: true,
        },
      },
    },
  });

  const totalFormandos = centros.reduce((s, c) => s + c._count.formandos, 0);
  const totalMatriculas = centros.reduce((s, c) => s + c._count.matriculas, 0);
  const totalTurmas = centros.reduce((s, c) => s + c._count.turmas, 0);
  const centrosAtivos = centros.filter((c) => c.utilizadores.some((u) => u.ativo)).length;

  return (
    <div className="min-h-dvh bg-[#F5F4EF]">
      <header className="border-b border-zinc-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D] shadow-2xs">
              <ShieldCheck className="size-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#1C1D21]">Painel Super-Admin da Plataforma</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
            >
              Login de Centro
            </Link>
            <form action={sairSuperAdmin}>
              <Button type="submit" variante="fantasma">
                <LogOut className="size-4" aria-hidden /> Terminar sessão
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
        {erro && <Alerta>{erro}</Alerta>}

        {/* Bloco Editorial de Métricas da Plataforma (Referência 2) */}
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div>
                <span className="text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">{centrosAtivos}</span>
                <span className="ml-1.5 text-xs font-medium text-zinc-500">centros ativos</span>
              </div>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <div>
                <span className="text-2xl font-normal tracking-tight text-[#1C1D21] sm:text-3xl">
                  {totalFormandos}
                </span>
                <span className="ml-1.5 text-xs font-medium text-zinc-500">formandos na plataforma</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-[#FAF9F5] px-4 py-1.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/80">
              <span className={`size-2 rounded-full ${temGlobal ? "bg-emerald-500" : "bg-[#FBD34D]"}`} />
              {temGlobal ? "Serviço WhatsApp global ativo" : "WhatsApp em modo por centro"}
            </div>
          </div>

          <div className="mt-5 flex h-10 w-full items-stretch gap-2 overflow-hidden">
            <div
              style={{ width: "38%" }}
              className="flex min-w-28 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21]"
            >
              <span>Centros registados</span>
              <span>{centros.length}</span>
            </div>
            <div
              style={{ width: "34%" }}
              className="flex min-w-28 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white"
            >
              <span>Matrículas totais</span>
              <span>{totalMatriculas}</span>
            </div>
            <div
              style={{ width: "28%" }}
              className="bg-hatched flex min-w-24 items-center justify-between rounded-full border border-zinc-300/80 px-4 text-xs font-semibold text-[#1C1D21]"
            >
              <span>Turmas criadas</span>
              <span>{totalTurmas}</span>
            </div>
          </div>
        </div>

        {/* Registar novo centro */}
        <Card>
          <CardHeader
            titulo="Registar Novo Centro de Formação"
            descricao="Cria o espaço do centro, a configuração inicial e a conta do Administrador, gerando as credenciais prontas a partilhar."
          />
          <NovoCentroForm acao={criarCentro} urlBaseApp={baseApp} />
        </Card>

        {/* Lista de centros (10 em 10) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-[#1C1D21]">Centros de Formação ({centros.length})</h2>
            <span className="text-xs text-zinc-500">Acesso direto e gestão de contas</span>
          </div>

          <GrelhaProgressiva
            passo={10}
            className="space-y-4"
            labelItem="centros"
          >
            {centros.map((c) => {
              const admins = c.utilizadores.filter((u) => u.perfil === "ADMIN");
              const ativos = c.utilizadores.filter((u) => u.ativo);
              const suspenso = ativos.length === 0;
              const adminPrincipal = admins[0];
              const cfg = c.configuracao;
              const modoWa = cfg?.whatsappModo ?? "SIMULACAO";
              const instWa = cfg?.evolutionInstancia || nomeInstanciaPadrao(c.slug);

              return (
                <Card key={c.id} className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
                        <Building2 className="size-5" aria-hidden />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[#1C1D21]">{c.nome}</h3>
                          <Badge cor={suspenso ? "vermelho" : "verde"}>{suspenso ? "Suspenso" : "Ativo"}</Badge>
                          <Badge cor={modoWa === "EVOLUTION" ? "verde" : modoWa === "SIMULACAO" ? "amarelo" : "cinza"}>
                            WhatsApp: {modoWa === "EVOLUTION" ? "Ativo" : modoWa === "SIMULACAO" ? "Modo de Teste" : "Desativado"}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Identificador: <code className="font-mono font-medium text-[#1C1D21]">{c.slug}</code> · Criado em{" "}
                          {formatData(c.createdAt)} · Catálogo público:{" "}
                          <Link
                            href={`/p/${c.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] hover:underline"
                          >
                            /p/{c.slug} <ExternalLink className="size-3" aria-hidden />
                          </Link>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!suspenso && (
                        <form action={entrarComoAdminCentro.bind(null, c.id)}>
                          <Button type="submit" variante="primario">
                            <LogIn className="size-4 text-[#FBD34D]" aria-hidden /> Entrar no Painel do Centro
                          </Button>
                        </form>
                      )}
                      <BotaoAcao
                        acao={alterarEstadoCentro.bind(null, c.id, suspenso)}
                        rotulo={suspenso ? "Reativar centro" : "Suspender centro"}
                        pendenteRotulo="A atualizar…"
                        variante={suspenso ? "primario" : "perigo"}
                        confirmar={
                          suspenso
                            ? `Reativar o acesso de todos os utilizadores de "${c.nome}"?`
                            : `Suspender "${c.nome}"? Todos os utilizadores deste centro serão desativados e as sessões abertas terminadas.`
                        }
                      />
                    </div>
                  </div>

                  {/* Indicadores e administradores */}
                  <div className="grid gap-4 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-[#1C1D21]">Administradores do centro:</span>
                      <ul className="mt-1.5 space-y-1 text-zinc-600">
                        {admins.map((a) => (
                          <li key={a.id}>
                            <span className="font-medium text-[#1C1D21]">{a.nome}</span> —{" "}
                            <code className="font-mono text-zinc-700">{a.email}</code>{" "}
                            {!a.ativo && <span className="text-red-600">(inativo)</span>}
                          </li>
                        ))}
                        {admins.length === 0 && <li>Sem administrador registado</li>}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-500">Equipa ativa</span>
                        <span className="leader-dots" />
                        <span className="font-semibold text-[#1C1D21]">
                          {ativos.length} / {c.utilizadores.length} utilizadores
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-500">Ensino e turmas</span>
                        <span className="leader-dots" />
                        <span className="font-semibold text-[#1C1D21]">
                          {c._count.formacoes} formações · {c._count.turmas} turmas
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-500">Comercial e inscrições</span>
                        <span className="leader-dots" />
                        <span className="font-semibold text-[#1C1D21]">
                          {c._count.formandos} formandos · {c._count.matriculas} matrículas · {c._count.leads} leads
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Gavetas de gestão de credenciais e WhatsApp */}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <RedefinirAdminForm
                      acao={redefinirAdminCentro.bind(null, c.id)}
                      emailPadrao={adminPrincipal?.email ?? `admin@${c.slug}.ao`}
                      nomePadrao={adminPrincipal?.nome ?? `Admin ${c.nome}`}
                    />
                    <ConfigWhatsappCentroSuperAdminForm
                      acao={guardarWhatsappCentroSuperAdmin.bind(null, c.id)}
                      modoAtual={modoWa}
                      instanciaAtual={instWa}
                      urlAtual={cfg?.evolutionUrl ?? ""}
                      chaveMascarada={mascarar(decifrar(cfg?.evolutionApiKey))}
                      temGlobal={temGlobal}
                      urlWebhook={cfg ? `${baseApp}/api/webhooks/evolution/${cfg.webhookToken}` : undefined}
                    />
                  </div>
                </Card>
              );
            })}
          </GrelhaProgressiva>
        </section>
      </main>
    </div>
  );
}
