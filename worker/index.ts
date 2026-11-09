/**
 * Worker de mensagens WhatsApp.
 *
 *   npm run worker
 *
 * - A cada INTERVALO_FILA_MS processa a fila (`Mensagem` PENDENTE).
 * - A cada INTERVALO_AGENDA_MS gera lembretes, avisos de atraso e aniversários.
 * - Recupera mensagens presas em ENVIANDO (ex.: após reinício).
 *
 * Corre como serviço separado no Railway (mesma imagem, comando `npm run worker`).
 * Pode haver mais do que uma instância (a fila usa SKIP LOCKED), mas o ritmo
 * por centro (intervaloEnvioSegundos) só é garantido com uma instância.
 */
import { prisma } from "@/lib/db";
import { agendarTodos } from "@/lib/mensagens/agendador";
import { processarFila, recuperarPresas, type EstadoWorker } from "@/lib/mensagens/envio";

const INTERVALO_FILA_MS = Number(process.env.WORKER_INTERVALO_FILA_MS ?? 2_000);
const INTERVALO_AGENDA_MS = Number(process.env.WORKER_INTERVALO_AGENDA_MS ?? 60_000);

const estado: EstadoWorker = { ultimoEnvio: new Map() };
let parar = false;
let ultimaAgenda = 0;

function log(msg: string) {
  console.log(`${new Date().toISOString()} [worker] ${msg}`);
}

async function ciclo() {
  const agora = Date.now();
  if (agora - ultimaAgenda >= INTERVALO_AGENDA_MS) {
    ultimaAgenda = agora;
    const presas = await recuperarPresas(prisma);
    if (presas) log(`${presas} mensagem(ns) presa(s) devolvida(s) à fila`);
    const a = await agendarTodos(prisma);
    if (a.lembretes || a.atrasos || a.aniversarios) {
      log(`agendadas: ${a.lembretes} lembrete(s), ${a.atrasos} aviso(s) de atraso, ${a.aniversarios} aniversário(s)`);
    }
  }
  const r = await processarFila(prisma, estado);
  if (r.processadas || r.canceladas) {
    log(
      `fila: ${r.enviadas} enviada(s), ${r.reagendadas} reagendada(s), ${r.falhadas} falhada(s), ${r.canceladas} cancelada(s)`,
    );
  }
}

async function main() {
  log(`a iniciar (fila ${INTERVALO_FILA_MS} ms, agenda ${INTERVALO_AGENDA_MS} ms)`);
  while (!parar) {
    try {
      await ciclo();
    } catch (e) {
      // Erros de infraestrutura (ex.: BD indisponível): regista e tenta no próximo ciclo.
      console.error(`${new Date().toISOString()} [worker] erro no ciclo`, e);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_FILA_MS));
  }
  await prisma.$disconnect();
  log("terminado");
}

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    log(`${sinal} recebido, a terminar após o ciclo atual…`);
    parar = true;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
