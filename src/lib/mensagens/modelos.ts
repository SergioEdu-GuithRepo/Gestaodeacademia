import type { TipoMensagem } from "@prisma/client";

/**
 * Modelos de mensagem padrão (WhatsApp). Cada centro pode personalizar o texto
 * em Configurações → Mensagens. Variáveis no formato {{nome}}.
 * Formatação WhatsApp: *negrito*, _itálico_.
 */

export type DefinicaoModelo = {
  nome: string;
  descricao: string;
  variaveis: string[];
  texto: string;
};

export const MODELOS_PADRAO: Record<
  Exclude<TipoMensagem, "MANUAL" | "TESTE" | "CAMPANHA" | "RELATORIO_IA" | "ALERTA_IA">,
  DefinicaoModelo
> = {
  LEMBRETE_VENCIMENTO: {
    nome: "Lembrete de vencimento",
    descricao: "Enviado antes do vencimento de uma parcela (antecedência configurável).",
    variaveis: ["primeiroNome", "nome", "formacao", "numeroParcela", "valor", "vencimento", "centro"],
    texto:
      "Olá {{primeiroNome}}! 👋\n\nLembramos que a parcela {{numeroParcela}} da formação *{{formacao}}*, no valor de *{{valor}}*, vence a *{{vencimento}}*.\n\nSe já efetuou o pagamento, por favor ignore esta mensagem.\n\n{{centro}}",
  },
  PARCELA_ATRASO: {
    nome: "Parcela em atraso",
    descricao: "Enviado quando uma parcela passa do vencimento (nos dias configurados).",
    variaveis: ["primeiroNome", "nome", "formacao", "numeroParcela", "valor", "vencimento", "diasAtraso", "divida", "centro"],
    texto:
      "Olá {{primeiroNome}}.\n\nA parcela {{numeroParcela}} da formação *{{formacao}}* ({{valor}}) venceu a {{vencimento}} e ainda não registámos o pagamento.\n\nValor total em dívida: *{{divida}}*.\n\nPrecisa de ajuda? Responda a esta mensagem.\n\n{{centro}}",
  },
  CONFIRMACAO_PAGAMENTO: {
    nome: "Confirmação de pagamento",
    descricao: "Enviado ao registar um pagamento, com as parcelas em falta.",
    variaveis: ["primeiroNome", "nome", "valor", "formacao", "parcelasEmFalta", "divida", "centro"],
    texto:
      "Olá {{primeiroNome}}! ✅\n\nConfirmamos a receção do seu pagamento de *{{valor}}* referente à formação *{{formacao}}*.\n\nParcelas em falta: {{parcelasEmFalta}} · Valor em dívida: {{divida}}.\n\nObrigado!\n{{centro}}",
  },
  PLANO_CONCLUIDO: {
    nome: "Plano totalmente pago",
    descricao: "Enviado quando o plano de pagamento fica liquidado, com sugestões do catálogo.",
    variaveis: ["primeiroNome", "nome", "formacao", "sugestoes", "centro"],
    texto:
      "Parabéns, {{primeiroNome}}! 🎉\n\nO pagamento da formação *{{formacao}}* está totalmente concluído. Obrigado pela confiança!\n\nTalvez também goste de:\n{{sugestoes}}\n\nFale connosco para saber as próximas datas.\n{{centro}}",
  },
  ANIVERSARIO: {
    nome: "Aniversário",
    descricao: "Enviado no dia de aniversário do formando.",
    variaveis: ["primeiroNome", "nome", "centro"],
    texto: "Muitos parabéns, {{primeiroNome}}! 🎂🎉\n\nToda a equipa do {{centro}} deseja-lhe um excelente dia e um ano cheio de conquistas.",
  },
  NOVO_LEAD: {
    nome: "Novo lead (para a equipa)",
    descricao: "Enviado à equipa comercial quando entra um lead qualificado pela landing page.",
    variaveis: ["nome", "whatsapp", "formacao", "turma", "preco", "origem", "link"],
    texto:
      "🔔 *Novo lead qualificado*\n\n👤 {{nome}}\n📱 {{whatsapp}}\n📚 {{formacao}} — {{turma}}\n💰 Aceitou o preço de {{preco}} e as datas\n📣 Origem: {{origem}}\n\n{{link}}",
  },
};

export type TipoModelo = keyof typeof MODELOS_PADRAO;
export const TIPOS_MODELO = Object.keys(MODELOS_PADRAO) as TipoModelo[];

export const NOMES_TIPO_MENSAGEM: Record<TipoMensagem, string> = {
  ...(Object.fromEntries(TIPOS_MODELO.map((t) => [t, MODELOS_PADRAO[t].nome])) as Record<TipoModelo, string>),
  CAMPANHA: "Campanha",
  RELATORIO_IA: "Relatório IA",
  ALERTA_IA: "Alerta IA",
  MANUAL: "Mensagem manual",
  TESTE: "Teste",
};

/** Substitui {{variavel}} pelos valores; variáveis desconhecidas ficam vazias. */
export function renderizar(texto: string, vars: Record<string, string | number | null | undefined>): string {
  return texto
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
