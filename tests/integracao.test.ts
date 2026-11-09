/**
 * Testes de integração contra o PostgreSQL local (DATABASE_URL).
 * Verificam as garantias que só a BD dá: exclusion constraints de agenda e
 * isolamento entre centros. Criam centros temporários e apagam-nos no fim.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eErroConflitoBD, procurarConflitos } from "@/lib/agenda";
import { instanteLocal } from "@/lib/datas";
import { comRls, dbTenant, prisma } from "@/lib/db";

const sufixo = Date.now().toString(36);
const ids: Record<string, string> = {};

async function apagarTenant(id: string) {
  const w = { where: { tenantId: id } };
  await prisma.sessao.deleteMany(w);
  await prisma.turma.deleteMany(w);
  await prisma.formacao.deleteMany(w);
  await prisma.sala.deleteMany(w);
  await prisma.formador.deleteMany(w);
  await prisma.formando.deleteMany(w);
  await prisma.auditLog.deleteMany(w);
  await prisma.tenant.delete({ where: { id } }).catch(() => {});
}

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { nome: "Teste A", slug: `teste-a-${sufixo}` } });
  const t2 = await prisma.tenant.create({ data: { nome: "Teste B", slug: `teste-b-${sufixo}` } });
  ids.tenant = t.id;
  ids.tenant2 = t2.id;
  const tenantId = t.id;
  const f = await prisma.formacao.create({
    data: { tenantId, nome: "F", slug: "f", cargaHoraria: 10, preco: 100n, categoria: "TECNICA" },
  });
  ids.turma1 = (await prisma.turma.create({ data: { tenantId, formacaoId: f.id, codigo: "T1" } })).id;
  ids.turma2 = (await prisma.turma.create({ data: { tenantId, formacaoId: f.id, codigo: "T2" } })).id;
  ids.formador1 = (await prisma.formador.create({ data: { tenantId, nome: "Formador 1" } })).id;
  ids.formador2 = (await prisma.formador.create({ data: { tenantId, nome: "Formador 2" } })).id;
  ids.sala1 = (await prisma.sala.create({ data: { tenantId, nome: "Sala 1" } })).id;
  ids.sala2 = (await prisma.sala.create({ data: { tenantId, nome: "Sala 2" } })).id;
  ids.formando = (await prisma.formando.create({ data: { tenantId, nome: "Formando A", whatsapp: "+244900000001" } })).id;

  await prisma.sessao.create({
    data: {
      tenantId,
      turmaId: ids.turma1,
      formadorId: ids.formador1,
      salaId: ids.sala1,
      inicio: instanteLocal("2030-01-07", "18:00"),
      fim: instanteLocal("2030-01-07", "21:00"),
    },
  });
});

afterAll(async () => {
  if (ids.tenant) await apagarTenant(ids.tenant);
  if (ids.tenant2) await apagarTenant(ids.tenant2);
  await prisma.$disconnect();
});

function nova(over: Partial<{ turmaId: string; formadorId: string; salaId: string; ini: string; fim: string; estado: "AGENDADA" | "CANCELADA" }>) {
  return prisma.sessao.create({
    data: {
      tenantId: ids.tenant,
      turmaId: over.turmaId ?? ids.turma2,
      formadorId: over.formadorId ?? ids.formador2,
      salaId: over.salaId ?? ids.sala2,
      inicio: instanteLocal("2030-01-07", over.ini ?? "19:00"),
      fim: instanteLocal("2030-01-07", over.fim ?? "20:00"),
      estado: over.estado ?? "AGENDADA",
    },
  });
}

describe("exclusion constraints de agenda (BD)", () => {
  it("bloqueia a mesma sala em simultâneo", async () => {
    await expect(nova({ salaId: ids.sala1 })).rejects.toSatisfy(eErroConflitoBD);
  });

  it("bloqueia o mesmo formador em simultâneo", async () => {
    await expect(nova({ formadorId: ids.formador1 })).rejects.toSatisfy(eErroConflitoBD);
  });

  it("bloqueia a mesma turma em simultâneo", async () => {
    await expect(nova({ turmaId: ids.turma1 })).rejects.toSatisfy(eErroConflitoBD);
  });

  it("permite sessões encostadas (21:00–22:00 na mesma sala)", async () => {
    const s = await nova({ salaId: ids.sala1, formadorId: ids.formador1, turmaId: ids.turma1, ini: "21:00", fim: "22:00" });
    expect(s.id).toBeTruthy();
    await prisma.sessao.delete({ where: { id: s.id } });
  });

  it("sessões canceladas não ocupam a sala", async () => {
    const s = await nova({ salaId: ids.sala1, estado: "CANCELADA" });
    expect(s.id).toBeTruthy();
    await prisma.sessao.delete({ where: { id: s.id } });
  });

  it("procurarConflitos devolve mensagens antes de gravar", async () => {
    const db = dbTenant({ tenantId: ids.tenant });
    const c = await procurarConflitos(db, {
      turmaId: ids.turma2,
      formadorId: ids.formador1,
      salaId: ids.sala1,
      inicio: instanteLocal("2030-01-07", "20:00"),
      fim: instanteLocal("2030-01-07", "22:00"),
    });
    expect(c.map((x) => x.tipo).sort()).toEqual(["FORMADOR", "SALA"]);
  });
});

describe("isolamento entre centros", () => {
  it("um centro não lê dados de outro", async () => {
    const dbB = dbTenant({ tenantId: ids.tenant2 });
    expect(await dbB.formando.findMany()).toHaveLength(0);
    expect(await dbB.formando.findFirst({ where: { id: ids.formando } })).toBeNull();
    expect(await dbB.sessao.count()).toBe(0);
  });

  it("um centro não altera nem apaga dados de outro", async () => {
    const dbB = dbTenant({ tenantId: ids.tenant2 });
    await expect(dbB.formando.update({ where: { id: ids.formando }, data: { nome: "Hack" } })).rejects.toThrow();
    const r = await dbB.formando.deleteMany({ where: { id: ids.formando } });
    expect(r.count).toBe(0);
    const f = await prisma.formando.findUnique({ where: { id: ids.formando } });
    expect(f?.nome).toBe("Formando A");
  });

  it("create força o tenant da sessão, mesmo que outro seja indicado", async () => {
    const dbB = dbTenant({ tenantId: ids.tenant2 });
    const f = await dbB.formando.create({ data: { tenantId: ids.tenant, nome: "Intruso", whatsapp: "+244900000002" } });
    expect(f.tenantId).toBe(ids.tenant2);
  });

  it("escritas ficam registadas na auditoria", async () => {
    const log = await prisma.auditLog.findFirst({ where: { tenantId: ids.tenant2, entidade: "Formando", acao: "create" } });
    expect(log).not.toBeNull();
  });

  it("RLS no PostgreSQL bloqueia leituras e escritas diretas ($queryRaw / $executeRaw) noutro centro", async () => {
    // 1. Consulta SQL direta sem cláusula WHERE no contexto do centro B não vê dados do centro A
    const linhasB = await comRls(ids.tenant2, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Formando" WHERE id = ${ids.formando}`,
    );
    expect(linhasB).toHaveLength(0);

    // 2. Consulta SQL direta no contexto do centro A vê o seu próprio formando
    const linhasA = await comRls(ids.tenant, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Formando" WHERE id = ${ids.formando}`,
    );
    expect(linhasA).toHaveLength(1);

    // 3. UPDATE direto em SQL sem filtro de tenant não afeta linhas de outro centro
    const alteradas = await comRls(ids.tenant2, (tx) =>
      tx.$executeRaw`UPDATE "Formando" SET nome = 'Alterado por SQL' WHERE id = ${ids.formando}`,
    );
    expect(alteradas).toBe(0);

    // 4. INSERT direto em SQL tentando forçar o tenantId de outro centro é rejeitado pela policy RLS (WITH CHECK)
    await expect(
      comRls(ids.tenant2, (tx) =>
        tx.$executeRaw`INSERT INTO "Sala" (id, "tenantId", nome, ativa) VALUES (${`rls-${sufixo}`}, ${ids.tenant}, 'Sala Intrusa', true)`,
      ),
    ).rejects.toThrow(/row-level security/i);

    // 5. dbTenant.$transaction ativa automaticamente o RLS na ligação da transação
    const dbB = dbTenant({ tenantId: ids.tenant2 });
    const visiveisNaTx = await dbB.$transaction(async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Formando" WHERE id = ${ids.formando}`;
    });
    expect(visiveisNaTx).toHaveLength(0);
  });
});
