import { ShieldCheck } from "lucide-react";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, Tabela, Td, Th } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatDataHora } from "@/lib/datas";
import { NOMES_PERFIL } from "@/lib/rbac";
import {
  alterarAtivo,
  alterarPerfil,
  criarUtilizador,
  redefinirPassword,
} from "../configuracoes/actions";
import { BotaoAcao, NovoUtilizadorForm, PasswordForm, PerfilForm } from "../configuracoes/forms";

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "EQ";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
}

export async function GestaoUtilizadores({ meuId }: { meuId: string }) {
  const { user, db } = await exigir("utilizadores:gerir");
  const [utilizadores, acessos] = await Promise.all([
    db.user.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true },
    }),
    db.userSession.groupBy({
      by: ["userId"],
      where: { user: { tenantId: user.tenantId } },
      _max: { createdAt: true },
    }),
  ]);
  const ultimoAcesso = new Map(acessos.map((a) => [a.userId, a._max.createdAt]));
  const perfis = Object.entries(NOMES_PERFIL).map(([valor, nome]) => ({ valor, nome }));

  const totalAtivos = utilizadores.filter((u) => u.ativo).length;
  const nAdminFin = utilizadores.filter((u) => u.perfil === "ADMIN" || u.perfil === "FINANCEIRO").length;
  const nComercial = utilizadores.filter((u) => u.perfil === "COMERCIAL").length;
  const nPedagogico = utilizadores.filter((u) => u.perfil === "PEDAGOGICO").length;

  const soma = Math.max(1, nAdminFin + nComercial + nPedagogico);
  const pctAdminFin = Math.max(25, Math.round((nAdminFin * 100) / soma));
  const pctComercial = Math.max(20, Math.round((nComercial * 100) / soma));
  const pctPedagogico = Math.max(15, 100 - pctAdminFin - pctComercial);

  return (
    <div className="space-y-6">
      {/* Bloco de Métrica Principal + 3 Pílulas Proporcionais */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">
              Contas ativas na equipa / Total de utilizadores
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                {totalAtivos} {totalAtivos === 1 ? "ativo" : "ativos"}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span className="text-2xl font-normal tracking-tight text-zinc-600 sm:text-3xl">
                {utilizadores.length} membro(s)
              </span>
            </div>
          </div>

          <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
            Controlo de acesso por perfil (RBAC)
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div style={{ flex: pctAdminFin }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Direção e Finanças</span>
              <span className="font-semibold text-zinc-800">{nAdminFin} conta(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
              <span>Admin / Finanças</span>
              <span>{pctAdminFin}%</span>
            </div>
          </div>

          <div style={{ flex: pctComercial }} className="min-w-[140px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Comercial e Captação</span>
              <span className="font-semibold text-zinc-800">{nComercial} conta(s)</span>
            </div>
            <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
              <span>Vendas</span>
              <span>{pctComercial}%</span>
            </div>
          </div>

          <div style={{ flex: pctPedagogico }} className="min-w-[130px]">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Coordenação Pedagógica</span>
              <span className="font-semibold text-zinc-700">{nPedagogico} conta(s)</span>
            </div>
            <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
              <span>Ensino</span>
              <span>{pctPedagogico}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              titulo={`Membros da Equipa (${utilizadores.length})`}
              descricao="Altere perfis de acesso, desative acessos ou redefina palavras-passe."
            />
            <Tabela>
              <thead>
                <tr>
                  <Th>Utilizador</Th>
                  <Th>Perfil de Acesso</Th>
                  <Th>Estado</Th>
                  <Th>Último Acesso</Th>
                  <Th>Segurança</Th>
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={5}>
                {utilizadores.map((u) => {
                  const eu = u.id === meuId;
                  const acesso = ultimoAcesso.get(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${u.ativo ? "hover:bg-[#FBD34D]/10" : "bg-zinc-50/70 opacity-75"}`}
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-xs font-bold text-[#FBD34D]">
                            {iniciais(u.nome)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900">
                              {u.nome}{" "}
                              {eu && (
                                <span className="ml-1 rounded-full bg-[#FBD34D]/40 px-2 py-0.5 text-[10px] font-bold text-[#1C1D21]">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-xs break-all text-zinc-400">{u.email}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {eu ? (
                          <Badge cor="azul">{NOMES_PERFIL[u.perfil]}</Badge>
                        ) : (
                          <PerfilForm acao={alterarPerfil.bind(null, u.id)} perfil={u.perfil} perfis={perfis} />
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {u.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge cor="cinza">Inativo</Badge>}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-zinc-500">
                        {acesso ? formatDataHora(acesso) : "Sem registo"}
                      </Td>
                      <Td>
                        <div className="space-y-1.5">
                          {!eu &&
                            (u.ativo ? (
                              <BotaoAcao
                                acao={alterarAtivo.bind(null, u.id, false)}
                                rotulo="Desativar"
                                variante="fantasma"
                                pendenteRotulo="A desativar…"
                                confirmar={`Desativar ${u.nome}? Deixa de conseguir entrar e as sessões abertas são terminadas.`}
                              />
                            ) : (
                              <BotaoAcao
                                acao={alterarAtivo.bind(null, u.id, true)}
                                rotulo="Reativar"
                                variante="secundario"
                                pendenteRotulo="A reativar…"
                              />
                            ))}
                          <PasswordForm acao={redefinirPassword.bind(null, u.id)} nome={u.nome} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </TbodyProgressivo>
            </Tabela>
          </Card>

          <Card>
            <CardHeader
              titulo="Adicionar Membro à Equipa"
              descricao="O email indicado será utilizado para iniciar sessão na plataforma."
            />
            <NovoUtilizadorForm acao={criarUtilizador} perfis={perfis} />
          </Card>
        </div>

        {/* Coluna Lateral Direita: Matriz de Perfis e Permissões */}
        <aside className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
                <ShieldCheck className="size-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Perfis de Acesso</h2>
                <p className="text-xs text-zinc-400">Segregação de funções na academia</p>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Administração</span>
                <span className="leader-dots" />
                <span className="font-bold text-zinc-900">Acesso total</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Coord. Pedagógica</span>
                <span className="leader-dots" />
                <span className="font-semibold text-zinc-800">Ensino e Agenda</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Comercial</span>
                <span className="leader-dots" />
                <span className="font-semibold text-zinc-800">Leads e Matrículas</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400">Financeiro</span>
                <span className="leader-dots" />
                <span className="font-semibold text-zinc-800">Caixa e Honorários</span>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 border-t border-zinc-100 pt-4 text-xs text-zinc-600">
              <div className="rounded-2xl bg-[#FAF9F5] p-3">
                <strong className="block text-zinc-900">Proteção de Sessão</strong>
                Ao desativar um utilizador, todas as sessões ativas desse membro são encerradas de imediato.
              </div>
              <div className="rounded-2xl bg-[#FAF9F5] p-3">
                <strong className="block text-zinc-900">Continuidade Administrativa</strong>
                O sistema garante sempre pelo menos 1 conta de Administração ativa para evitar bloqueio do centro.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
