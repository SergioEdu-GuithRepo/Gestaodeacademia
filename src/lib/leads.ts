import { createHash } from "node:crypto";
import type { EstadoLead } from "@prisma/client";
import { dataSimples, diaLocal, formatData } from "@/lib/datas";

/**
 * Funções puras de apoio às landing pages públicas (/p/…) e ao pipeline de
 * leads (/leads).
 */

export const NOMES_ESTADO_LEAD: Record<EstadoLead, string> = {
  NOVO: "Novo",
  CONTACTADO: "Contactado",
  CONVERTIDO: "Convertido",
  PERDIDO: "Perdido",
};

export const CORES_ESTADO_LEAD: Record<EstadoLead, "azul" | "amarelo" | "verde" | "cinza"> = {
  NOVO: "azul",
  CONTACTADO: "amarelo",
  CONVERTIDO: "verde",
  PERDIDO: "cinza",
};

export const LIMITE_LEADS_POR_IP_HORA = 5;

export function extrairIp(forwardedFor: string | null | undefined, realIp: string | null | undefined): string | null {
  const primeiro = forwardedFor?.split(",")[0]?.trim();
  if (primeiro) return primeiro;
  const r = realIp?.trim();
  return r || null;
}

/** Hash irreversível do IP para limitar submissões abusivas sem guardar o IP real. */
export function hashIp(ip: string | null | undefined): string | null {
  const limpo = ip?.trim();
  if (!limpo) return null;
  const sal = process.env.APP_SECRET || "gestao-academia-ip-salt";
  return createHash("sha256").update(`${sal}:${limpo}`).digest("hex").slice(0, 32);
}

export type ParametrosUtm = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
};

const CHAVES_UTM: (keyof ParametrosUtm)[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
];

export function extrairUtms(sp: Record<string, string | string[] | undefined>): ParametrosUtm {
  const res: ParametrosUtm = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
  };
  for (const k of CHAVES_UTM) {
    const bruto = sp[k];
    const v = Array.isArray(bruto) ? bruto[0] : bruto;
    const t = v?.trim().slice(0, 120);
    res[k] = t ? t : null;
  }
  return res;
}

export function querystringUtm(utms: ParametrosUtm): string {
  const p = new URLSearchParams();
  for (const k of CHAVES_UTM) {
    const v = utms[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Calcula o menor preço entre as turmas abertas e se existem preços diferentes ("a partir de"). */
export function rotuloPrecoFormacao(
  precoFormacao: bigint,
  precosTurmas: (bigint | null | undefined)[],
): { precoMinimo: bigint; aPartirDe: boolean } {
  if (precosTurmas.length === 0) return { precoMinimo: precoFormacao, aPartirDe: false };
  const efetivos = precosTurmas.map((p) => p ?? precoFormacao);
  let min = efetivos[0];
  let max = efetivos[0];
  for (const v of efetivos) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { precoMinimo: min, aPartirDe: min !== max };
}

/** Resume o intervalo de datas das sessões de uma turma no fuso de Luanda. */
export function resumoDatasTurma(
  sessoes: { inicio: Date; fim: Date }[],
): { inicio: Date; fim: Date; textoDatas: string } | null {
  if (sessoes.length === 0) return null;
  const ordenadas = [...sessoes].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const pri = ordenadas[0].inicio;
  const ult = ordenadas[ordenadas.length - 1].inicio;
  const d1 = formatData(dataSimples(diaLocal(pri)));
  const d2 = formatData(dataSimples(diaLocal(ult)));
  return {
    inicio: pri,
    fim: ult,
    textoDatas: d1 === d2 ? d1 : `${d1} a ${d2}`,
  };
}

export type LinhaCampanha = {
  origem: string;
  total: number;
  convertidos: number;
  taxa: number;
};

export function estatisticasCampanhas(
  leads: {
    estado: EstadoLead;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    fbclid?: string | null;
  }[],
): LinhaCampanha[] {
  const mapa = new Map<string, { total: number; convertidos: number }>();
  for (const l of leads) {
    const partes = [l.utmSource, l.utmCampaign].filter(Boolean);
    const chave =
      partes.length > 0
        ? partes.join(" / ")
        : l.fbclid
          ? "Facebook / Instagram (anúncio)"
          : "Direto";
    const atual = mapa.get(chave) ?? { total: 0, convertidos: 0 };
    atual.total += 1;
    if (l.estado === "CONVERTIDO") atual.convertidos += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.entries()]
    .map(([origem, { total, convertidos }]) => ({
      origem,
      total,
      convertidos,
      taxa: total > 0 ? Math.round((convertidos / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.origem.localeCompare(b.origem));
}
