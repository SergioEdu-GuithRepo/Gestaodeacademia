/**
 * Dinheiro em kwanzas (AOA).
 * Todos os valores são guardados e calculados em cêntimos (bigint) para evitar
 * erros de arredondamento de vírgula flutuante.
 */

const formatter = new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata cêntimos como "150 000,00 Kz". */
export function formatKz(centimos: bigint | number | null | undefined): string {
  if (centimos === null || centimos === undefined) return "—";
  const valor = typeof centimos === "bigint" ? Number(centimos) / 100 : centimos / 100;
  return formatter.format(valor);
}

/**
 * Converte texto introduzido pelo utilizador (ex.: "150 000,50", "150000.5",
 * "150.000,50") em cêntimos. Devolve null se inválido.
 */
export function parseKz(texto: string | null | undefined): bigint | null {
  if (texto === null || texto === undefined) return null;
  const s = String(texto).trim().replace(/\s|Kz|AOA/gi, "");
  if (s === "") return null;

  // O separador decimal é o último "," ou "." se for seguido de 1–2 dígitos;
  // caso contrário (ex.: "150.000") os separadores são de milhares.
  const idx = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const digitosDepois = idx >= 0 ? s.length - idx - 1 : -1;
  let inteira = s;
  let decimal = "";
  if (digitosDepois === 0) return null;
  if (digitosDepois === 1 || digitosDepois === 2) {
    inteira = s.slice(0, idx);
    decimal = s.slice(idx + 1);
  }
  inteira = inteira.replace(/[.,]/g, "");
  if (!/^\d+$/.test(inteira) || (decimal !== "" && !/^\d{1,2}$/.test(decimal))) return null;
  return BigInt(inteira) * 100n + BigInt(decimal.padEnd(2, "0") || "0");
}


/** Cêntimos → string editável num input ("150000,50"). */
export function centimosParaInput(centimos: bigint | null | undefined): string {
  if (centimos === null || centimos === undefined) return "";
  const neg = centimos < 0n;
  const abs = neg ? -centimos : centimos;
  const inteira = abs / 100n;
  const dec = abs % 100n;
  return `${neg ? "-" : ""}${inteira}${dec === 0n ? "" : "," + dec.toString().padStart(2, "0")}`;
}

/** Soma uma lista de bigints. */
export function somar(valores: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of valores) total += v;
  return total;
}
