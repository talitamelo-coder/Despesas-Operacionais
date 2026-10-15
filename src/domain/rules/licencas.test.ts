import { describe, expect, it } from "vitest";
import { alertasLicencas, colaboradorVisivel, divergenciaComContrato, resumoColaborador, resumoProduto } from "./licencas";
import type { AtribuicaoLicenca, Colaborador, Contrato, ProdutoLicenca } from "../types";

const base: ProdutoLicenca = {
  id: "p1", nome: "Ferramenta", fornecedorNome: "F", categoria: "Software", quantidadeContratada: 10,
  valorUnitario: 10, moeda: "USD", periodicidade: "Mensal", cotacao: { valor: 5, data: "2026-01-01", fonte: "PTAX" },
  iofPercentual: 3.5, situacao: "Ativo", criadoEm: "", atualizadoEm: "",
};
const at = (id: string, colaboradorId: string, extra: Partial<AtribuicaoLicenca> = {}): AtribuicaoLicenca => ({ id, produtoId: "p1", colaboradorId, status: "Ativa", ...extra });

describe("controle de licenças", () => {
  it("calcula uso, livres e custo ocioso em BRL", () => {
    const r = resumoProduto(base, [at("a1", "c1"), at("a2", "c2"), at("a3", "c3", { status: "Removida" })]);
    expect(r).toMatchObject({ contratadas: 10, emUso: 2, livres: 8, excedente: 0 });
    expect(r.custoUnitarioMensalBRL).toBe(50);
    expect(r.custoAnualBRL).toBe(6000);
    expect(r.custoOciosoAnualBRL).toBe(8 * 50 * 12);
    expect(r.custoAnualComImpostosBRL).toBeCloseTo(6210);
  });

  it("sem controle por pessoa não gera ociosidade", () => {
    const r = resumoProduto({ ...base, controlePorUsuario: false }, []);
    expect(r).toMatchObject({ emUso: 10, livres: 0, custoOciosoAnualBRL: 0 });
    expect(r.custoAnualBRL).toBe(6000);
  });

  it("anual vira mensal; sem cotação não converte", () => {
    expect(resumoProduto({ ...base, periodicidade: "Anual", valorUnitario: 120 }, []).custoUnitarioMensalBRL).toBe(50);
    expect(resumoProduto({ ...base, cotacao: undefined }, []).custoMensalBRL).toBeUndefined();
  });

  it("linha telefônica soma o valor de cada linha", () => {
    const linhas: ProdutoLicenca = { ...base, categoria: "Linha telefônica", moeda: "BRL", cotacao: undefined, quantidadeContratada: 2 };
    const r = resumoProduto(linhas, [at("a1", "c1", { valorMensalBRL: 80 }), at("a2", "c2", { valorMensalBRL: 100 })]);
    expect(r.custoMensalBRL).toBe(180);
    expect(r.custoOciosoAnualBRL).toBe(0);
  });

  it("alerta excedente, ociosidade, vencimento e inativo com licença", () => {
    const pequeno = { ...base, id: "p2", quantidadeContratada: 1, vencimento: "2026-11-01" };
    const colabs: Colaborador[] = [
      { id: "c1", nome: "Ana", tipo: "Pessoa", ativo: false },
      { id: "c2", nome: "Bia", tipo: "Pessoa", ativo: true },
    ];
    const atribs = [at("a1", "c1", { produtoId: "p2" }), at("a2", "c2", { produtoId: "p2" }), at("a3", "c2")];
    const tipos = alertasLicencas([base, pequeno], atribs, colabs, "2026-10-15").map((a) => a.tipo).sort();
    expect(tipos).toEqual(["Colaborador inativo com licença", "Licenças ociosas", "Mais usuários que licenças", "Vencimento próximo"]);
  });

  it("custo por pessoa e divergência com o contrato (sem alterar o contrato)", () => {
    expect(resumoColaborador("c1", [at("a1", "c1"), at("a2", "c2")], [base]).custoMensalBRL).toBe(50);
    const c = { contrato_id: "k1", condicoes: { quantidade: 12 } } as unknown as Contrato;
    expect(divergenciaComContrato(c, [{ ...base, contrato_id: "k1" }])).toMatch(/12.*10/);
    expect(divergenciaComContrato(c, [{ ...base, contrato_id: "k1", quantidadeContratada: 12 }])).toBeUndefined();
  });

  it("gestor vê só a própria área", () => {
    const c: Colaborador = { id: "c", nome: "X", tipo: "Pessoa", ativo: true, area: "Financeiro" };
    expect(colaboradorVisivel(c, { perfil: "Gestor", area: "Financeiro" }, false)).toBe(true);
    expect(colaboradorVisivel(c, { perfil: "Gestor", area: "Tecnologia" }, false)).toBe(false);
    expect(colaboradorVisivel(c, { perfil: "TI" }, true)).toBe(true);
  });
});
