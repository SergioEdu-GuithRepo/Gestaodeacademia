import type { EstadoMensagem } from "@prisma/client";
import { normalizarWhatsapp } from "@/lib/utils";

/**
 * Funções puras usadas em Configurações e Mensagens (sem acesso à BD),
 * para poderem ser testadas isoladamente.
 */

// ── Automações ───────────────────────────────────────────────────────────────

/**
 * Lê a lista de dias após o vencimento (ex.: "1, 7, 15").
 * Aceita vírgulas, ponto e vírgula ou espaços; remove duplicados e ordena.
 */
export function parseDiasAposAtraso(texto: string | null | undefined): { dias: number[] } | { erro: string } {
  const partes = (texto ?? "")
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const dias: number[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    const n = /^\d+$/.test(p) ? Number(p) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 90) invalidos.push(p);
    else dias.push(n);
  }
  if (invalidos.length > 0) return { erro: `Valores inválidos: ${invalidos.join(", ")} (use números de 1 a 90).` };
  if (dias.length > 10) return { erro: "Indique no máximo 10 dias." };
  return { dias: [...new Set(dias)].sort((a, b) => a - b) };
}

/**
 * Lê os números da equipa comercial (um por linha; também aceita vírgulas ou
 * ponto e vírgula). Normaliza para formato internacional e remove duplicados.
 */
export function parseNumerosEquipa(texto: string | null | undefined): { numeros: string[]; invalidos: string[] } {
  const linhas = (texto ?? "")
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const numeros: string[] = [];
  const invalidos: string[] = [];
  for (const l of linhas) {
    const n = normalizarWhatsapp(l);
    if (n) {
      if (!numeros.includes(n)) numeros.push(n);
    } else invalidos.push(l);
  }
  return { numeros, invalidos };
}

// ── WhatsApp: formatação ─────────────────────────────────────────────────────

export type Segmento =
  | { tipo: "texto"; texto: string }
  | { tipo: "quebra" }
  | { tipo: "negrito" | "italico" | "riscado"; filhos: Segmento[] };

const MARCADORES: Record<string, "negrito" | "italico" | "riscado"> = { "*": "negrito", _: "italico", "~": "riscado" };

/**
 * Formatação inline do WhatsApp: *negrito*, _itálico_, ~riscado~.
 * O marcador tem de abrir antes de um carácter não-espaço, fechar depois de um
 * não-espaço e não pode estar colado a letras/números (como na app).
 */
const RE_FORMATO = /(?<![\p{L}\p{N}])([*_~])(?!\s)(.+?)(?<!\s)\1(?![\p{L}\p{N}])/gu;

function tokenizarLinha(linha: string): Segmento[] {
  const res: Segmento[] = [];
  let ultimo = 0;
  for (const m of linha.matchAll(RE_FORMATO)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) res.push({ tipo: "texto", texto: linha.slice(ultimo, inicio) });
    res.push({ tipo: MARCADORES[m[1]], filhos: tokenizarLinha(m[2]) });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < linha.length) res.push({ tipo: "texto", texto: linha.slice(ultimo) });
  return res;
}

/** Converte texto com formatação WhatsApp numa árvore de segmentos (sem HTML). */
export function tokenizarWhatsapp(texto: string): Segmento[] {
  const res: Segmento[] = [];
  texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((linha, i) => {
      if (i > 0) res.push({ tipo: "quebra" });
      res.push(...tokenizarLinha(linha));
    });
  return res;
}

/** Valores de exemplo para pré-visualizar os modelos. */
export const VALORES_EXEMPLO: Record<string, string> = {
  primeiroNome: "Ana",
  nome: "Ana Manuela Domingos",
  formacao: "Excel Avançado",
  numeroParcela: "2",
  valor: "25 000,00 Kz",
  vencimento: "15/11/2026",
  diasAtraso: "3",
  divida: "50 000,00 Kz",
  parcelasEmFalta: "2",
  sugestoes: "• Power BI — 95 000,00 Kz\n• Gestão de Projetos — 120 000,00 Kz",
  whatsapp: "+244923000000",
  turma: "EXC-2026-11 (início 03/11/2026)",
  preco: "75 000,00 Kz",
  origem: "Facebook / campanha-outubro",
  link: "https://app.exemplo.ao/leads?id=…",
};

// ── Diversos ─────────────────────────────────────────────────────────────────

/** Encurta um texto numa só linha com reticências. */
export function truncar(texto: string | null | undefined, max: number): string {
  if (!texto) return "";
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…` : t;
}

/** URL base da aplicação: APP_URL ou, na falta dele, os cabeçalhos do pedido. */
export function urlBase(appUrl: string | null | undefined, host: string | null, proto: string | null): string {
  const app = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (app) return app;
  if (!host) return "";
  const p = (proto ?? "").split(",")[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${p}://${host}`;
}

export const NOMES_ESTADO_MENSAGEM: Record<EstadoMensagem, string> = {
  PENDENTE: "Pendente",
  ENVIANDO: "A enviar",
  ENVIADA: "Enviada",
  ENTREGUE: "Entregue",
  LIDA: "Lida",
  FALHADA: "Falhada",
  CANCELADA: "Cancelada",
};

/** Classes Tailwind do badge de cada estado. */
export const CORES_ESTADO_MENSAGEM: Record<EstadoMensagem, string> = {
  PENDENTE: "bg-slate-100 text-slate-700",
  ENVIANDO: "bg-blue-50 text-blue-700 ring-blue-600/20",
  ENVIADA: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ENTREGUE: "bg-emerald-100 text-emerald-800 ring-emerald-600/30",
  LIDA: "bg-emerald-600 text-white ring-emerald-700",
  FALHADA: "bg-red-50 text-red-700 ring-red-600/20",
  CANCELADA: "bg-slate-50 text-slate-400 line-through",
};
