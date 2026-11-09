/**
 * Dados de demonstração. Idempotente: apaga e recria os centros de demo.
 * Executar com `npm run db:seed`.
 *
 * Contas (palavra-passe: academia123):
 *   admin@demo.ao · comercial@demo.ao · pedagogico@demo.ao · financeiro@demo.ao
 *   admin@outro.ao (outro centro — para verificar o isolamento de dados)
 */
import { PrismaClient, type Perfil } from "@prisma/client";
import bcrypt from "bcryptjs";
import { dataSimples, hojeLocal, instanteLocal, somarMeses } from "../src/lib/datas";
import { alocarPagamento, gerarParcelas } from "../src/lib/parcelas";

const prisma = new PrismaClient();
const kz = (v: number) => BigInt(Math.round(v * 100));

async function limparTenant(slug: string) {
  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) return;
  const w = { where: { tenantId: t.id } };
  await prisma.mensagem.deleteMany(w);
  await prisma.movimentoPontos.deleteMany(w);
  await prisma.campanha.deleteMany(w);
  await prisma.despesa.deleteMany(w);
  await prisma.lead.deleteMany(w);
  await prisma.modeloMensagem.deleteMany(w);
  await prisma.configuracaoCentro.deleteMany(w);
  await prisma.alocacaoPagamento.deleteMany({ where: { pagamento: { tenantId: t.id } } });
  await prisma.pagamento.deleteMany(w);
  await prisma.parcela.deleteMany(w);
  await prisma.matricula.deleteMany(w);
  await prisma.sessao.deleteMany(w);
  await prisma.avaliacaoFormador.deleteMany(w);
  await prisma.precoFormadorFormacao.deleteMany(w);
  await prisma.turma.deleteMany(w);
  await prisma.formacao.deleteMany(w);
  await prisma.sala.deleteMany(w);
  await prisma.formador.deleteMany(w);
  await prisma.competencia.deleteMany(w);
  await prisma.area.deleteMany(w);
  await prisma.formando.deleteMany(w);
  await prisma.auditLog.deleteMany(w);
  await prisma.tenant.delete({ where: { id: t.id } }); // utilizadores e sessões em cascata
}

