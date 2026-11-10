import { createHmac, randomBytes } from "node:crypto";
import type { EstadoMatricula } from "@prisma/client";
import QRCode from "qrcode";

export type ElegibilidadeCertificado = {
  elegivel: boolean;
  motivosBloqueio: string[];
};

/**
 * Verifica se uma matrícula cumpre os critérios obrigatórios para emissão/download
 * do Certificado de Conclusão:
 * 1. Matrícula no estado `CONCLUIDA`.
 * 2. Plano financeiro 100% liquidado (`divida <= 0n`).
 * 3. Assiduidade igual ou superior ao mínimo do centro (`minAssiduidadePct`, padrão 75%).
 */
export function verificarElegibilidadeCertificado(params: {
  estadoMatricula: EstadoMatricula;
  dividaCentimos: bigint;
  assiduidadePct: number;
  minAssiduidadePct: number;
  revogado?: boolean;
}): ElegibilidadeCertificado {
  const motivos: string[] = [];

  if (params.revogado) {
    motivos.push("Certificado revogado pela coordenação pedagógica.");
  }
  if (params.estadoMatricula === "CANCELADA") {
    motivos.push("Matrícula cancelada.");
  } else if (params.estadoMatricula !== "CONCLUIDA") {
    motivos.push("A matrícula ainda se encontra em curso (aguarda fecho pedagógico da turma).");
  }

  if (params.dividaCentimos > 0n) {
    motivos.push("Existem valores financeiros pendentes no plano de parcelas.");
  }

  if (params.assiduidadePct < params.minAssiduidadePct) {
    motivos.push(
      `Assiduidade insuficiente (${params.assiduidadePct}% face ao mínimo exigido de ${params.minAssiduidadePct}%).`,
    );
  }

  return {
    elegivel: motivos.length === 0,
    motivosBloqueio: motivos,
  };
}

/** Gera código público legível e único (ex.: CERT-2026-8F4K2M). */
export function gerarCodigoCertificado(ano = new Date().getFullYear()): string {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let sufixo = "";
  for (let i = 0; i < 8; i++) {
    sufixo += alfabeto[bytes[i] % alfabeto.length];
  }
  return `CERT-${ano}-${sufixo}`;
}

/** Gera SVG vetorial limpo para o QR Code de validação pública do certificado. */
export async function gerarQrCodeSvg(urlVerificacao: string): Promise<string> {
  return QRCode.toString(urlVerificacao, {
    type: "svg",
    margin: 1,
    width: 136,
    errorCorrectionLevel: "M",
    color: {
      dark: "#1C1D21",
      light: "#FFFFFF",
    },
  });
}

/**
 * Gera chave determinística mas irreversível (HMAC-SHA256) para impedir que o
 * mesmo formando avalie o mesmo formador mais do que uma vez na mesma turma,
 * mantendo total anonimato na tabela `AvaliacaoFormador`.
 */
export function chaveAvaliacaoAnonima(matriculaId: string, formadorId: string): string {
  const segredo = process.env.APP_SECRET?.trim() || "dev-apenas-nao-usar-em-producao";
  return createHmac("sha256", segredo)
    .update(`avaliacao-anonima:v1:${matriculaId}:${formadorId}`)
    .digest("hex");
}
