import { describe, expect, it } from "vitest";
import {
  calcularKpis,
  cambioNaData,
  chaveEmail,
  cobrancaNaCompetencia,
  converterCusto,
  equivalentes,
  erroAtribuicao,
  errosLicenca,
  errosMovimentacao,
  ganhosEPerdas,
  parcelasDoPeriodo,
  posicaoNaData,
  rankingOfensores,
  type DadosCusto,
} from "./licencas";
import type { AtribuicaoLicenca, Colaborador, Licenca, MovimentacaoLicenca, Parametro } from "../types";

const lic = (id: string, extra: Partial<Licenca> = {}): Licenca => ({
  id, fornecedorId: `f-${id}`, produto: id, tipoCobranca: "Assento", moeda: "BRL", periodicidade: "Mensal", vencimentoTipo: "Mensal", status: "Ativa", criadoEm: "", atualizadoEm: "", ...extra,
});
let seq = 0;
const mov = (licencaId: string, tipo: MovimentacaoLicenca["tipo"], data: string, quantidade?: number, precoUnitario?: number): MovimentacaoLicenca => ({
  id: `m${++seq}`, licencaId, tipo, data, quantidade, precoUnitario, responsavel: "R", valorAnualAntes: 0, valorAnualDepois: 0, registradoPorId: "u", registradoEm: `2026-01-01T00:00:0${seq % 10}`,
});
const col = (id: string, area: string, extra: Partial<Colaborador> = {}): Colaborador => ({ id, email: `${id}@a.com`, nome: id, area, status: "Ativo", tipoConta: "Pessoa", ...extra });
const at = (licencaId: string, colaboradorId: string, dataInicio = "2025-01-01"): AtribuicaoLicenca => ({ id: `${licencaId}-${colaboradorId}`, licencaId, colaboradorId, status: "Ativa", dataInicio });
const par = (chave: Parametro["chave"], valor: string, vigenteDesde = "2020-01-01"): Parametro => ({ chave, valor, vigenteDesde, atualizadoPorId: "u", atualizadoEm: "" });
const parametros = [par("spread_cambial", "4"), par("aliquota_iof_usd", "3.5"), par("fator_impostos_simulado", "1.2"), par("dominios_grupo", "akross.com.br, mobicare.com.br")];
const cotacoes = [{ data: "2026-01-02", ptaxVenda: 5 }];

describe("custo da licença", () => {
  it("IOF só em USD; BRL sem IOF; spread e IOF sobre a PTAX", () => {
    const c = cambioNaData(cotacoes, parametros, "2026-03-31");
    expect(converterCusto(100, "BRL", c)).toEqual({ valorBRL: 100, iofBRL: 0, custoRealBRL: 100 });
    const usd = converterCusto(100, "USD", c)!;
    expect(usd.valorBRL).toBeCloseTo(520);
    expect(usd.iofBRL).toBeCloseTo(18.2);
    expect(usd.custoRealBRL).toBeCloseTo(538.2);
    expect(converterCusto(100, "USD", cambioNaData([], parametros, "2026-03-31"))).toBeUndefined();
  });

  it("mudar spread/IOF vale a partir da vigência, sem recalcular o passado", () => {
    const p2 = [...parametros, par("spread_cambial", "6", "2026-06-01")];
    expect(cambioNaData(cotacoes, p2, "2026-05-31").spreadPercentual).toBe(4);
    expect(cambioNaData(cotacoes, p2, "2026-06-30").spreadPercentual).toBe(6);
  });

  it("assentos e preço vêm das movimentações; redução sai do lote mais recente", () => {
    const m = [mov("a", "Compra", "2026-01-10", 10, 100), mov("a", "Compra", "2026-03-01", 5, 120), mov("a", "Redução", "2026-04-01", 3)];
    const pos = posicaoNaData(m, "2026-04-30");
    expect(pos.assentos).toBe(12);
    expect(pos.lotes).toEqual([{ quantidade: 10, precoUnitario: 100 }, { quantidade: 2, precoUnitario: 120 }]);
    const e = equivalentes(lic("a"), m, cambioNaData(cotacoes, parametros, "2026-04-30"), "2026-04-30");
    expect(e.anualOriginal).toBe((1000 + 240) * 12);
    expect(e.mensalOriginal).toBe(1240);
    expect(posicaoNaData([...m, mov("a", "Renegociação", "2026-05-01", undefined, 90)], "2026-05-31").lotes.every((l) => l.precoUnitario === 90)).toBe(true);
  });

  it("anual entra inteira no mês da compra e no aniversário", () => {
    const m = [mov("a", "Compra", "2025-03-15", 10, 100), mov("a", "Compra", "2025-08-01", 2, 100)];
    const l = { periodicidade: "Anual" as const };
    expect(cobrancaNaCompetencia(l, m, "2025-03")).toBe(1000);
    expect(cobrancaNaCompetencia(l, m, "2025-04")).toBe(0);
    expect(cobrancaNaCompetencia(l, m, "2025-08")).toBe(200);
    expect(cobrancaNaCompetencia(l, m, "2026-03")).toBe(1200);
  });
});

