import { describe, expect, it } from "vitest";
import { calcularPrazos, dataAberturaAvaliacao, dataLimiteManifestacao } from "./prazos";
import { diffDias } from "../datas";
import type { Vigencia } from "../types";

const base: Vigencia = {
  dataInicio: "2026-01-01",
  dataFim: "2026-12-31",
  tipoVigencia: "Prazo determinado",
  avisoPrevioDias: 90,
  renovacaoAutomatica: false,
  prazoGestorDias: 30,
};

describe("prazos", () => {
  it("data limite = fim − aviso prévio", () => {
    expect(dataLimiteManifestacao(base)).toBe("2026-10-02");
  });

  it("aviso 90 + gestor 30 => avaliação abre 120 dias antes", () => {
    expect(diffDias(dataAberturaAvaliacao(base), base.dataFim)).toBe(120);
  });

  it("aviso 120 + gestor 30 => avaliação abre 150 dias antes", () => {
    const v = { ...base, avisoPrevioDias: 120 };
    expect(diffDias(dataAberturaAvaliacao(v), v.dataFim)).toBe(150);
  });

  it("classifica fases", () => {
    expect(calcularPrazos(base, { referencia: "2026-05-01" }).fase).toBe("Normal");
    expect(calcularPrazos(base, { referencia: "2026-09-01" }).fase).toBe("Normal");
    expect(calcularPrazos(base, { referencia: "2026-09-02" }).fase).toBe("Avaliação aberta");
    expect(calcularPrazos(base, { referencia: "2026-09-20" }).fase).toBe("Data limite próxima");
    expect(calcularPrazos(base, { referencia: "2026-10-10" }).fase).toBe("Data limite vencida");
    expect(calcularPrazos(base, { referencia: "2027-01-05" }).fase).toBe("Vencido");
  });

  it("renovação automática em risco só perto da data limite e sem resolução", () => {
    const v = { ...base, renovacaoAutomatica: true };
    expect(calcularPrazos(v, { referencia: "2026-08-01" }).renovacaoAutomaticaEmRisco).toBe(false);
    expect(calcularPrazos(v, { referencia: "2026-09-10" }).renovacaoAutomaticaEmRisco).toBe(true);
    expect(calcularPrazos(v, { referencia: "2026-09-10", resolvido: true }).renovacaoAutomaticaEmRisco).toBe(false);
    expect(calcularPrazos(base, { referencia: "2026-09-10" }).renovacaoAutomaticaEmRisco).toBe(false);
  });
});
