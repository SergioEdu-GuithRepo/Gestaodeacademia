"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eErroConflitoBD, procurarConflitos, validarIntervalo, type Conflito } from "@/lib/agenda";
import { exigir } from "@/lib/auth";
import { instanteLocal } from "@/lib/datas";
import { parseKz } from "@/lib/money";
import { campo, type EstadoForm } from "@/lib/utils";

// ─────────────────────────────── Turmas ────────────────────────────────────

const esquemaTurma = z.object({
  formacaoId: z.string().min(1, "Escolha a formação."),
  codigo: z
    .string()
    .min(2, "Indique um código (ex.: LID-02).")
    .max(30)
    .transform((s) => s.toUpperCase()),
  vagas: z.preprocess(
    (v) => (v === null ? null : Number(v)),
    z.number({ invalid_type_error: "Número inválido." }).int().min(1, "Mínimo 1.").max(500).nullable(),
  ),
  estado: z.enum(["PLANEADA", "EM_CURSO", "CONCLUIDA", "CANCELADA"]),
});

function lerTurma(fd: FormData) {
  return esquemaTurma.safeParse({
    formacaoId: campo(fd, "formacaoId") ?? "",
    codigo: campo(fd, "codigo") ?? "",
    vagas: campo(fd, "vagas"),
    estado: campo(fd, "estado") ?? "PLANEADA",
  });
}

function errosZod(e: z.ZodError) {
  return Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message]));
}

export async function guardarTurma(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("agenda:editar");
  const id = campo(fd, "id");
  const r = lerTurma(fd);
  if (!r.success) return { erros: errosZod(r.error) };

  const precoTxt = campo(fd, "preco");
  const preco = precoTxt ? parseKz(precoTxt) : null;
  if (precoTxt && preco === null) return { erros: { preco: "Valor inválido." } };

  const formacao = await db.formacao.findFirst({ where: { id: r.data.formacaoId } });
  if (!formacao) return { erros: { formacaoId: "Formação inexistente." } };

  const dados = { ...r.data, preco };
  let turmaId = id;
  try {
    if (id) {
      await db.turma.update({ where: { id }, data: dados });
    } else {
      turmaId = (await db.turma.create({ data: { ...dados, tenantId: user.tenantId } })).id;
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { erros: { codigo: "Já existe uma turma com este código." } };
    }
    throw e;
  }
  revalidatePath("/turmas");
  redirect(`/turmas/${turmaId}`);
}

// ─────────────────────────────── Sessões ───────────────────────────────────

export type EstadoSessaoForm = (NonNullable<EstadoForm> & { conflitos?: (Conflito & { data: string })[] }) | undefined;

const esquemaSessao = z.object({
  turmaId: z.string().min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indique a data."),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Indique a hora de início."),
  horaFim: z.string().regex(/^\d{2}:\d{2}$/, "Indique a hora de fim."),
  formadorId: z.string().min(1, "Escolha o formador."),
  salaId: z.string().min(1, "Escolha a sala."),
  repetirSemanas: z.coerce.number().int().min(1).max(26).default(1),
});

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Cria uma sessão (ou uma série semanal). Valida conflitos de turma, formador
 * e sala ANTES de gravar; se houver algum conflito, nada é gravado.
 */