async function main() {
  await limparTenant("demo");
  await limparTenant("outro");

  const passwordHash = await bcrypt.hash("academia123", 10);

  // ── Centros e utilizadores ────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({ data: { nome: "Academia Demo Luanda", slug: "demo" } });
  const tenantId = tenant.id;
  const perfis: [string, string, Perfil][] = [
    ["Ana Gestora", "admin@demo.ao", "ADMIN"],
    ["Carlos Comercial", "comercial@demo.ao", "COMERCIAL"],
    ["Paula Pedagógica", "pedagogico@demo.ao", "PEDAGOGICO"],
    ["Fernando Financeiro", "financeiro@demo.ao", "FINANCEIRO"],
  ];
  const users = await Promise.all(
    perfis.map(([nome, email, perfil]) => prisma.user.create({ data: { tenantId, nome, email, perfil, passwordHash } })),
  );
  const admin = users[0];

  const outro = await prisma.tenant.create({ data: { nome: "Centro Outro Benguela", slug: "outro" } });
  await prisma.user.create({
    data: { tenantId: outro.id, nome: "Admin Outro", email: "admin@outro.ao", perfil: "ADMIN", passwordHash },
  });
  await prisma.formando.create({
    data: { tenantId: outro.id, nome: "Formando de Outro Centro", whatsapp: "+244911111111" },
  });

  // ── Áreas e competências ─────────────────────────────────────────────────
  const areasNomes = ["Liderança", "Comunicação", "Tecnologias de Informação", "Gestão"];
  const areas = Object.fromEntries(
    await Promise.all(
      areasNomes.map(async (nome) => [nome, await prisma.area.create({ data: { tenantId, nome } })] as const),
    ),
  );
  const compDef: [string, string][] = [
    ["Liderança de equipas", "Liderança"],
    ["Inteligência emocional", "Liderança"],
    ["Oratória", "Comunicação"],
    ["Atendimento ao cliente", "Comunicação"],
    ["Excel avançado", "Tecnologias de Informação"],
    ["Power BI", "Tecnologias de Informação"],
    ["Gestão de projetos", "Gestão"],
    ["Contabilidade", "Gestão"],
  ];
  const comp = Object.fromEntries(
    await Promise.all(
      compDef.map(
        async ([nome, area]) =>
          [nome, await prisma.competencia.create({ data: { tenantId, nome, areaId: areas[area].id } })] as const,
      ),
    ),
  );

  // ── Formadores ───────────────────────────────────────────────────────────
  const fDef: { nome: string; tel: string; areas: string[]; comp: string[]; comp_h?: number; tec_h?: number }[] = [
    { nome: "Manuel Domingos", tel: "+244923100001", areas: ["Liderança"], comp: ["Liderança de equipas", "Inteligência emocional"], comp_h: 15000 },
    { nome: "Joana Kiala", tel: "+244923100002", areas: ["Comunicação"], comp: ["Oratória", "Atendimento ao cliente"], comp_h: 12000 },
    { nome: "Pedro Neto", tel: "+244923100003", areas: ["Tecnologias de Informação"], comp: ["Excel avançado", "Power BI"], tec_h: 18000 },
    { nome: "Esperança Lopes", tel: "+244923100004", areas: ["Tecnologias de Informação", "Gestão"], comp: ["Power BI", "Gestão de projetos"], tec_h: 20000, comp_h: 14000 },
    { nome: "António Sebastião", tel: "+244923100005", areas: ["Gestão"], comp: ["Gestão de projetos", "Contabilidade"], tec_h: 17000 },
    { nome: "Luísa Cardoso", tel: "+244923100006", areas: ["Liderança", "Comunicação"], comp: ["Inteligência emocional", "Oratória"], comp_h: 13000 },
  ];
  const formadores = await Promise.all(
    fDef.map((f) =>
      prisma.formador.create({
        data: {
          tenantId,
          nome: f.nome,
          telefone: f.tel,
          email: f.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".") + "@formadores.ao",
          precoHoraComportamental: f.comp_h ? kz(f.comp_h) : null,
          precoHoraTecnica: f.tec_h ? kz(f.tec_h) : null,
          areas: { connect: f.areas.map((a) => ({ id: areas[a].id })) },
          competencias: { connect: f.comp.map((c) => ({ id: comp[c].id })) },
        },
      }),
    ),
  );
  const [manuel, joana, pedro, esperanca, antonio] = formadores;

  // ── Catálogo e salas ─────────────────────────────────────────────────────
  const formDef = [
    { nome: "Liderança e Gestão de Equipas", slug: "lideranca-gestao-equipas", horas: 24, preco: 150000, cat: "COMPORTAMENTAL" as const, desc: "Desenvolver competências de liderança, delegação e motivação de equipas." },
    { nome: "Oratória e Comunicação Eficaz", slug: "oratoria-comunicacao", horas: 16, preco: 95000, cat: "COMPORTAMENTAL" as const, desc: "Falar em público com confiança e clareza." },
    { nome: "Excel Avançado", slug: "excel-avancado", horas: 20, preco: 120000, cat: "TECNICA" as const, desc: "Tabelas dinâmicas, funções avançadas e automatização." },
    { nome: "Power BI para Negócios", slug: "power-bi-negocios", horas: 24, preco: 180000, cat: "TECNICA" as const, desc: "Dashboards e análise de dados para decisão." },
    { nome: "Gestão de Projetos", slug: "gestao-projetos", horas: 30, preco: 220000, cat: "TECNICA" as const, desc: "Planeamento, execução e controlo de projetos." },
  ];
  const [lid, ora, exc, pbi] = await Promise.all(
    formDef.map((f) =>
      prisma.formacao.create({
        data: { tenantId, nome: f.nome, slug: f.slug, descricao: f.desc, cargaHoraria: f.horas, preco: kz(f.preco), categoria: f.cat },
      }),
    ),
  );
  await prisma.precoFormadorFormacao.create({
    data: { tenantId, formadorId: esperanca.id, formacaoId: pbi.id, precoHora: kz(22000) },
  });

  const [sala1, sala2, lab] = await Promise.all([
    prisma.sala.create({ data: { tenantId, nome: "Sala 1", capacidade: 20 } }),
    prisma.sala.create({ data: { tenantId, nome: "Sala 2", capacidade: 15 } }),
    prisma.sala.create({ data: { tenantId, nome: "Laboratório de Informática", capacidade: 12 } }),
  ]);

  // ── Turmas e sessões (sem conflitos) ─────────────────────────────────────
  const hojeIso = hojeLocal();
  const [ah, mh, dh] = hojeIso.split("-").map(Number);
  const baseUtc = Date.UTC(ah, mh - 1, dh);
  const segunda = baseUtc - ((new Date(baseUtc).getUTCDay() + 6) % 7) * 86_400_000;
  const dia = (offset: number) => new Date(segunda + offset * 86_400_000).toISOString().slice(0, 10);

  async function turmaComSessoes(
    codigo: string,
    formacaoId: string,
    estado: "PLANEADA" | "EM_CURSO",
    formadorId: string,
    salaId: string,
    dias: number[],
    hIni: string,
    hFim: string,
  ) {
    const turma = await prisma.turma.create({ data: { tenantId, formacaoId, codigo, estado, vagas: 15 } });
    await prisma.sessao.createMany({
      data: dias.map((d) => {
        const inicio = instanteLocal(dia(d), hIni);
        return {
          tenantId,
          turmaId: turma.id,
          formadorId,
          salaId,
          inicio,
          fim: instanteLocal(dia(d), hFim),
          estado: inicio < new Date() ? ("REALIZADA" as const) : ("AGENDADA" as const),
        };
      }),
    });
    return turma;
  }

  // Liderança: seg e qua 18:00–21:00, Sala 1, 4 semanas (começou na semana passada)
  const tLid = await turmaComSessoes("LID-01", lid.id, "EM_CURSO", manuel.id, sala1.id, [-7, -5, 0, 2, 7, 9, 14, 16], "18:00", "21:00");
  // Excel: ter e qui 18:00–21:00, Laboratório
  const tExc = await turmaComSessoes("EXC-01", exc.id, "EM_CURSO", pedro.id, lab.id, [1, 3, 8, 10, 15, 17, 22], "18:00", "21:00");
  // Oratória: sábados 09:00–13:00, Sala 2
  const tOra = await turmaComSessoes("ORA-01", ora.id, "PLANEADA", joana.id, sala2.id, [5, 12, 19, 26], "09:00", "13:00");
  // Power BI: sábados 09:00–13:00, Laboratório (a partir de daqui a 3 semanas)
  const tPbi = await turmaComSessoes("PBI-01", pbi.id, "PLANEADA", esperanca.id, lab.id, [19, 26, 33, 40, 47, 54], "09:00", "13:00");
  void antonio;

  // ── Formandos ────────────────────────────────────────────────────────────
  const nomes: [string, string, string, string | null][] = [
    ["Adelino Mateus", "Contabilista", "923456001", "1990-03-14"],
    ["Benvinda Francisco", "Gestora de RH", "923456002", "1988-10-20"],
    ["Celestino Manuel", "Engenheiro", "923456003", "1985-07-02"],
    ["Domingas Afonso", "Professora", "923456004", "1992-10-18"],
    ["Eduardo Kapenda", "Analista financeiro", "923456005", "1995-01-30"],
    ["Feliciana João", "Empreendedora", "923456006", null],
    ["Gaspar Tchissola", "Supervisor comercial", "923456007", "1983-12-05"],
    ["Helena Mbala", "Secretária executiva", "923456008", "1997-05-11"],
    ["Isaías Cambuta", "Técnico de TI", "923456009", "1993-09-23"],
    ["Joaquina Ndala", "Diretora de agência", "923456010", "1980-02-17"],
    ["Kiluanje Ventura", "Estudante", "923456011", "2001-06-08"],
    ["Lurdes Paulo", "Enfermeira", "923456012", "1989-11-29"],
  ];
  const formandos = await Promise.all(
    nomes.map(([nome, profissao, tel, nasc], i) =>
      prisma.formando.create({
        data: {
          tenantId,
          nome,
          profissao,
          whatsapp: "+244" + tel,
          dataNascimento: nasc ? dataSimples(nasc) : null,
          intencaoCompra: i % 3 === 0,
          formaPagamentoPreferida: i % 2 === 0 ? "PARCELADO" : "PRONTO",
          avaliacaoEquipa: (i % 5) + 1,
        },
      }),
    ),
  );

  // ── Matrículas, parcelas e pagamentos ────────────────────────────────────
  const hoje = dataSimples(hojeIso);
  async function matricular(
    formandoIdx: number,
    turma: { id: string },
    preco: bigint,
    nParcelas: number,
    inicioPlano: Date,
    parcelasPagas: number,
    metodo: "MULTICAIXA" | "TRANSFERENCIA" | "REFERENCIA" | "NUMERARIO" = "MULTICAIXA",
  ) {
    const formando = formandos[formandoIdx];
    const plano = gerarParcelas(preco, nParcelas, inicioPlano);
    const m = await prisma.matricula.create({
      data: {
        tenantId,
        formandoId: formando.id,
        turmaId: turma.id,
        valorTotal: preco,
        numParcelas: nParcelas,
        parcelas: { create: plano.map((p) => ({ ...p, tenantId })) },
      },
      include: { parcelas: { orderBy: { numero: "asc" } } },
    });
    for (let i = 0; i < parcelasPagas; i++) {
      const p = m.parcelas[i];
      const aloc = alocarPagamento(p.valor, [{ id: p.id, numero: p.numero, valor: p.valor, pago: 0n }]);
      await prisma.pagamento.create({
        data: {
          tenantId,
          formandoId: formando.id,
          matriculaId: m.id,
          valor: p.valor,
          metodo,
          dataPagamento: p.vencimento,
          registadoPorId: admin.id,
          alocacoes: { create: aloc },
        },
      });
    }
  }

  const ha2meses = somarMeses(hoje, -2);
  const ha1mes = somarMeses(hoje, -1);
  await matricular(0, tLid, lid.preco, 3, ha2meses, 1); // 1 parcela em atraso
  await matricular(1, tLid, lid.preco, 1, ha1mes, 1, "TRANSFERENCIA"); // à vista, pago
  await matricular(2, tLid, lid.preco, 3, ha1mes, 2); // em dia
  await matricular(3, tLid, lid.preco, 3, hoje, 1, "REFERENCIA");
  await matricular(4, tExc, exc.preco, 2, ha1mes, 1); // 2.ª parcela vence hoje
  await matricular(5, tExc, exc.preco, 1, ha1mes, 1, "NUMERARIO");
  await matricular(8, tExc, exc.preco, 3, ha2meses, 2); // 1 em atraso
  await matricular(0, tExc, exc.preco, 3, hoje, 1); // o Adelino tem 2 matrículas
  await matricular(6, tOra, ora.preco, 2, hoje, 1);
  await matricular(7, tOra, ora.preco, 1, hoje, 0); // ainda não pagou a inscrição
  await matricular(9, tPbi, pbi.preco, 3, hoje, 1, "TRANSFERENCIA");
  await matricular(2, tPbi, pbi.preco, 3, hoje, 1); // o Celestino volta a comprar

  // ── Avaliações de formadores ─────────────────────────────────────────────
  await prisma.avaliacaoFormador.createMany({
    data: [
      { tenantId, formadorId: manuel.id, turmaId: tLid.id, dominioConteudo: 5, eticaProfissional: 5, cumprimentoHorarios: 4, enquadramentoExercicios: 5, capacidadeMotivar: 5, avaliadoPor: "Coordenação", comentario: "Excelente dinâmica de grupo." },
      { tenantId, formadorId: pedro.id, turmaId: tExc.id, dominioConteudo: 5, eticaProfissional: 4, cumprimentoHorarios: 3, enquadramentoExercicios: 4, capacidadeMotivar: 4, avaliadoPor: "Formandos" },
      { tenantId, formadorId: joana.id, dominioConteudo: 4, eticaProfissional: 5, cumprimentoHorarios: 5, enquadramentoExercicios: 4, capacidadeMotivar: 5, avaliadoPor: "Coordenação" },
    ],
  });

  // ── Fase 2: configuração WhatsApp (simulação) e leads de exemplo ─────────
  await prisma.configuracaoCentro.create({
    data: {
      tenantId,
      whatsappModo: "SIMULACAO",
      numerosEquipaComercial: ["+244923000900"],
      apresentacaoPublica:
        "Formações práticas em Luanda, em horário pós-laboral, com formadores certificados e turmas reduzidas.",
    },
  });
  await prisma.configuracaoCentro.create({ data: { tenantId: outro.id, whatsappModo: "DESATIVADO" } });

  const leads = [
    { nome: "Rosa Quissanga", whatsapp: "+244923111001", turma: tExc, formacao: exc, utm: ["facebook", "cpc", "excel-out"], dias: 0 },
    { nome: "Mateus Kiala", whatsapp: "+244923111002", turma: tExc, formacao: exc, utm: ["instagram", "cpc", "excel-out"], dias: 1 },
    { nome: "Joana Mbala", whatsapp: "+244923111003", turma: tPbi, formacao: pbi, utm: [null, null, null], dias: 3 },
  ] as const;
  for (const l of leads) {
    await prisma.lead.create({
      data: {
        tenantId,
        nome: l.nome,
        whatsapp: l.whatsapp,
        formacaoId: l.formacao.id,
        turmaId: l.turma.id,
        precoApresentado: l.turma.preco ?? l.formacao.preco,
        aceitouPreco: true,
        aceitouDatas: true,
        utmSource: l.utm[0],
        utmMedium: l.utm[1],
        utmCampaign: l.utm[2],
        referrer: l.utm[0] ? null : "https://www.google.com/",
        createdAt: new Date(Date.now() - l.dias * 86_400_000),
      },
    });
  }

  // ── Fase 3: programa de indicação, campanhas e despesas operacionais ─────
  const expiraDaqui1Ano = somarMeses(hoje, 12);
  await prisma.formando.update({
    where: { id: formandos[1].id },
    data: { indicadoPorId: formandos[0].id },
  });
  await prisma.formando.update({
    where: { id: formandos[2].id },
    data: { indicadoPorId: formandos[0].id },
  });
  await prisma.movimentoPontos.createMany({
    data: [
      {
        tenantId,
        formandoId: formandos[0].id,
        indicadoId: formandos[1].id,
        pontos: 5,
        motivo: `Indicação de ${formandos[1].nome} (LID-01)`,
        expiraEm: expiraDaqui1Ano,
      },
      {
        tenantId,
        formandoId: formandos[0].id,
        indicadoId: formandos[2].id,
        pontos: 5,
        motivo: `Indicação de ${formandos[2].nome} (LID-01)`,
        expiraEm: expiraDaqui1Ano,
      },
    ],
  });

  await prisma.campanha.createMany({
    data: [
      {
        tenantId,
        nome: `Campanha Sazonal (${mh}/${ah}) — Power BI`,
        tipo: "SAZONAL",
        estado: "ATIVA",
        descontoPct: 15,
        mesValidade: mh,
        anoValidade: ah,
        orcamentoMax: kz(150000),
        formacaoId: pbi.id,
        filtroNivelInteresse: "MUITO",
        mensagemTexto:
          "Olá {{primeiroNome}}! 🎯\n\nEste mês temos a *{{campanha}}* com *{{desconto}}% de desconto* na formação *{{formacao}}*.\n\nVagas limitadas — responda a esta mensagem para garantir a sua inscrição!\n{{centro}}",
        criadaPorId: admin.id,
      },
      {
        tenantId,
        nome: "Fidelização Ex-Formandos (-5%)",
        tipo: "FIDELIZACAO",
        estado: "ATIVA",
        descontoPct: 5,
        mesValidade: mh,
        anoValidade: ah,
        orcamentoMax: kz(100000),
        filtroMinFormacoes: 1,
        mensagemTexto:
          "Olá {{primeiroNome}}! 🌟\n\nPor já ter feito formação connosco, tem direito a *{{desconto}}% de desconto de fidelização* na sua próxima inscrição no {{centro}}.\n\nConsulte o nosso catálogo e fale connosco!",
        criadaPorId: admin.id,
      },
    ],
  });

  await prisma.despesa.createMany({
    data: [
      {
        tenantId,
        categoria: "FORMADOR",
        descricao: `Honorários de formação — ${manuel.nome} (6 h lecionadas em LID-01)`,
        valor: kz(90000),
        data: hoje,
        fornecedor: manuel.nome,
        metodo: "TRANSFERENCIA",
        referencia: "TRF-2026-001",
        formacaoId: lid.id,
        turmaId: tLid.id,
        formadorId: manuel.id,
        horasPagas: 6,
        registadoPorId: admin.id,
      },
      {
        tenantId,
        categoria: "CONSUMIVEIS",
        descricao: "Apostilas impressas, pastas e kits de dinâmica de grupo",
        valor: kz(25000),
        data: ha1mes,
        fornecedor: "Gráfica Luanda Sul",
        metodo: "MULTICAIXA",
        formacaoId: lid.id,
        turmaId: tLid.id,
        registadoPorId: admin.id,
      },
      {
        tenantId,
        categoria: "CONSUMIVEIS",
        descricao: "Manuais práticos e ficheiros de exercícios — Excel Avançado",
        valor: kz(18000),
        data: hoje,
        fornecedor: "Papelaria Central",
        metodo: "TPA",
        formacaoId: exc.id,
        turmaId: tExc.id,
        registadoPorId: admin.id,
      },
      {
        tenantId,
        categoria: "INSTALACOES",
        descricao: "Renda mensal das instalações, energia e internet fibra",
        valor: kz(120000),
        data: ha1mes,
        fornecedor: "Imobiliária Talatona",
        metodo: "TRANSFERENCIA",
        referencia: "RENDA-01",
        registadoPorId: admin.id,
      },
      {
        tenantId,
        categoria: "SALARIOS",
        descricao: "Salários da equipa interna (secretaria e comercial)",
        valor: kz(180000),
        data: ha1mes,
        metodo: "TRANSFERENCIA",
        registadoPorId: admin.id,
      },
      {
        tenantId,
        categoria: "MANUTENCAO",
        descricao: "Manutenção preventiva dos computadores do Laboratório",
        valor: kz(35000),
        data: hoje,
        fornecedor: "TecnoServ Luanda",
        metodo: "TRANSFERENCIA",
        registadoPorId: admin.id,
      },
    ],
  });

  console.log("✔ Dados de demonstração criados (Fases 1, 2 e 3). Entrar com admin@demo.ao / academia123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
