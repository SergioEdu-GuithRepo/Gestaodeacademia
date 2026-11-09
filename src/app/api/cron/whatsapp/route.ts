import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { agendarTodos } from "@/lib/mensagens/agendador";
import { processarFila, recuperarPresas, type EstadoWorker, type ResumoLote } from "@/lib/mensagens/envio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const estadoCron: EstadoWorker = { ultimoEnvio: new Map() };

function autorizado(req: NextRequest): boolean {
  const segredoCron = process.env.CRON_SECRET?.trim();
  if (!segredoCron) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${segredoCron}`;
}

async function executarCicloCron() {
  const presasRecuperadas = await recuperarPresas(prisma);
  const agendadas = await agendarTodos(prisma);

  const acumulado: ResumoLote = {
    processadas: 0,
    enviadas: 0,
    reagendadas: 0,
    falhadas: 0,
    canceladas: 0,
  };

  // Processa até 10 lotes na mesma invocação serverless
  for (let i = 0; i < 10; i++) {
    const r = await processarFila(prisma, estadoCron);
    acumulado.processadas += r.processadas;
    acumulado.enviadas += r.enviadas;
    acumulado.reagendadas += r.reagendadas;
    acumulado.falhadas += r.falhadas;
    acumulado.canceladas += r.canceladas;
    if (r.processadas === 0 && r.canceladas === 0) break;
  }

  return {
    ok: true,
    executadoEm: new Date().toISOString(),
    presasRecuperadas,
    agendadas,
    fila: acumulado,
  };
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await executarCicloCron();
  return NextResponse.json(resultado);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
