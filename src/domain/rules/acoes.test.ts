import { describe, expect, it } from "vitest";
import { contraparteDaAcao } from "./acoes";

describe("fornecedor da ação", () => {
  const contratos = [
    { contrato_id: "c1", fornecedorId: "f1" },
    { contrato_id: "r1", natureza: "Receita" as const, fornecedorId: "", clienteId: "cl1" },
  ];
  const processos = [
    { processo_id: "p1", propostas: [{ id: "a", fornecedorId: "f2", moeda: "BRL" as const, propostaInicialAnual: 1 }], propostaRecomendadaId: "a" },
    { processo_id: "p2", propostas: [{ id: "b", fornecedorPotencial: "Novo Fornecedor", moeda: "BRL" as const, propostaInicialAnual: 1 }], propostaRecomendadaId: "b" },
    { processo_id: "p3", propostas: [], contrato_anterior_id: "c1" },
    { processo_id: "p4", propostas: [] },
  ];
  const nome = { fornecedor: (id: string) => ({ f1: "Prisma", f2: "LinkSul" })[id], cliente: (id: string) => ({ cl1: "Claro" })[id] };
  const ref = (tipo: "contrato" | "processo", id: string) => ({ tipo, id, codigo: id });

  it("contrato: fornecedor ou cliente; processo: recomendado, potencial, contrato anterior ou A definir", () => {
    expect(contraparteDaAcao(ref("contrato", "c1"), contratos, processos, nome)).toBe("Prisma");
    expect(contraparteDaAcao(ref("contrato", "r1"), contratos, processos, nome)).toBe("Claro");
    expect(contraparteDaAcao(ref("processo", "p1"), contratos, processos, nome)).toBe("LinkSul");
    expect(contraparteDaAcao(ref("processo", "p2"), contratos, processos, nome)).toBe("Novo Fornecedor");
    expect(contraparteDaAcao(ref("processo", "p3"), contratos, processos, nome)).toBe("Prisma");
    expect(contraparteDaAcao(ref("processo", "p4"), contratos, processos, nome)).toBe("A definir");
    expect(contraparteDaAcao(ref("contrato", "x"), contratos, processos, nome)).toBe("—");
  });
});
