import { describe, expect, it } from "vitest";
import { converterParaBRL, decomporVariacao } from "./cambio";

describe("câmbio e volume", () => {
  it("não converte sem cotação", () => {
    expect(converterParaBRL(100, "USD")).toBeUndefined();
    expect(converterParaBRL(100, "USD", { valor: 5.2 })).toBeCloseTo(520);
    expect(converterParaBRL(100, "BRL")).toBe(100);
  });

  it("decomposição soma exatamente a variação líquida", () => {
    const d = decomporVariacao({ quantidade: 100, precoUnitario: 10, taxa: 5 }, { quantidade: 120, precoUnitario: 9, taxa: 5.5 });
    expect(d.impactoPreco).toBeCloseTo(-500);
    expect(d.impactoVolume).toBeCloseTo(900);
    expect(d.impactoCambial).toBeCloseTo(540);
    expect(d.impactoPreco + d.impactoVolume + d.impactoCambial).toBeCloseTo(d.variacaoLiquidaBRL);
  });
});
