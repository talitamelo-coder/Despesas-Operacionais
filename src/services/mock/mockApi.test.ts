import { beforeEach, describe, expect, it } from "vitest";
import csvLicencas from "../../../ferramentas/dados-teste-licencas/1-licencas.csv?raw";
import csvMovimentacoes from "../../../ferramentas/dados-teste-licencas/2-movimentacoes.csv?raw";
import csvAtribuicoes from "../../../ferramentas/dados-teste-licencas/3-atribuicoes.csv?raw";
import csvLinhas from "../../../ferramentas/dados-teste-licencas/4-linhas.csv?raw";
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

  it("não renovar nem substituir cancela o contrato e para os alertas", async () => {
    const { processo, contrato } = await api.registrarAvaliacaoRenovacao("c-aval-aberta", { desejaRenovar: "Não", desejaSubstituir: "Não", desejaEncerrar: "Sim" }, "u-ges2");
    expect(contrato.status).toBe("Cancelado");
    expect(processo).toBeUndefined();
    expect(await api.listarAlertas("c-aval-aberta")).toEqual([]);
    const aud = await api.listarAuditoria("c-aval-aberta");
    expect(aud.some((x) => x.valorNovo === "Cancelado")).toBe(true);
  });

  it("não salva contrato sem vigência", async () => {
    const c = await api.obterContrato("c-aval-aberta");
    await expect(api.atualizarContrato("c-aval-aberta", { vigencia: { ...c!.vigencia, dataFim: "" } }, "u-admin")).rejects.toThrow(/vigência/);
    // Contrato completo: prazo só muda por aditivo.
    await expect(api.atualizarContrato("c-aval-aberta", { vigencia: { ...c!.vigencia, dataFim: "", tipoVigencia: "Prazo indeterminado" } }, "u-admin")).rejects.toThrow(/aditivo/);
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

describe("cadastro de usuário", () => {
  it("cadastra com senha só em hash e não expõe a credencial", async () => {
    const u = await api.salvarUsuario({ id: "", nome: "Ana Souza", email: "Ana@Empresa.com.br", perfil: "Solicitante", area: "Comercial", empresasIds: ["e-hold"], ativo: true }, "u-admin", "senha123");
    expect(u.email).toBe("ana@empresa.com.br");
    expect(u.temSenha).toBe(true);
    expect(u.credencial).toBeUndefined();
    const lista = await api.listarUsuarios();
    expect(lista.every((x) => x.credencial === undefined)).toBe(true);
    const aud = await api.listarAuditoria(u.id);
    expect(JSON.stringify(aud)).not.toContain("senha123");
    // Edição sem senha mantém a atual; e-mail duplicado é recusado.
    const editado = await api.salvarUsuario({ ...u, area: "Marketing" }, "u-admin");
    expect(editado.temSenha).toBe(true);
    await expect(api.salvarUsuario({ id: "", nome: "Outra", email: "ana@empresa.com.br", perfil: "Gestor", area: "Comercial", ativo: true }, "u-admin", "123456")).rejects.toThrow();
    await expect(api.salvarUsuario({ id: "", nome: "Sem senha", email: "x@y.com", perfil: "Gestor", area: "Comercial", ativo: true }, "u-admin")).rejects.toThrow();
  });
});

describe("licenças de software", () => {
  const H = new Date().toISOString().slice(0, 10);

  it("bloqueia atribuição sem assento livre e nunca altera o contrato", async () => {
    const contratoAntes = JSON.stringify(await api.obterContrato("c-usd"));
    // Design Pro: 8 assentos, 8 em uso.
    await expect(api.atribuirLicenca("lic-design", "col-2", H, "u-sup1")).rejects.toThrow(/Sem assento livre/);
    await api.registrarMovimentacao({ licencaId: "lic-design", tipo: "Compra", data: H, quantidade: 1, precoUnitario: 2400, responsavel: "Teste" }, "u-sup1");
    const a = await api.atribuirLicenca("lic-design", "col-2", H, "u-sup1");
    await expect(api.atribuirLicenca("lic-design", "col-2", H, "u-sup1")).rejects.toThrow(/já tem/);
    await expect(api.registrarMovimentacao({ licencaId: "lic-design", tipo: "Redução", data: H, quantidade: 1, responsavel: "Teste" }, "u-sup1")).rejects.toThrow(/Encerre/);
    await api.encerrarAtribuicao(a.id, H, "u-sup1");
    const d = await api.listarLicencas("u-sup1");
    expect(d.atribuicoes.find((x) => x.id === a.id)?.status).toBe("Encerrada");
    expect(JSON.stringify(await api.obterContrato("c-usd"))).toBe(contratoAntes);
  });

  it("cancelamento registra economia e encerra as atribuições", async () => {
    const m = await api.registrarMovimentacao({ licencaId: "lic-monitor", tipo: "Cancelamento", data: H, responsavel: "Teste" }, "u-sup1");
    expect(m.valorAnualAntes).toBe(1800 * 12);
    expect(m.valorAnualDepois).toBe(0);
    const d = await api.listarLicencas("u-sup1");
    expect(d.licencas.find((l) => l.id === "lic-monitor")?.status).toBe("Cancelada");
    expect(d.atribuicoes.filter((a) => a.licencaId === "lic-monitor" && a.status === "Ativa")).toHaveLength(0);
  });

  it("só Suprimentos/Administrador gerenciam; gestor vê nomes só da própria área; leitura não vê nomes", async () => {
    await expect(api.salvarColaborador({ id: "", email: "x@empresa.exemplo", nome: "X", status: "Ativo", tipoConta: "Pessoa" }, "u-ges1")).rejects.toThrow();
    const g = await api.listarLicencas("u-ges1"); // Carlos Mendes, Tecnologia
    expect(g.visao).toBe("area");
    expect(g.colaboradores.filter((c) => c.nome).every((c) => c.area === "Tecnologia")).toBe(true);
    expect(g.colaboradores.some((c) => c.area === "Comercial" && !c.nome && !c.email)).toBe(true);
    const l = await api.listarLicencas("u-leit1");
    expect(l.visao).toBe("agregada");
    expect(l.colaboradores.every((c) => !c.nome && !c.email)).toBe(true);
  });

  it("e-mail é a identidade: domínio do grupo não cria pessoa duplicada", async () => {
    await expect(api.salvarColaborador({ id: "", email: "ana.almeida@empresa-antiga.exemplo", nome: "Ana", status: "Ativo", tipoConta: "Pessoa" }, "u-sup1")).rejects.toThrow(/Já existe/);
  });

  it("desligamento encerra licenças e linhas", async () => {
    const r = await api.desligarColaborador("col-3", H, "u-sup1");
    expect(r.licencas).toBeGreaterThan(0);
    expect(r.linhas).toBe(1);
  });

  it("parâmetro inválido é recusado; novo valor vale a partir da data", async () => {
    await expect(api.salvarParametro("spread_cambial", "abc", H, "u-sup1")).rejects.toThrow();
    await api.salvarParametro("spread_cambial", "5", H, "u-sup1");
    const d = await api.listarLicencas("u-sup1");
    expect(d.parametros.filter((p) => p.chave === "spread_cambial")).toHaveLength(2);
  });

  it("importação CSV: pré-visualiza, importa e reimportar não duplica", async () => {
    const lic = "fornecedor;produto;plano;tipo_cobranca;moeda;periodicidade;vencimento_tipo;assentos_iniciais;preco_unitario;data_compra\nNovo Fornecedor SaaS;Ferramenta Z;Pro;assento;USD;mensal;mensal;2;10,50;2026-01-10\nTOTAL;;;;;;;;;\n";
    const prev = await api.previsualizarCsv("licencas", lic, "u-sup1");
    expect(prev.map((l) => l.situacao)).toEqual(["Importar", "Recusada"]);
    expect((await api.importarCsv("licencas", lic, "u-sup1")).importadas).toBe(1);
    const atr = "email;nome;area;fornecedor;produto;plano\nzeca.souza@empresa.exemplo;Zeca Souza;Tecnologia;Novo Fornecedor SaaS;Ferramenta Z;Pro\n;Sem Email;TI;Novo Fornecedor SaaS;Ferramenta Z;Pro\nlia.reis@empresa.exemplo;Lia;TI;Novo Fornecedor SaaS;Ferramenta Z;Pro\nmax.paz@empresa.exemplo;Max;TI;Novo Fornecedor SaaS;Ferramenta Z;Pro\n";
    const r = await api.importarCsv("atribuicoes", atr, "u-sup1");
    expect(r).toMatchObject({ importadas: 2, conciliacao: 1, recusadas: 1 }); // 2 assentos: o terceiro é recusado
    const antes = await api.listarLicencas("u-sup1");
    const r2 = await api.importarCsv("licencas", lic, "u-sup1");
    const r3 = await api.importarCsv("atribuicoes", atr, "u-sup1");
    expect(r2.importadas + r3.importadas).toBe(0);
    const depois = await api.listarLicencas("u-sup1");
    expect(depois.licencas.length).toBe(antes.licencas.length);
    expect(depois.atribuicoes.length).toBe(antes.atribuicoes.length);
    expect(depois.movimentacoes.length).toBe(antes.movimentacoes.length);
  });
});

describe("dados fictícios de teste (ferramentas/dados-teste-licencas)", () => {
  it("importam com o resultado esperado e reimportar não muda nada", async () => {
    const rodar = async () => [
      await api.importarCsv("licencas", csvLicencas, "u-sup1"),
      await api.importarCsv("movimentacoes", csvMovimentacoes, "u-sup1"),
      await api.importarCsv("atribuicoes", csvAtribuicoes, "u-sup1"),
      await api.importarCsv("linhas", csvLinhas, "u-sup1"),
    ];
    const [l, m, a, t] = await rodar();
    expect(l).toMatchObject({ importadas: 4, recusadas: 2 });
    expect(m).toMatchObject({ importadas: 3, recusadas: 0 });
    expect(a).toMatchObject({ importadas: 30, conciliacao: 1, jaExistiam: 1, recusadas: 1 });
    expect(t).toMatchObject({ importadas: 4, recusadas: 1 });
    const antes = JSON.stringify(await api.listarLicencas("u-sup1"));
    expect((await rodar()).every((r) => r.importadas === 0)).toBe(true);
    expect(JSON.stringify(await api.listarLicencas("u-sup1"))).toBe(antes);
  });
});

describe("saldo do contrato", () => {
  const H = new Date().toISOString().slice(0, 10);

  it("bloqueia pedido acima do saldo; adicionar saldo libera; cancelar devolve", async () => {
    const { saldo } = await api.obterSaldoContrato("c-eixo", "u-sup1");
    expect(saldo.percentualConsumido).toBeGreaterThan(80);
    const acima = Math.ceil(saldo.disponivel) + 1000;
    await expect(api.registrarPedido({ contrato_id: "c-eixo", numero: "PED-T1", data: H, valor: acima }, "u-sup1")).rejects.toThrow(/Saldo insuficiente/);
    await api.registrarAditivo({ contrato_id: "c-eixo", numero: "1º Aditivo", data: H, tipo: "Valor", descricao: "Aditivo de valor", variacaoValorTotal: 2000 }, "u-sup1");
    const p = await api.registrarPedido({ contrato_id: "c-eixo", numero: "PED-T1", data: H, valor: acima }, "u-sup1");
    const depois = (await api.obterSaldoContrato("c-eixo", "u-sup1")).saldo.disponivel;
    await api.atualizarStatusPedido(p.id, "Cancelado", "u-sup1");
    expect((await api.obterSaldoContrato("c-eixo", "u-sup1")).saldo.disponivel).toBeCloseTo(depois + acima);
    expect((await api.listarAcoes()).some((x) => x.id === "c-eixo:saldo")).toBe(true);
  });

  it("compra de licença vinculada que estoura o saldo é bloqueada e nada é gravado", async () => {
    const antes = await api.listarLicencas("u-sup1");
    await expect(api.registrarMovimentacao({ licencaId: "lic-colab", tipo: "Compra", data: H, quantidade: 100000, precoUnitario: 30, responsavel: "Teste" }, "u-sup1")).rejects.toThrow(/Saldo insuficiente no contrato/);
    expect((await api.listarLicencas("u-sup1")).movimentacoes.length).toBe(antes.movimentacoes.length);
    await api.registrarMovimentacao({ licencaId: "lic-colab", tipo: "Compra", data: H, quantidade: 1, precoUnitario: 30, responsavel: "Teste" }, "u-sup1");
  });
});

describe("contratos de clientes (receita)", () => {
  const H = new Date().toISOString().slice(0, 10);

  it("registra com cliente próprio, fica fora da Central de fornecedores e renova sem alterar o anterior", async () => {
    const cli = await api.salvarCliente({ cliente_id: "", razaoSocial: "Cliente Novo S.A.", nomeFantasia: "", cnpj: "11.222.333/0001-81", statusCadastral: "Ativo" }, "u-sup1");
    await expect(api.salvarCliente({ cliente_id: "", razaoSocial: "Sem CNPJ", nomeFantasia: "", statusCadastral: "Ativo" }, "u-sup1")).rejects.toThrow(/CNPJ/);
    const antes = await api.obterContrato("r-fibra");
    const novo = await api.registrarContratoCliente(
      { empresaId: "e-tel", clienteId: cli.cliente_id, objeto: "Squad fibra — renovação", gestorId: "u-ges1", moeda: "BRL", vigencia: { dataInicio: H, dataFim: "2027-12-31", tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30 }, receita: { tipoReceita: "Fixa", valorMensalFixo: 75000 }, contratosAnterioresIds: ["r-fibra"], relacaoAnterior: "Renovação" },
      "u-sup1",
    );
    expect(novo.natureza).toBe("Receita");
    const anterior = await api.obterContrato("r-fibra");
    expect(anterior?.sucessor_id).toBe(novo.contrato_id);
    expect({ ...anterior, sucessor_id: undefined, atualizadoEm: "" }).toEqual({ ...antes, sucessor_id: undefined, atualizadoEm: "" });
    const central = await api.consultarCentral({ aba: "Todos" }, { coluna: "codigo", direcao: "asc" }, 0, 500);
    expect(central.linhas.some((l) => l.id === novo.contrato_id)).toBe(false);
    await expect(api.registrarPedido({ contrato_id: novo.contrato_id, numero: "P1", data: H, valor: 10 }, "u-sup1")).rejects.toThrow(/Contas a receber/);
  });

  it("emissão do Contas a receber consome o saldo e é bloqueada acima dele; aditivo libera", async () => {
    const { saldo } = await api.obterSaldoContrato("r-vas", "u-sup1");
    const acima = Math.ceil(saldo.disponivel) + 10;
    await expect(api.registrarEmissao({ contrato_id: "r-vas", numeroDocumento: "NF 1", data: H, valor: acima }, "u-sup1")).rejects.toThrow(/aditivo/);
    await api.registrarAditivo({ contrato_id: "r-vas", numero: "2º Aditivo", data: H, tipo: "Valor", descricao: "Ampliação", variacaoValorTotal: 100 }, "u-sup1");
    await api.registrarEmissao({ contrato_id: "r-vas", numeroDocumento: "NF 1", data: H, valor: acima }, "u-sup1");
    await expect(api.registrarEmissao({ contrato_id: "r-vas", numeroDocumento: "NF 1", data: H, valor: 1 }, "u-sup1")).rejects.toThrow(/já foi registrada/);
    expect((await api.listarAditivos("r-vas"))[0].numero).toBe("2º Aditivo");
  });

  it("valor só muda por aditivo (edição direta bloqueada em contrato completo)", async () => {
    const c = (await api.obterContrato("r-wifi"))!;
    await expect(api.atualizarContrato("r-wifi", { receita: { ...c.receita!, valorMensalFixo: 1 } }, "u-sup1")).rejects.toThrow(/aditivo/);
    await api.registrarAditivo({ contrato_id: "r-wifi", numero: "2º Aditivo", data: H, tipo: "Prazo", descricao: "Prorrogação", novaDataFim: "2029-12-31" }, "u-sup1");
    expect((await api.obterContrato("r-wifi"))!.vigencia.dataFim).toBe("2029-12-31");
  });
});

describe("telefonia", () => {
  it("uma linha tem um usuário por vez; número é único", async () => {
    const H = new Date().toISOString().slice(0, 10);
    await expect(api.atribuirLinha("tel-1", "col-4", H, "u-sup1")).rejects.toThrow(/já tem usuário/);
    await expect(api.salvarLinha({ id: "", numero: "(11) 98765-0001", operadora: "X", valorMensal: 10, situacao: "Ativa", criadoEm: "", atualizadoEm: "" }, "u-sup1")).rejects.toThrow(/já está cadastrada/);
    await api.atribuirLinha("tel-7", "col-4", H, "u-sup1");
  });
});
