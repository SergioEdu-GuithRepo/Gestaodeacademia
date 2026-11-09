import { somarMeses } from "./datas";

/**
 * Regras de negócio de matrículas, parcelas e pagamentos (módulo 4.3).
 * Funções puras — sem acesso à BD — para poderem ser testadas isoladamente.
 */

export type ParcelaPlano = { numero: number; valor: bigint; vencimento: Date };

/**
 * Gera o plano de parcelas.
 * - O total é dividido em partes iguais; o resto (cêntimos) vai para a 1.ª parcela.
 * - A 1.ª parcela vence na data de inscrição; as seguintes, mensalmente.
 */
export function gerarParcelas(total: bigint, numParcelas: number, primeiroVencimento: Date): ParcelaPlano[] {
  if (!Number.isInteger(numParcelas) || numParcelas < 1) throw new Error("Número de parcelas inválido");
  if (total <= 0n) throw new Error("O valor total tem de ser positivo");
  const n = BigInt(numParcelas);
  const base = total / n;
  const resto = total - base * n;
  return Array.from({ length: numParcelas }, (_, i) => ({
    numero: i + 1,
    valor: i === 0 ? base + resto : base,
    vencimento: somarMeses(primeiroVencimento, i),
  }));
}

export type ParcelaSaldo = { id: string; numero: number; valor: bigint; pago: bigint };
export type Alocacao = { parcelaId: string; valor: bigint };

/** Acrescenta `pago` (soma das alocações) a uma parcela lida da BD com `include: { alocacoes: true }`. */
export function comPago<T extends { valor: bigint; alocacoes: { valor: bigint }[] }>(p: T): T & { pago: bigint } {
  return { ...p, pago: p.alocacoes.reduce((s, a) => s + a.valor, 0n) };
}

/**
 * Distribui um pagamento pelas parcelas em aberto, da mais antiga para a mais
 * recente. Lança erro se o pagamento exceder a dívida.
 */
export function alocarPagamento(valor: bigint, parcelas: ParcelaSaldo[]): Alocacao[] {
  if (valor <= 0n) throw new Error("O valor do pagamento tem de ser positivo");
  const divida = parcelas.reduce((s, p) => s + (p.valor - p.pago), 0n);
  if (valor > divida) throw new Error("O pagamento excede o valor em dívida");

  const alocacoes: Alocacao[] = [];
  let restante = valor;
  for (const p of [...parcelas].sort((a, b) => a.numero - b.numero)) {
    if (restante === 0n) break;
    const emFalta = p.valor - p.pago;
    if (emFalta <= 0n) continue;
    const aplicar = restante < emFalta ? restante : emFalta;
    alocacoes.push({ parcelaId: p.id, valor: aplicar });
    restante -= aplicar;
  }
  return alocacoes;
}

export type EstadoParcela = "PAGA" | "PARCIAL" | "EM_ATRASO" | "PENDENTE";

/** Estado derivado de uma parcela. `hoje` é uma data simples (meia-noite UTC). */
export function estadoParcela(p: { valor: bigint; pago: bigint; vencimento: Date }, hoje: Date): EstadoParcela {
  if (p.pago >= p.valor) return "PAGA";
  if (p.vencimento.getTime() < hoje.getTime()) return "EM_ATRASO";
  if (p.pago > 0n) return "PARCIAL";
  return "PENDENTE";
}

export type ResumoMatricula = {
  total: bigint;
  pago: bigint;
  divida: bigint;
  parcelasEmFalta: number;
  parcelasEmAtraso: number;
};

export function resumirParcelas(
  parcelas: { valor: bigint; pago: bigint; vencimento: Date }[],
  hoje: Date,
): ResumoMatricula {
  let total = 0n;
  let pago = 0n;
  let emFalta = 0;
  let emAtraso = 0;
  for (const p of parcelas) {
    total += p.valor;
    pago += p.pago > p.valor ? p.valor : p.pago;
    const e = estadoParcela(p, hoje);
    if (e !== "PAGA") emFalta++;
    if (e === "EM_ATRASO") emAtraso++;
  }
  return { total, pago, divida: total - pago, parcelasEmFalta: emFalta, parcelasEmAtraso: emAtraso };
}