describe("qualidade de dados", () => {
  it("anual com vencimento mensal bloqueia", () => {
    expect(errosLicenca({ fornecedorId: "f", produto: "X", periodicidade: "Anual", vencimentoTipo: "Mensal" })[0]).toMatch(/anual/);
    expect(errosLicenca({ fornecedorId: "f", produto: "X", periodicidade: "Mensal", vencimentoTipo: "Data" })).toHaveLength(1);
  });

  it("não atribui sem assento livre nem duplica e-mail; não reduz abaixo do atribuído", () => {
    const l = lic("a");
    const m = [mov("a", "Compra", "2026-01-01", 1, 10)];
    const ats = [at("a", "c1")];
    expect(erroAtribuicao(l, m, ats, col("c2", "TI"))).toMatch(/Sem assento livre/);
    expect(erroAtribuicao(l, m, ats, col("c1", "TI"))).toMatch(/já tem/);
    expect(erroAtribuicao(l, m, [], col("c3", "TI", { status: "Desligado" }))).toMatch(/desligado/);
    expect(errosMovimentacao(l, m, 1, { tipo: "Redução", data: "2026-02-01", quantidade: 1, responsavel: "R" })[0]).toMatch(/Encerre/);
  });

  it("e-mail é a identidade; domínios do grupo são a mesma pessoa", () => {
    const dom = ["akross.com.br", "mobicare.com.br"];
    expect(chaveEmail(" Ana.Lima@Mobicare.com.br ", dom)).toBe("ana.lima@akross.com.br");
    expect(chaveEmail("ana@outra.com", dom)).toBe("ana@outra.com");
  });
});

describe("rateio e dashboard", () => {
  const d: DadosCusto = {
    licencas: [lic("seat", { moeda: "USD" }), lic("fixo", { tipoCobranca: "Fixo" }), ...Array.from({ length: 20 }, (_, i) => lic(`p${i}`))],
    movimentacoes: [
      mov("seat", "Compra", "2026-01-05", 4, 10),
      mov("fixo", "Compra", "2026-01-05", 1, 500),
      ...Array.from({ length: 20 }, (_, i) => mov(`p${i}`, "Compra", "2026-01-05", 1, 10 + i)),
    ],
    atribuicoes: [at("seat", "c1"), at("seat", "c2"), ...Array.from({ length: 20 }, (_, i) => at(`p${i}`, `x${i}`))],
    colaboradores: [col("c1", "TI"), col("c2", "Vendas"), ...Array.from({ length: 20 }, (_, i) => col(`x${i}`, "Ops"))],
    cotacoes,
    parametros,
  };
  const parcelas = parcelasDoPeriodo(d, "2026-01", "2026-03", "2026-12-31");

  it("rateio: assento livre vira ocioso; fixo sem usuário vira não atribuído", () => {
    const jan = parcelas.filter((p) => p.competencia === "2026-01" && p.licencaId === "seat");
    expect(jan.filter((p) => p.tipo === "Pessoa")).toHaveLength(2);
    expect(jan.find((p) => p.tipo === "Disponível")!.valorOriginal).toBe(20);
    expect(parcelas.find((p) => p.licencaId === "fixo")!.tipo).toBe("Não atribuído");
  });

  it("soma das barras do ranking (top + Demais + Não atribuído + Disponível) = total, em BRL e USD", () => {
    for (const dim of ["Usuário", "Área", "Fornecedor"] as const)
      for (const moeda of ["BRL", "USD"] as const) {
        const r = rankingOfensores(parcelas, dim, moeda);
        expect(r.barras.reduce((a, b) => a + b.valorBRL, 0)).toBeCloseTo(r.totalBRL);
        expect(r.barras.reduce((a, b) => a + b.valorUSD, 0)).toBeCloseTo(r.totalUSD);
      }
    const r = rankingOfensores(parcelas, "Usuário", "BRL");
    expect(r.barras.filter((b) => b.tipo === "Item")).toHaveLength(15);
    expect(r.barras.map((b) => b.tipo).slice(15)).toEqual(["Demais", "Não atribuído a usuário", "Disponível (ocioso)"]);
    const itens = r.barras.filter((b) => b.tipo === "Item").map((b) => b.valorBRL);
    expect([...itens].sort((a, b) => b - a)).toEqual(itens);
  });

  it("cenário com impostos nunca entra nos totais", () => {
    const k = calcularKpis(parcelas, 22);
    const semFator = calcularKpis(parcelasDoPeriodo({ ...d, parametros: parametros.filter((p) => p.chave !== "fator_impostos_simulado") }, "2026-01", "2026-03", "2026-12-31"), 22);
    expect(k.gastoBRL).toBeCloseTo(semFator.gastoBRL);
    expect(k.exposicaoTributariaBRL).toBeCloseTo(k.gastoBRL * 1.2);
    expect(semFator.exposicaoTributariaBRL).toBeUndefined();
    expect(k.gastoUSD).toBe(40 * 3);
  });

  it("ganhos e perdas: redução é economia, compra é aumento", () => {
    const m = [{ ...mov("seat", "Redução", "2026-02-01", 1), valorAnualAntes: 480, valorAnualDepois: 360 }, { ...mov("p1", "Compra", "2026-02-01", 1, 11), valorAnualAntes: 0, valorAnualDepois: 132 }];
    const g = ganhosEPerdas({ ...d, movimentacoes: m }, "2026-01-01", "2026-12-31");
    expect(g.economiaBRL).toBeGreaterThan(0);
    expect(g.aumentoBRL).toBe(132);
  });
});
