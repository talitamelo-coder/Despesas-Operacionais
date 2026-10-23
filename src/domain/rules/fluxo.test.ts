import { describe, expect, it } from "vitest";
import { aprovacaoComercialConcluida, aprovacoesPadrao, etapasDoProcesso, indiceEtapa, migrarEtapa, proximoStatus, requisitosPara } from "./fluxo";
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
  const desligado = { exigirAprovacao: false, exigirJuridico: false };
  const tudo = { exigirAprovacao: true, exigirJuridico: true };

  it("fluxo padrão: Rascunho → Com Suprimentos → Aguardando assinatura → Concluído (todos os tipos)", () => {
    for (const tipo of ["Nova contratação", "Renovação", "Aditivo"] as const)
      expect(etapasDoProcesso({ tipo })).toEqual(["Rascunho", "Com Suprimentos", "Aguardando assinatura", "Concluído"]);
    expect(proximoStatus({ tipo: "Nova contratação", status: "Com Suprimentos" })).toBe("Aguardando assinatura");
    expect(etapasDoProcesso({ tipo: "Renovação" }, tudo)).toEqual(["Rascunho", "Com Suprimentos", "Aguardando aprovação comercial", "Em análise jurídica", "Aguardando assinatura", "Concluído"]);
  });

  it("início exige só origem, empresa e objeto (gestor opcional)", () => {
    const pend = requisitosPara("Com Suprimentos", processo(), []);
    expect(pend.map((p) => p.campo)).toEqual(["origemOportunidade", "empresaId", "objeto"]);
    const ok = processo({ origemOportunidade: "Gestor", empresaId: "e1", objeto: "x" });
    expect(requisitosPara("Com Suprimentos", ok, [])).toEqual([]);
  });

  it("sem aprovação e sem jurídico: assinatura exige a negociação concluída, não parecer", () => {
    const p = processo({
      propostas: [{ id: "pr1", fornecedorId: "f1", propostaInicialAnual: 100 } as ProcessoContratacao["propostas"][number]],
      propostaRecomendadaId: "pr1",
      justificativa: "ok",
      condicoes: { moeda: "BRL", condicaoPagamento: "30 dias", periodicidadePagamento: "Mensal" },
    });
    expect(requisitosPara("Aguardando assinatura", p, [], desligado)).toEqual([]);
    expect(requisitosPara("Aguardando assinatura", processo(), [], desligado).map((x) => x.campo)).toContain("propostaRecomendadaId");
    expect(requisitosPara("Aguardando assinatura", p, [], tudo).map((x) => x.campo)).toEqual(["juridico"]);
  });

  it("jurídico ligado: só após aprovação comercial e com minuta", () => {
    const p = processo({ gestorId: "g", analistaId: "a", diretorId: "d" });
    p.aprovacoes = aprovacoesPadrao(p);
    expect(p.aprovacoes.find((a) => a.papel === "Diretor")?.tipo).toBe("Ciência");
    expect(requisitosPara("Em análise jurídica", p, [{ categoria: "Minuta" }], tudo).length).toBe(1);
    p.aprovacoes = p.aprovacoes.map((a) => (a.tipo === "Aprovação" ? { ...a, status: "Aprovado" } : a));
    expect(aprovacaoComercialConcluida(p)).toBe(true);
    expect(requisitosPara("Em análise jurídica", p, [], tudo)).toHaveLength(1);
    expect(requisitosPara("Em análise jurídica", p, [{ categoria: "Minuta" }], tudo)).toEqual([]);
  });

  it("migra status antigos e etapas desligadas, com descrição para a linha do tempo", () => {
    const tipo = "Nova contratação" as const;
    expect(migrarEtapa({ tipo, status: "Em negociação" as never }, desligado)?.status).toBe("Com Suprimentos");
    expect(migrarEtapa({ tipo, status: "Validação de Suprimentos" as never }, desligado)?.descricao).toMatch(/simplificado/);
    expect(migrarEtapa({ tipo, status: "Em análise jurídica" }, desligado)?.status).toBe("Aguardando assinatura");
    expect(migrarEtapa({ tipo, status: "Aguardando aprovação comercial" }, { exigirAprovacao: false, exigirJuridico: true })?.status).toBe("Em análise jurídica");
    const s = migrarEtapa({ tipo, status: "Suspenso", statusAntesSuspensao: "Em cotação" as never }, desligado);
    expect(s).toMatchObject({ status: "Suspenso", statusAntesSuspensao: "Com Suprimentos" });
    expect(migrarEtapa({ tipo, status: "Com Suprimentos" }, desligado)).toBeUndefined();
    expect(migrarEtapa({ tipo, status: "Em análise jurídica" }, tudo)).toBeUndefined();
  });

  it("etapa desligada aparece na última etapa ligada anterior", () => {
    expect(indiceEtapa({ tipo: "Renovação", status: "Em análise jurídica" }, desligado)).toBe(1);
    expect(indiceEtapa({ tipo: "Renovação", status: "Aguardando assinatura" }, desligado)).toBe(2);
  });

  it("diretor aprova em exceção", () => {
    const p = processo({ gestorId: "g", analistaId: "a", diretorId: "d", excecao: true });
    expect(aprovacoesPadrao(p).find((a) => a.papel === "Diretor")?.tipo).toBe("Aprovação");
  });
});
