import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { aplicarAtualizacoes, interpretarWebhook } from "@/lib/mensagens/webhook";

/**
 * Webhook da Evolution API: /api/webhooks/evolution/<token>
 * O token secreto (Configurações → WhatsApp) identifica o centro.
 * Responde sempre 200 a eventos válidos (mesmo sem alterações) para a
 * Evolution não repetir o envio; 404 para tokens desconhecidos.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cfg = await prisma.configuracaoCentro.findUnique({ where: { webhookToken: token }, select: { tenantId: true } });
  if (!cfg) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  try {
    const atualizacoes = interpretarWebhook(corpo);
    const alteradas = atualizacoes.length ? await aplicarAtualizacoes(prisma, cfg.tenantId, atualizacoes) : 0;
    return NextResponse.json({ ok: true, recebidas: atualizacoes.length, alteradas });
  } catch (e) {
    console.error("[webhook evolution] erro", e);
    return NextResponse.json({ erro: "erro interno" }, { status: 500 });
  }
}