export async function guardarSessao(_prev: EstadoSessaoForm, fd: FormData): Promise<EstadoSessaoForm> {
  const { user, db } = await exigir("agenda:editar");
  const sessaoId = campo(fd, "sessaoId");
  const r = esquemaSessao.safeParse({
    turmaId: campo(fd, "turmaId") ?? "",
    data: campo(fd, "data") ?? "",
    horaInicio: campo(fd, "horaInicio") ?? "",
    horaFim: campo(fd, "horaFim") ?? "",
    formadorId: campo(fd, "formadorId") ?? "",
    salaId: campo(fd, "salaId") ?? "",
    repetirSemanas: sessaoId ? 1 : (campo(fd, "repetirSemanas") ?? 1),
  });
  if (!r.success) return { erros: errosZod(r.error) };
  const s = r.data;

  // Garante que turma, formador e sala pertencem ao centro (o db isolado filtra por tenant)
  const [turma, formador, sala] = await Promise.all([
    db.turma.findFirst({ where: { id: s.turmaId } }),
    db.formador.findFirst({ where: { id: s.formadorId, ativo: true } }),
    db.sala.findFirst({ where: { id: s.salaId, ativa: true } }),
  ]);
  if (!turma) return { erro: "Turma inexistente." };
  if (!formador) return { erros: { formadorId: "Formador inexistente ou inativo." } };
  if (!sala) return { erros: { salaId: "Sala inexistente ou inativa." } };
  if (sessaoId) {
    const existente = await db.sessao.findFirst({ where: { id: sessaoId, turmaId: s.turmaId } });
    if (!existente) return { erro: "Sessão inexistente." };
  }

  const candidatas = Array.from({ length: s.repetirSemanas }, (_, i) => {
    const data = somarDias(s.data, i * 7);
    return {
      data,
      id: sessaoId ?? undefined,
      turmaId: s.turmaId,
      formadorId: s.formadorId,
      salaId: s.salaId,
      inicio: instanteLocal(data, s.horaInicio),
      fim: instanteLocal(data, s.horaFim),
    };
  });

  const erroIntervalo = validarIntervalo(candidatas[0]);
  if (erroIntervalo) return { erros: { horaFim: erroIntervalo } };

  const conflitos: (Conflito & { data: string })[] = [];
  for (const c of candidatas) {
    for (const k of await procurarConflitos(db, c)) conflitos.push({ ...k, data: c.data });
  }
  if (conflitos.length > 0) {
    return {
      erro:
        candidatas.length > 1
          ? `Não foi gravada nenhuma sessão: ${conflitos.length} conflito(s) na série.`
          : "A sessão não foi gravada porque está em conflito.",
      conflitos,
    };
  }

  try {
    if (sessaoId) {
      const c = candidatas[0];
      await db.sessao.update({
        where: { id: sessaoId },
        data: { formadorId: c.formadorId, salaId: c.salaId, inicio: c.inicio, fim: c.fim },
      });
    } else {
      await db.$transaction(async (tx) => {
        for (const c of candidatas) {
          await tx.sessao.create({
            data: {
              tenantId: user.tenantId,
              turmaId: c.turmaId,
              formadorId: c.formadorId,
              salaId: c.salaId,
              inicio: c.inicio,
              fim: c.fim,
            },
          });
        }
      });
    }
  } catch (e) {
    // Segunda camada: a BD rejeitou (ex.: outro utilizador gravou entretanto uma sessão em conflito)
    if (eErroConflitoBD(e)) {
      return { erro: "Outro utilizador acabou de ocupar este horário. Atualize a página e tente novamente." };
    }
    throw e;
  }

  revalidatePath(`/turmas/${s.turmaId}`);
  revalidatePath("/agenda");
  if (sessaoId) redirect(`/turmas/${s.turmaId}`);
  return {
    ok: candidatas.length > 1 ? `${candidatas.length} sessões agendadas.` : "Sessão agendada.",
  };
}

/** Marca uma sessão como realizada (com horas lecionadas), cancelada ou volta a agendada. */
export async function alterarEstadoSessao(fd: FormData) {
  const { db } = await exigir("agenda:editar");
  const sessaoId = campo(fd, "sessaoId");
  const estado = campo(fd, "estado");
  if (!sessaoId || !estado || !["AGENDADA", "REALIZADA", "CANCELADA"].includes(estado)) return;

  const sessao = await db.sessao.findFirst({ where: { id: sessaoId } });
  if (!sessao) return;

  if (estado === "REALIZADA") {
    const horasTxt = campo(fd, "horasLecionadas");
    const duracao = (sessao.fim.getTime() - sessao.inicio.getTime()) / 3_600_000;
    const horas = horasTxt ? Number(horasTxt.replace(",", ".")) : duracao;
    await db.sessao.update({
      where: { id: sessaoId },
      data: { estado: "REALIZADA", horasLecionadas: Number.isFinite(horas) && horas >= 0 ? horas.toFixed(2) : duracao.toFixed(2) },
    });
  } else if (estado === "AGENDADA" && sessao.estado === "CANCELADA") {
    // Reativar uma sessão cancelada volta a ocupar turma/formador/sala → validar conflitos
    const conflitos = await procurarConflitos(db, sessao);
    if (conflitos.length > 0) {
      redirect(`/turmas/${sessao.turmaId}?aviso=${encodeURIComponent(conflitos[0].mensagem)}`);
    }
    try {
      await db.sessao.update({ where: { id: sessaoId }, data: { estado: "AGENDADA" } });
    } catch (e) {
      if (eErroConflitoBD(e)) redirect(`/turmas/${sessao.turmaId}?aviso=${encodeURIComponent("Horário entretanto ocupado.")}`);
      throw e;
    }
  } else {
    await db.sessao.update({
      where: { id: sessaoId },
      data: { estado: estado as "AGENDADA" | "CANCELADA", ...(estado === "AGENDADA" ? { horasLecionadas: null } : {}) },
    });
  }
  revalidatePath(`/turmas/${sessao.turmaId}`);
  revalidatePath("/agenda");
}

export async function apagarSessao(fd: FormData) {
  const { db } = await exigir("agenda:editar");
  const sessaoId = campo(fd, "sessaoId");
  if (!sessaoId) return;
  const sessao = await db.sessao.findFirst({ where: { id: sessaoId } });
  if (!sessao) return;
  if (sessao.estado === "REALIZADA") {
    redirect(`/turmas/${sessao.turmaId}?aviso=${encodeURIComponent("Sessões realizadas não podem ser apagadas.")}`);
  }
  await db.sessao.delete({ where: { id: sessaoId } });
  revalidatePath(`/turmas/${sessao.turmaId}`);
  revalidatePath("/agenda");
}
