import { beforeEach, describe, expect, it } from "vitest";
import { mockApi as api } from "./mockApi";

/** Fluxos ponta a ponta na camada de serviço simulada (mesmo contrato da API futura). */

beforeEach(async () => {
  // "u-admin" existe tanto na demonstração quanto numa base real criada nos testes.
  await api.restaurarDadosDemonstracao("u-admin");
});

describe("renovação", () => {
  it("avaliação do gestor cria processo herdado, interrompe lembretes e nunca sobrescreve o contrato", async () => {
    const { processo, contrato } = await api.registrarAvaliacaoRenovacao(
      "c-aval-aberta",
      { desejaRenovar: "Sim", desejaSubstituir: "Não", desejaEncerrar: "Não", servicoNecessario: "Sim", quantidadePermanece: "Sim", escopoPermanece: "Sim", problemaFornecedor: "Não", avaliarConcorrentes: "Não" },
      "u-ges2",
    );
    expect(processo?.tipo).toBe("Renovação");
    expect(processo?.contrato_anterior_id).toBe("c-aval-aberta");
    expect(processo?.origens.empresaId).toBe("herdado");
    expect(processo?.saving?.baselineAnual).toBe(2340000);
    expect(contrato.status).toBe("Vigente");
    const alertas = await api.listarAlertas("c-aval-aberta");
    expect(alertas.filter((a) => a.categoria === "Decisão do gestor" && a.status === "Programado")).toHaveLength(0);
  });

  it("só o gestor do contrato responde", async () => {
    await expect(api.registrarAvaliacaoRenovacao("c-aval-aberta", { desejaRenovar: "Sim" }, "u-ges1")).rejects.toThrow();
  });
});

describe("processo de aditivo", () => {
  it("bloqueia jurídico sem aprovação e aplica o aditivo ao contrato ao concluir", async () => {
    const id = "p-aditivo-nexo";
    let r = await api.avancarProcesso(id, "u-sup2");
    expect(r.ok).toBe(false);
    expect(r.pendencias.map((p) => p.campo)).toContain("aprovacoes");

    await api.registrarAprovacao(id, "Gestor", "Aprovado", undefined, "u-ges2");
    await api.registrarAprovacao(id, "Diretor", "Ciente", undefined, "u-dir1");
    await api.adicionarDocumento({ processo_id: id, nome: "minuta.docx", categoria: "Minuta" }, "u-sup2");
    r = await api.avancarProcesso(id, "u-sup2");
    expect(r.ok).toBe(true);
    expect(r.processo?.status).toBe("Em análise jurídica");

    await api.registrarParecer(id, "Parecer emitido", "De acordo.", "u-jur1");
    expect((await api.avancarProcesso(id, "u-sup2")).processo?.status).toBe("Aguardando assinatura");
    expect((await api.avancarProcesso(id, "u-sup2")).ok).toBe(false); // falta contrato assinado
    await api.adicionarDocumento({ processo_id: id, nome: "aditivo-assinado.pdf", categoria: "Contrato assinado" }, "u-sup2");
    const original = await api.obterContrato("c-nexo");
    const fim = await api.avancarProcesso(id, "u-sup2");
    expect(fim.ok).toBe(true);
    // Aditivo altera o próprio contrato (mesmo código) e registra auditoria do valor anterior.
    expect(fim.contratoGerado?.codigo).toBe(original?.codigo);
    expect(fim.contratoGerado?.condicoes.valorAnual).toBe(4620000);
    const aud = await api.listarAuditoria("c-nexo");
    expect(aud.some((a) => a.campo === "condicoes.valorAnual" && a.valorAnterior === "3840000")).toBe(true);
  });

  it("renovação concluída gera novo código vinculado e mantém o anterior", async () => {
    const id = "p-renov-link";
    await api.atualizarProcesso(id, { justificativa: "Melhor proposta", tipoContratoId: "t-tel" }, "u-sup1");
    expect((await api.avancarProcesso(id, "u-sup1")).processo?.status).toBe("Aguardando aprovação comercial");
    await api.registrarAprovacao(id, "Gestor", "Aprovado", undefined, "u-ges1");
    await api.registrarAprovacao(id, "Suprimentos", "Aprovado", undefined, "u-sup1");
    await api.adicionarDocumento({ processo_id: id, nome: "minuta.docx", categoria: "Minuta" }, "u-sup1");
    await api.avancarProcesso(id, "u-sup1");
    await api.registrarParecer(id, "Parecer emitido", "Ok", "u-jur1");
    await api.avancarProcesso(id, "u-sup1");
    await api.adicionarDocumento({ processo_id: id, nome: "assinado.pdf", categoria: "Contrato assinado" }, "u-sup1");
    const r = await api.avancarProcesso(id, "u-sup1");
    expect(r.ok).toBe(true);
    const novo = r.contratoGerado!;
    const anterior = await api.obterContrato("c-link-3");
    expect(novo.codigo).not.toBe(anterior?.codigo);
    expect(novo.contrato_anterior_id).toBe("c-link-3");
    expect(anterior?.sucessor_id).toBe(novo.contrato_id);
    expect(anterior?.condicoes.valorAnual).toBe(1155000); // anterior intacto
  });
});

