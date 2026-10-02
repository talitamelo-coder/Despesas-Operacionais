import { describe, expect, it } from "vitest";
import { gerarAlertas } from "./alertas";
import type { Contrato } from "../types";

const c: Contrato = {
  contrato_id: "c1",
  codigo: "CT-2026-0001",
  empresaId: "e",
  fornecedorId: "f",
  objeto: "x",
  tipoContratoId: "t",
  gestorId: "gestor",
  analistaId: "analista",
  status: "Vigente",
  condicoes: { moeda: "BRL", valorAnual: 100, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
  vigencia: {
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
    tipoVigencia: "Prazo determinado",
    avisoPrevioDias: 90,
    renovacaoAutomatica: true,
    prazoGestorDias: 30,
  },
  reajuste: { possui: false },
  rescisao: { permite: true, possuiMulta: false },
  execucaoFinanceira: { simulado: true },
  origens: {},
  criadoEm: "",
  atualizadoEm: "",
};

describe("alertas", () => {
  it("gera eventos para gestor + suprimentos", () => {
    const a = gerarAlertas(c, undefined, "2026-06-01");
    expect(a.map((x) => x.tipo)).toEqual([
      "60 dias para data limite",
      "Abertura da avaliação",
      "30 dias para data limite",
      "Renovação automática em risco",
    ]);
    expect(a.every((x) => x.destinatarios.includes("gestor") && x.destinatarios.includes("analista"))).toBe(true);
  });

  it("resposta do gestor interrompe lembretes futuros, mas mantém crítico para Suprimentos", () => {
    const respondido = { ...c, avaliacaoRenovacao: { desejaRenovar: "Sim" as const, respondidoEm: "2026-08-10T10:00:00Z" } };
    const a = gerarAlertas(respondido, undefined, "2026-08-15");
    const lembrete30 = a.find((x) => x.tipo === "30 dias para data limite")!;
    expect(lembrete30.status).toBe("Interrompido");
    const critico = a.find((x) => x.tipo === "Renovação automática em risco")!;
    expect(critico.status).toBe("Programado");
    expect(critico.destinatarios).toEqual(["analista"]);
  });
});
