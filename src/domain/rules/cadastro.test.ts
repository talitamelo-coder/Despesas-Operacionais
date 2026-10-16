import { describe, expect, it } from "vitest";
import { descricaoMulta, pendenciasCadastro } from "./cadastro";
import { calcularPrazos } from "./prazos";
import { gerarAlertas } from "./alertas";
import type { Contrato } from "../types";

const c: Contrato = {
  contrato_id: "c1", codigo: "CT-2026-0001", empresaId: "e", fornecedorId: "f", objeto: "Licenças", tipoContratoId: "t",
  gestorId: "g", analistaId: "a", status: "Vigente",
  condicoes: { moeda: "BRL", valorAnual: 0, periodicidadePagamento: "Mensal", condicaoPagamento: "" },
  vigencia: { dataInicio: "", dataFim: "", tipoVigencia: "Prazo determinado", avisoPrevioDias: 90, renovacaoAutomatica: true, prazoGestorDias: 30 },
  reajuste: { possui: false }, rescisao: { permite: true, possuiMulta: false }, execucaoFinanceira: { simulado: true },
  origens: {}, criadoEm: "", atualizadoEm: "", confirmacoesPendentes: ["Confirmar status"],
};

describe("cadastro incompleto (importação)", () => {
  it("lista o que falta e as confirmações", () => {
    expect(pendenciasCadastro(c, { fornecedor_id: "f", razaoSocial: "X", nomeFantasia: "X", statusCadastral: "Ativo" }, "Não classificado")).toEqual([
      "Data de início", "Data de fim", "Valor anual", "CNPJ do fornecedor (ou marcar como fornecedor no exterior)", "Tipo de contrato", "Confirmar status",
    ]);
  });
  it("contrato sem datas não gera prazos nem alertas", () => {
    const p = calcularPrazos(c.vigencia, { referencia: "2026-10-15" });
    expect(p.fase).toBe("Sem vigência");
    expect(p.renovacaoAutomaticaEmRisco).toBe(false);
    expect(gerarAlertas(c)).toEqual([]);
  });
});

describe("multa rescisória", () => {
  const fmt = (v: number) => `R$ ${v}`;
  it("descrição livre; legado com percentual/valor continua legível", () => {
    expect(descricaoMulta({ possuiMulta: false }, fmt)).toBe("Não");
    expect(descricaoMulta({ possuiMulta: true, descricaoMulta: " 3 mensalidades ", percentual: 10 }, fmt)).toBe("3 mensalidades");
    expect(descricaoMulta({ possuiMulta: true, percentual: 20, valor: 5000 }, fmt)).toBe("20% · R$ 5000");
    expect(descricaoMulta({ possuiMulta: true }, fmt)).toMatch(/não informada/);
  });
});