describe("substituição", () => {
  it("substituição marca o anterior como substituído sem alterá-lo", async () => {
    const p = await api.criarProcesso(
      "Substituição de fornecedor",
      { contrato_anterior_id: "c-normal", origemOportunidade: "Suprimentos", empresaId: "e-hold", objeto: "Limpeza", gestorId: "u-ges3", analistaId: "u-sup2", tipoContratoId: "t-fac", motivoSubstituicao: "SLA" },
      "u-sup2",
    );
    expect((await api.avancarProcesso(p.processo_id, "u-sup2")).processo?.status).toBe("Em cotação");
    const antes = await api.obterContrato("c-normal");
    expect(antes?.sucessor_id).toBeUndefined();
  });
});

describe("permissões", () => {
  it("gestor não altera saving", async () => {
    await expect(api.atualizarContrato("c-normal", { saving: undefined }, "u-ges3")).rejects.toThrow();
  });
});

describe("central", () => {
  it("filtra por aba e busca livre", async () => {
    const r = await api.consultarCentral({ aba: "Em contratação", busca: "COMP-1244" }, { coluna: "codigo", direcao: "asc" }, 0, 25);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].tipo).toBe("processo");
    const todos = await api.consultarCentral({ aba: "Todos" }, { coluna: "valorAnual", direcao: "desc" }, 0, 10);
    expect(todos.total).toBeGreaterThan(100);
    expect(todos.linhas[0].valorAnualBRL! >= todos.linhas[1].valorAnualBRL!).toBe(true);
  });
});

describe("uso com dados reais", () => {
  it("base vazia remove dados fictícios e cria o administrador", async () => {
    await api.iniciarBaseVazia({ nome: "Talita", email: "talita@empresa.com.br" });
    expect(await api.obterModoDados()).toBe("real");
    expect(await api.listarContratos()).toHaveLength(0);
    expect(await api.listarFornecedores()).toHaveLength(0);
    const usuarios = await api.listarUsuarios();
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].perfil).toBe("Administrador");
    // Telas derivadas funcionam com base vazia.
    expect((await api.obterIndicadores()).contratosVigentes).toBe(0);
    expect((await api.consultarCentral({ aba: "Todos" }, { coluna: "codigo", direcao: "asc" }, 0, 25)).total).toBe(0);
    // Sem integração, a busca no JIRA não devolve dados fictícios.
    expect(await api.buscarDemandaJira("COMP-1287")).toBeUndefined();
  });

  it("importação em base vazia cria empresa, fornecedor e gestor", async () => {
    await api.iniciarBaseVazia({ nome: "Talita", email: "t@e.com" });
    const r = await api.importarContratos(
      [{ linha: 2, fornecedor: "Fornecedor Real Ltda", cnpj: "11222333000181", empresa: "Minha Empresa", objeto: "Serviço", gestor: "Ana Gestora", valorAnual: 1000, moeda: "BRL", dataInicio: "2026-01-01", dataFim: "2027-12-31", avisoPrevioDias: 60, renovacaoAutomatica: false }],
      "u-admin",
    );
    expect(r.criados).toBe(1);
    expect((await api.listarUsuarios()).some((u) => u.nome === "Ana Gestora" && u.perfil === "Gestor")).toBe(true);
    expect(await api.listarEmpresas()).toHaveLength(1);
  });

  it("dados reais só são substituídos pelo administrador", async () => {
    await api.iniciarBaseVazia({ nome: "Talita", email: "t@e.com" });
    await expect(api.restaurarDadosDemonstracao()).rejects.toThrow();
    await api.restaurarDadosDemonstracao("u-admin");
    expect(await api.obterModoDados()).toBe("demonstracao");
  });

  it("cópia de segurança restaura a base", async () => {
    await api.iniciarBaseVazia({ nome: "Talita", email: "t@e.com" });
    await api.salvarFornecedor({ fornecedor_id: "", razaoSocial: "Fornecedor X", nomeFantasia: "", cnpj: "11.222.333/0001-81", statusCadastral: "Ativo" }, "u-admin");
    await expect(api.salvarFornecedor({ fornecedor_id: "", razaoSocial: "Duplicado", nomeFantasia: "", cnpj: "11222333000181", statusCadastral: "Ativo" }, "u-admin")).rejects.toThrow();
    const backup = await api.exportarBackup("u-admin");
    await api.restaurarDadosDemonstracao("u-admin");
    await api.importarBackup(backup, "u-admin");
    expect(await api.obterModoDados()).toBe("real");
    expect((await api.listarFornecedores()).map((f) => f.razaoSocial)).toEqual(["Fornecedor X"]);
    await expect(api.importarBackup("{}", "u-admin")).rejects.toThrow();
  });
});
