import { describe, expect, it } from "vitest";
import { faixaVencimento, geraReceita, montarPainelClientes } from "./painelClientes";
import { planejarImportacao, type ContextoImportacao } from "./importacaoCsv";
import type { Contrato, Usuario } from "../types";

const H = "2026-10-16";
const contrato = (id: string, p: { cliente?: string; fixo?: number; variavel?: number; fim?: string; indeterminado?: boolean; status?: Contrato["status"]; principal?: string; moeda?: "BRL" | "USD" } = {}): Contrato =>
  ({
    contrato_id: id, codigo: id, natureza: "Receita", status: p.status ?? "Vigente", clienteId: p.cliente ?? "cl1", fornecedorId: "", empresaId: "e", objeto: id, gestorId: "u1",
    condicoes: { moeda: p.moeda ?? "BRL", valorAnual: 0, periodicidadePagamento: "Mensal", condicaoPagamento: "", cotacao: p.moeda === "USD" ? { valor: 5, data: H, fonte: "Contrato" } : undefined },
    vigencia: { dataInicio: "2025-01-01", dataFim: p.indeterminado ? "" : p.fim ?? "2028-12-31", tipoVigencia: p.indeterminado ? "Prazo indeterminado" : "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30 },
    receita: { tipoReceita: p.variavel !== undefined && p.fixo === undefined ? "Variável" : "Fixa", valorMensalFixo: p.fixo, valorMensalVariavelEstimado: p.variavel, contratoPrincipalId: p.principal },
  }) as unknown as Contrato;

describe("painel de contratos de clientes", () => {
  it("soma receita em BRL, separa fixa, faixas de vencimento e risco", () => {
    const cs = [
      contrato("a", { fixo: 100, fim: "2026-09-30" }), // vencido
      contrato("b", { fixo: 50, fim: "2026-12-01" }), // até 90 dias
      contrato("c", { variavel: 10, moeda: "USD", indeterminado: true }),
      contrato("d", { principal: "c", variavel: 0 }), // apurada em outro: não soma
      contrato("e", { fixo: 999, status: "Encerrado" }),
    ];
    const p = montarPainelClientes(cs, H);
    expect(p.linhas.map((l) => l.contrato.contrato_id)).toEqual(["a", "b", "c", "d"]);
    expect(p.receitaMensal).toBe(100 + 50 + 50);
    expect(p.receitaFixa).toBe(150);
    expect(p.emRisco).toEqual({ valor: 150, quantidade: 2 });
    expect(p.renovacaoAutomatica.quantidade).toBe(1);
    expect(p.porFaixa.map((f) => f.chave)).toEqual(["Vencido", "Até 90 dias", "Acima de 1 ano", "Prazo indeterminado"]);
    expect(p.semEstimativa).toBe(0);
    expect(p.alertas[0]).toMatchObject({ contrato_id: "a", gravidade: "critico" });
    expect(p.alertas.some((x) => x.contrato_id === "b" && x.gravidade === "alerta")).toBe(true);
    expect(p.alertas.find((x) => x.contrato_id === "c")?.titulo).toMatch(/Revisão anual atrasada/);
  });

  it("concentração acima de 50% e saldo a faturar geram alerta", () => {
    const cs = [contrato("a", { fixo: 900, cliente: "grande" }), contrato("b", { fixo: 100, cliente: "outro" })];
    const saldo = { moeda: "BRL", contratadoBase: 100, aportes: 0, contratado: 100, comprometido: 0, realizado: 85, licencas: 0, linhas: 0, consumido: 85, disponivel: 15, percentualConsumido: 85 } as const;
    const p = montarPainelClientes(cs, H, { saldos: { a: saldo } });
    expect(p.concentracao).toEqual({ clienteId: "grande", percentual: 90 });
    expect(p.alertas.some((x) => /Concentração/.test(x.titulo))).toBe(true);
    expect(p.alertas.some((x) => x.contrato_id === "a" && /85%/.test(x.titulo))).toBe(true);
  });

  it("cancelado gera receita até o fim; sem início fica sem vigência", () => {
    expect(geraReceita(contrato("x", { status: "Cancelado", fim: "2026-12-31" }), H)).toBe(true);
    expect(geraReceita(contrato("x", { status: "Cancelado", fim: "2026-09-30" }), H)).toBe(false);
    const sem = contrato("y", { indeterminado: true });
    sem.vigencia.dataInicio = "";
    expect(faixaVencimento(sem, H).faixa).toBe("Sem vigência");
  });
});

describe("importação de contratos de clientes", () => {
  const gestor = { id: "u1", nome: "Ana Paula Souza", nomeExibicao: "Ana Souza", email: "ana@x.com", perfil: "Gestor", ativo: true } as Usuario;
  const ctx: ContextoImportacao = { hoje: H, fornecedores: [], contratos: [], clientes: [], usuarios: [gestor], empresas: [{ id: "e1", nome: "Empresa" } as never], licencas: [], movimentacoes: [], atribuicoes: [], colaboradores: [], dominios: [], linhas: [], usos: [] };
  const cab = "cliente;objeto;numero_contrato_cliente;gestor;data_inicio;data_fim;tipo_receita;valor_mensal_fixo;valor_mensal_variavel_estimado;situacao";

  it("cria cliente uma vez, aceita sem data de início com pendência, recusa gestor sem perfil e não duplica", () => {
    const csv = [cab, "Cliente A;WiFi;123;Ana Souza;;31/12/2027;fixa;1.000,00;;vigente", "Cliente A;WiFi;123;Ana Souza;;31/12/2027;fixa;1.000,00;;vigente", "Cliente A;Ads;;ana@x.com;01/01/2026;indeterminado;variavel;;n/a;", "Cliente B;X;;Fulano;01/01/2026;31/12/2026;fixa;10;;"].join("\n");
    const p = planejarImportacao("contratosClientes", csv, ctx);
    expect(p.linhas.map((l) => l.situacao)).toEqual(["Importar", "Já existe", "Importar", "Recusada"]);
    expect(p.operacoes.filter((o) => o.tipo === "cliente")).toHaveLength(1);
    const [c1, c2] = p.operacoes.flatMap((o) => (o.tipo === "contratoCliente" ? [o.contrato] : []));
    expect(c1.vigencia.dataInicio).toBe("");
    expect(p.linhas[0].motivo).toMatch(/pendência/);
    expect(c2.vigencia.tipoVigencia).toBe("Prazo indeterminado");
    expect(c2.confirmacoesPendentes?.[0]).toMatch(/Estimativa/);
    expect(p.linhas[3].motivo).toMatch(/perfil Gestor/);
  });
});
