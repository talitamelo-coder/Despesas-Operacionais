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
