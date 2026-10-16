import { describe, expect, it } from "vitest";
import { desfechoAvaliacao } from "./avaliacao";
import { calcularPrazos, errosVigencia, proximaRevisaoAnual } from "./prazos";
import type { Vigencia } from "../types";

describe("avaliação de renovação", () => {
  it("não renovar e não substituir cancela o contrato", () => {
    expect(desfechoAvaliacao({ desejaRenovar: "Não", desejaSubstituir: "Não" }, "Prazo determinado")).toBe("Cancelar contrato");
    expect(desfechoAvaliacao({ desejaEncerrar: "Sim" }, "Prazo determinado")).toBe("Cancelar contrato");
    expect(desfechoAvaliacao({ desejaRenovar: "Sim" }, "Prazo determinado")).toBe("Renovação");
    expect(desfechoAvaliacao({ desejaRenovar: "Sim" }, "Prazo indeterminado")).toBe("Manter fornecedor");
    expect(desfechoAvaliacao({ desejaSubstituir: "Sim" }, "Prazo indeterminado")).toBe("Substituição de fornecedor");
    expect(desfechoAvaliacao({ desejaRenovar: "Não" }, "Prazo determinado")).toBeUndefined();
  });
});

describe("prazo indeterminado: revisão anual", () => {
  const v: Vigencia = { dataInicio: "2024-03-10", dataFim: "", tipoVigencia: "Prazo indeterminado", avisoPrevioDias: 30, renovacaoAutomatica: false, prazoGestorDias: 30 };
  it("revisão é o aniversário seguinte à última respondida", () => {
    expect(proximaRevisaoAnual(v)).toBe("2025-03-10");
    expect(proximaRevisaoAnual(v, "2025-03-10")).toBe("2026-03-10");
    expect(proximaRevisaoAnual({ ...v, dataBaseRevisao: "2024-12-01" }, "2025-12-01")).toBe("2026-12-01");
  });
  it("abre avaliação antes da revisão e fica pendente se passar sem resposta", () => {
    expect(calcularPrazos(v, { referencia: "2026-01-20", ultimaRevisao: "2025-03-10" }).fase).toBe("Avaliação aberta");
    expect(calcularPrazos(v, { referencia: "2026-04-01", ultimaRevisao: "2025-03-10" }).fase).toBe("Data limite vencida");
    expect(calcularPrazos(v, { referencia: "2026-04-01", ultimaRevisao: "2026-03-10" }).fase).toBe("Normal");
  });
  it("vigência é obrigatória", () => {
    expect(errosVigencia({ ...v, dataInicio: "" })).toHaveLength(1);
    expect(errosVigencia(v)).toEqual([]);
    expect(errosVigencia({ dataInicio: "2026-01-01", tipoVigencia: "Prazo determinado" })).toHaveLength(1);
    expect(errosVigencia({ dataInicio: "2026-01-01", dataFim: "2025-01-01", tipoVigencia: "Prazo determinado" })).toHaveLength(1);
  });
});
