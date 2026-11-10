import { NextResponse, type NextRequest } from "next/server";
import { executarCicloCronRelatorios } from "@/lib/ia/entrega";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: NextRequest): boolean {
  const segredoCron = process.env.CRON_SECRET?.trim();
  if (!segredoCron) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${segredoCron}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await executarCicloCronRelatorios();
  return NextResponse.json(resultado);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
