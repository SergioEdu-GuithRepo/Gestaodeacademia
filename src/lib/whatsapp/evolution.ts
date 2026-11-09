/**
 * Cliente mínimo da Evolution API (v2).
 * Independente do tipo de ligação da instância (QR/Baileys ou API oficial).
 */

export type ConfigEvolution = { url: string; apiKey: string; instancia: string };

export class ErroEnvio extends Error {
  constructor(
    message: string,
    /** Permanente: não adianta tentar de novo (ex.: número inexistente, credenciais). */
    readonly permanente: boolean,
    readonly estadoHttp?: number,
  ) {
    super(message);
    this.name = "ErroEnvio";
  }
}

const TIMEOUT_MS = 15_000;

export function normalizarUrlEvolution(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/manager$/i, "");
}

function base(cfg: ConfigEvolution) {
  return normalizarUrlEvolution(cfg.url);
}

async function pedido(cfg: ConfigEvolution, caminho: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${base(cfg)}${caminho}`, {
      ...init,
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "tempo de resposta esgotado" : String((e as Error)?.message ?? e);
    throw new ErroEnvio(`Não foi possível comunicar com o serviço de WhatsApp (${msg}).`, false);
  }

  const texto = await res.text();
  let corpo: unknown = texto;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    /* resposta não-JSON */
  }

  if (!res.ok) {
    const detalhe = extrairErro(corpo) ?? (texto.slice(0, 300) || res.statusText);
    // 408/425/429 e 5xx são transitórios; restantes 4xx são permanentes.
    const transitorio = res.status >= 500 || [408, 425, 429].includes(res.status);
    throw new ErroEnvio(`Serviço de WhatsApp (${res.status}): ${detalhe}`, !transitorio, res.status);
  }
  return corpo;
}

function extrairErro(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = corpo as any;
  const m = c.response?.message ?? c.message ?? c.error;
  if (Array.isArray(m)) return m.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
  return typeof m === "string" ? m : m ? JSON.stringify(m) : null;
}

/** Envia uma mensagem de texto. Devolve o id externo (key.id) da mensagem. */
export async function enviarTexto(cfg: ConfigEvolution, destino: string, texto: string): Promise<string | null> {
  const numero = destino.replace(/\D/g, "");
  const corpo = await pedido(cfg, `/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
    method: "POST",
    body: JSON.stringify({ number: numero, text: texto }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = corpo as any;
  return c?.key?.id ?? c?.data?.key?.id ?? c?.id ?? null;
}

/** Estado da ligação da instância ("open" = ligada). */
export async function estadoConexao(cfg: ConfigEvolution): Promise<string> {
  const corpo = await pedido(cfg, `/instance/connectionState/${encodeURIComponent(cfg.instancia)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = corpo as any;
  return String(c?.instance?.state ?? c?.state ?? "desconhecido");
}

export type ResultadoQr = {
  estado: string;
  qrCodeBase64: string | null;
  pairingCode: string | null;
};

function normalizarDataUrlQr(val: unknown): string | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const s = val.trim();
  return s.startsWith("data:image/") ? s : `data:image/png;base64,${s}`;
}

function extrairQr(corpo: unknown): ResultadoQr {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (corpo ?? {}) as any;
  const qrCodeBase64 = normalizarDataUrlQr(c?.base64 ?? c?.qrcode?.base64);
  const pairingCode = typeof (c?.pairingCode ?? c?.qrcode?.pairingCode) === "string"
    ? String(c?.pairingCode ?? c?.qrcode?.pairingCode)
    : null;
  const estadoBruto = c?.instance?.state ?? c?.instance?.status ?? c?.state;
  const estado = typeof estadoBruto === "string" && estadoBruto
    ? estadoBruto
    : qrCodeBase64
      ? "connecting"
      : "desconhecido";
  return { estado, qrCodeBase64, pairingCode };
}

/**
 * Garante que a instância existe, configura o webhook (melhor esforço)
 * e devolve o estado atual ou o QR Code para emparelhar o WhatsApp do centro.
 */
export async function obterQrOuCriarInstancia(cfg: ConfigEvolution, urlWebhook?: string): Promise<ResultadoQr> {
  const inst = encodeURIComponent(cfg.instancia);
  let corpo: unknown;
  try {
    corpo = await pedido(cfg, `/instance/connect/${inst}`);
  } catch (e) {
    if (e instanceof ErroEnvio && e.estadoHttp === 404) {
      corpo = await pedido(cfg, "/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: cfg.instancia,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          ...(urlWebhook
            ? {
                webhook: {
                  url: urlWebhook,
                  byEvents: false,
                  base64: false,
                  events: ["MESSAGES_UPDATE", "SEND_MESSAGE"],
                },
              }
            : {}),
        }),
      });
    } else {
      throw e;
    }
  }

  let resultado = extrairQr(corpo);
  if (resultado.estado !== "open" && !resultado.qrCodeBase64) {
    try {
      await pedido(cfg, `/instance/logout/${inst}`, { method: "DELETE" });
    } catch {
      /* Ignora se a sessão ainda não estava ativa */
    }
    try {
      const novoCorpo = await pedido(cfg, `/instance/connect/${inst}`);
      resultado = extrairQr(novoCorpo);
    } catch {
      /* Mantém o resultado anterior */
    }
  }

  if (urlWebhook) {
    try {
      await pedido(cfg, `/webhook/set/${inst}`, {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: urlWebhook,
            webhookByEvents: false,
            webhookBase64: false,
            events: ["MESSAGES_UPDATE", "SEND_MESSAGE"],
          },
        }),
      });
    } catch {
      /* Ignora diferenças entre sub-versões no endpoint de webhook */
    }
  }

  return resultado;
}

/** Desassocia o número de WhatsApp atual da instância do centro. */
export async function desligarInstancia(cfg: ConfigEvolution): Promise<void> {
  await pedido(cfg, `/instance/logout/${encodeURIComponent(cfg.instancia)}`, {
    method: "DELETE",
  });
}
