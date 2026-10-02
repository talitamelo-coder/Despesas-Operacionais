import { describe, expect, it } from "vitest";
import { aprovacaoComercialConcluida, aprovacoesPadrao, proximoStatus, requisitosPara } from "./fluxo";
import type { ProcessoContratacao } from "../types";

function processo(over: Partial<ProcessoContratacao> = {}): ProcessoContratacao {
  return {
    processo_id: "p1",
    codigo: "PC-2026-0001",
    tipo: "Nova contratação",
    status: "Rascunho",
    propostas: [],
    aprovacoes: [],
    juridico: { status: "Não iniciado" },
    assinatura: { status: "Não iniciada" },
    timeline: [],
    origens: {},
    criadoEm: "2026-01-01T00:00:00Z",
    atualizadoEm: "2026-01-01T00:00:00Z",
    criadoPorId: "u1",
    ...over,
  };
}

describe("fluxo do processo", () => {
  it("renovação pula validação JIRA e cotação", () => {
    expect(proximoStatus({ tipo: "Renovação", status: "Rascunho" })).toBe("Em negociação");
    expect(proximoStatus({ tipo: "Nova contratação", status: "Rascunho" })).toBe("Validação de Suprimentos");
  });

  it("início exige só origem, empresa, objeto e gestor", () => {
    const pend = requisitosPara("Validação de Suprimentos", processo(), []);
    expect(pend.map((p) => p.campo)).toEqual(["origemOportunidade", "empresaId", "objeto", "gestorId"]);
    const ok = processo({ origemOportunidade: "Gestor", empresaId: "e1", objeto: "x", gestorId: "g1" });
    expect(requisitosPara("Validação de Suprimentos", ok, [])).toEqual([]);
  });

  it("jurídico só após aprovação comercial e com minuta", () => {
    const p = processo({ gestorId: "g", analistaId: "a", diretorId: "d" });
    p.aprovacoes = aprovacoesPadrao(p);
    expect(p.aprovacoes.find((a) => a.papel === "Diretor")?.tipo).toBe("Ciência");
    expect(requisitosPara("Em análise jurídica", p, [{ categoria: "Minuta" }]).length).toBe(1);
    p.aprovacoes = p.aprovacoes.map((a) => (a.tipo === "Aprovação" ? { ...a, status: "Aprovado" } : a));
    expect(aprovacaoComercialConcluida(p)).toBe(true);
    expect(requisitosPara("Em análise jurídica", p, [])).toHaveLength(1);
    expect(requisitosPara("Em análise jurídica", p, [{ categoria: "Minuta" }])).toEqual([]);
  });

  it("diretor aprova em exceção", () => {
    const p = processo({ gestorId: "g", analistaId: "a", diretorId: "d", excecao: true });
    expect(aprovacoesPadrao(p).find((a) => a.papel === "Diretor")?.tipo).toBe("Aprovação");
  });
});
