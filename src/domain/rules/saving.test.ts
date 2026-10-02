import { describe, expect, it } from "vitest";
import { baselineAjustado, composicaoSaving, savingAnual, validarSaving } from "./saving";
import type { Saving } from "../types";

describe("saving", () => {
  it("exemplo do reajuste evitado: 1.000.000 + 5% => saving 50.000", () => {
    const baseline = baselineAjustado(1_000_000, 5);
    expect(baseline).toBe(1_050_000);
    const s: Saving = {
      tipoBaseline: "Baseline ajustado",
      baselineAnual: baseline,
      evidenciaBaseline: "Cláusula 8.1 — IPCA projetado",
      valorNegociadoAnual: 1_000_000,
      componentes: [{ origem: "Reajuste evitado", valorAnual: 50_000 }],
      origemOportunidade: "Suprimentos",
    };
    expect(savingAnual(s)).toBe(50_000);
    expect(validarSaving(s)).toEqual([]);
  });

  it("composição por origem e valor não alocado", () => {
    const s: Saving = {
      tipoBaseline: "Contrato anterior",
      baselineAnual: 1_350_000,
      valorNegociadoAnual: 1_000_000,
      componentes: [
        { origem: "Troca de fornecedor", valorAnual: 200_000 },
        { origem: "Negociação de preço", valorAnual: 100_000 },
      ],
      origemOportunidade: "Suprimentos",
    };
    const c = composicaoSaving(s);
    expect(c.total).toBe(350_000);
    expect(c.naoAlocado).toBe(50_000);
    expect(c.itens[0].origem).toBe("Troca de fornecedor");
  });

  it("bloqueia dupla contagem e baseline ajustado sem evidência", () => {
    const s: Saving = {
      tipoBaseline: "Baseline ajustado",
      baselineAnual: 100,
      valorNegociadoAnual: 90,
      componentes: [
        { origem: "Negociação de preço", valorAnual: 10 },
        { origem: "Negociação de preço", valorAnual: 5 },
      ],
      origemOportunidade: "Gestor",
    };
    const erros = validarSaving(s);
    expect(erros).toContain("Baseline ajustado exige evidência objetiva.");
    expect(erros).toContain("Soma das origens excede o saving anual total (dupla contagem).");
    expect(erros).toContain("Cada origem de saving deve aparecer uma única vez.");
  });
});
