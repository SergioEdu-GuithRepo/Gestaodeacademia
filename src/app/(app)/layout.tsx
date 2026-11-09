import { Shell, type ItemMenu } from "@/components/shell";
import { exigir } from "@/lib/auth";
import { NOMES_PERFIL, pode, type Permissao } from "@/lib/rbac";

const MENU: (ItemMenu & { permissao: Permissao })[] = [
  { href: "/painel", label: "Visão Geral", icone: "painel", grupo: "Início", permissao: "painel:ver" },

  // Ensino e Agenda
  { href: "/formacoes", label: "Formações", icone: "formacoes", grupo: "1. Ensino e Agenda", permissao: "formacoes:ver" },
  { href: "/salas", label: "Salas", icone: "salas", grupo: "1. Ensino e Agenda", permissao: "salas:ver" },
  { href: "/formadores", label: "Formadores", icone: "formadores", grupo: "1. Ensino e Agenda", permissao: "formadores:ver" },
  { href: "/turmas", label: "Turmas", icone: "turmas", grupo: "1. Ensino e Agenda", permissao: "agenda:ver" },
  { href: "/agenda", label: "Calendário", icone: "agenda", grupo: "1. Ensino e Agenda", permissao: "agenda:ver" },

  // Vendas e Clientes
  { href: "/leads", label: "Leads", icone: "leads", grupo: "2. Vendas e Clientes", permissao: "leads:ver" },
  { href: "/formandos", label: "Formandos", icone: "formandos", grupo: "2. Vendas e Clientes", permissao: "formandos:ver" },
  { href: "/campanhas", label: "Campanhas", icone: "campanhas", grupo: "2. Vendas e Clientes", permissao: "campanhas:ver" },

  // Finanças e Caixa
  { href: "/financeiro", label: "Caixa e Finanças", icone: "financeiro", grupo: "3. Finanças e Caixa", permissao: "financeiro:ver" },

  // Portais e Sistema
  { href: "/portais", label: "Portal", icone: "portais", grupo: "4. Portais e Sistema", permissao: "painel:ver" },
  { href: "/mensagens", label: "WhatsApp", icone: "mensagens", grupo: "4. Portais e Sistema", permissao: "mensagens:ver" },
  { href: "/utilizadores", label: "Equipa", icone: "utilizadores", grupo: "4. Portais e Sistema", permissao: "utilizadores:gerir" },
  { href: "/configuracoes", label: "Configurações", icone: "configuracoes", grupo: "4. Portais e Sistema", permissao: "configuracoes:editar" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await exigir();

  const itens: ItemMenu[] = MENU.filter((m) => {
    if (!pode(user.perfil, m.permissao)) return false;
    if (
      user.perfil === "FINANCEIRO" &&
      (m.grupo === "1. Ensino e Agenda" || m.grupo === "2. Vendas e Clientes")
    ) {
      return false;
    }
    return true;
  }).map((m) => ({
    href: m.href,
    label: m.label,
    icone: m.icone,
    grupo: m.grupo,
    destaque: m.destaque,
  }));
  return (
    <Shell
      itens={itens}
      centro={user.tenant.nome}
      slugCentro={pode(user.perfil, "leads:ver") ? user.tenant.slug : undefined}
      utilizador={user.nome}
      perfil={NOMES_PERFIL[user.perfil]}
      podeMatricular={pode(user.perfil, "matriculas:editar")}
      podeCriarFormando={pode(user.perfil, "formandos:editar")}
    >
      {children}
    </Shell>
  );
}
