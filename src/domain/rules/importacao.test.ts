import { describe, expect, it } from "vitest";
import { cnpjValido, parseCSV, processarImportacao, sugerirMapeamento } from "./importacao";

const CSV = `Contrato;Razão Social;CNPJ;Empresa;Objeto;Gestor;Valor Anual;Início;Término;Aviso prévio;Renov. Automática
CT-OLD-1;Fornecedor A;11.222.333/0001-81;Matriz;Link de dados;Ana;"R$ 120.000,00";01/01/2026;31/12/2026;90;Sim
CT-OLD-2;Fornecedor B;11.222.333/0001-00;Matriz;Suporte;Bruno;50000;01/01/2026;31/12/2026;30;Não
CT-OLD-3;Fornecedor C;11.222.333/0001-81;Matriz;;Carla;10;01/01/2026;31/12/2026;;
CT-OLD-1;Fornecedor A;11.222.333/0001-81;Matriz;Outro;Ana;10;01/01/2026;31/12/2026;;`;

describe("importação de planilha", () => {
  it("valida CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-00")).toBe(false);
  });

  it("fornecedor do exterior importa sem CNPJ; duplicidade vira pelo nome", () => {
    const csv = `Razão Social;CNPJ;País;Empresa;Objeto;Gestor;Valor Anual;Início;Término
Global SaaS Inc.;;Estados Unidos;Matriz;Licenças;Ana;1000;01/01/2026;31/12/2026
Global SaaS Inc.;;Estados Unidos;Matriz;Licenças;Ana;1000;01/01/2026;31/12/2026
Fornecedor Nacional;;Brasil;Matriz;Suporte;Ana;1000;01/01/2026;31/12/2026`;
    const { cabecalhos, linhas } = parseCSV(csv);
    const r = processarImportacao(cabecalhos, linhas, sugerirMapeamento(cabecalhos));
    expect(r.importados.map((x) => [x.cnpj, x.pais])).toEqual([["", "Estados Unidos"], ["", undefined]]);
    expect(r.duplicidades).toHaveLength(1);
  });

  it("mesmo fornecedor e objeto em outra empresa do grupo não é duplicidade", () => {
    const csv = `Fornecedor;Empresa;Objeto;Gestor;Valor Anual;Início;Término
Telmex;Akross;Multicloud;Ana;1000;01/01/2026;31/12/2026
Telmex;Mobicare;Multicloud;Ana;1000;01/01/2026;31/12/2026`;
    const { cabecalhos, linhas } = parseCSV(csv);
    const r = processarImportacao(cabecalhos, linhas, sugerirMapeamento(cabecalhos));
    expect(r.importados).toHaveLength(2);
    expect(r.duplicidades).toEqual([]);
  });

  it("sugere mapeamento e gera relatório", () => {
    const { cabecalhos, linhas } = parseCSV(CSV);
    const m = sugerirMapeamento(cabecalhos);
    expect(m.fornecedor).toBe("Razão Social");
    expect(m.dataFim).toBe("Término");
    const r = processarImportacao(cabecalhos, linhas, m);
    expect(r.total).toBe(4);
    expect(r.importados).toHaveLength(1);
    expect(r.importados[0].valorAnual).toBe(120000);
    expect(r.importados[0].renovacaoAutomatica).toBe(true);
    expect(r.inconsistencias[0].linha).toBe(3);
    expect(r.incompletos[0].faltando).toContain("Objeto");
    expect(r.duplicidades[0].motivo).toContain("CT-OLD-1");
  });
});

describe("carga com dados faltando e valor mensal", () => {
  it("linha sem datas, valor ou gestor entra com pendências; sem fornecedor/objeto não entra; empresa padrão", () => {
    const csv = `Fornecedor;Empresa;Objeto;Gestor;Valor anual;Valor mensal;Data início;Data fim
Fornecedor A;;Licenças;;;1.000,00;;
Fornecedor B;Matriz;Suporte;Ana;12000;1000;01/01/2026;31/12/2026
Fornecedor C;Matriz;Outro;Ana;12000;900;01/01/2026;31/12/2026
;Matriz;Sem fornecedor;Ana;1;;01/01/2026;31/12/2026`;
    const { cabecalhos, linhas } = parseCSV(csv);
    const m = sugerirMapeamento(cabecalhos);
    expect([m.valorAnual, m.valorMensal]).toEqual(["Valor anual", "Valor mensal"]);
    const r = processarImportacao(cabecalhos, linhas, m, undefined, { empresaPadrao: "Akross Plataformas" });
    const a = r.importados.find((x) => x.fornecedor === "Fornecedor A")!;
    expect(a).toMatchObject({ empresa: "Akross Plataformas", valorAnual: 12000, dataInicio: "", dataFim: "" });
    expect(a.pendencias).toEqual(["Empresa (usada a padrão: confira)", "Gestor", "Data de início", "Data de fim (ou indeterminado)"]);
    expect(r.importados.find((x) => x.fornecedor === "Fornecedor B")?.pendencias).toBeUndefined();
    expect(r.inconsistencias[0].erros[0]).toMatch(/não bate/);
    expect(r.incompletos[0].faltando).toEqual(["Fornecedor (razão social)"]);
    const sem = processarImportacao(cabecalhos, linhas.slice(0, 1), m);
    expect(sem.incompletos[0].faltando).toEqual(["Empresa"]);
  });
});

describe("contrato por demanda", () => {
  it("coluna “Por demanda” marca o valor anual como estimado", () => {
    const csv = `Fornecedor;Empresa;Objeto;Gestor;Valor anual;Por demanda (valor estimado);Data início;Data fim
Fornecedor D;Matriz;Serviços sob demanda;Ana;600000;Sim;01/01/2026;31/12/2026
Fornecedor E;Matriz;Locação;Ana;120000;Não;01/01/2026;31/12/2026`;
    const { cabecalhos, linhas } = parseCSV(csv);
    const m = sugerirMapeamento(cabecalhos);
    expect(m.porDemanda).toBe("Por demanda (valor estimado)");
    expect(m.valorAnual).toBe("Valor anual");
    const r = processarImportacao(cabecalhos, linhas, m);
    expect(r.importados.find((x) => x.fornecedor === "Fornecedor D")?.porDemanda).toBe(true);
    expect(r.importados.find((x) => x.fornecedor === "Fornecedor E")?.porDemanda).toBeUndefined();
  });
});
