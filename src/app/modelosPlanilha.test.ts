import { describe, expect, it } from "vitest";
import { CAMPOS_IMPORTACAO, processarImportacao, sugerirMapeamento } from "@/domain/rules/importacao";
import { planejarImportacao } from "@/domain/rules/importacaoCsv";
import { gerarCsv } from "@/domain/rules/csv";
import { criarEstadoInicial } from "@/mocks/seed";
import { lerPlanilha, modeloContratosFornecedores, modeloImportacao } from "./modelosPlanilha";
import { lerZip } from "./xlsx";

const e = criarEstadoInicial();
const cad = { usuarios: e.usuarios, empresas: e.empresas, tipos: e.tiposContrato, config: e.configuracao };
const arquivo = (dados: Uint8Array, nome: string) => ({ name: nome, arrayBuffer: async () => dados.slice().buffer, text: async () => "" }) as unknown as File;

describe("modelos Excel de carga", () => {
  it("contratos de fornecedores: cabeçalhos mapeiam sozinhos e listas vêm dos cadastros", async () => {
    const x = modeloContratosFornecedores(cad);
    const lido = await lerPlanilha(arquivo(x, "modelo.xlsx"));
    if ("texto" in lido) throw new Error("esperava xlsx");
    expect(lido.cabecalhos).toEqual(CAMPOS_IMPORTACAO.map((c) => c.rotulo));
    expect(lido.linhas).toEqual([]);
    const m = sugerirMapeamento(lido.cabecalhos);
    for (const c of CAMPOS_IMPORTACAO) expect(m[c.campo], c.campo).toBe(c.rotulo);
    const zip = await lerZip(x);
    expect(zip.get("xl/worksheets/sheet4.xml")).toContain(e.empresas[0].nome); // Contratos, Fornecedores, Instruções, Listas
  });

  it("linha preenchida no padrão do modelo é importada (indeterminado, multa e reajuste)", () => {
    const cab = CAMPOS_IMPORTACAO.map((c) => c.rotulo);
    const v: Record<string, string> = { fornecedor: "Fornecedor X", empresa: "Empresa", objeto: "Limpeza", gestor: "Carlos Mendes", valorAnual: "120000", dataInicio: "2026-01-01", dataFim: "indeterminado", periodicidade: "mensal", indiceReajuste: "ipca", multa: "3 mensalidades", unidade: "Posto", quantidade: "4" };
    const r = processarImportacao(cab, [CAMPOS_IMPORTACAO.map((c) => v[c.campo] ?? "")], sugerirMapeamento(cab));
    expect(r.inconsistencias).toEqual([]);
    expect(r.importados[0]).toMatchObject({ indeterminado: true, dataFim: "", periodicidade: "Mensal", indiceReajuste: "IPCA", multa: "3 mensalidades", unidade: "Posto", quantidade: 4 });
    const ruim = processarImportacao(cab, [CAMPOS_IMPORTACAO.map((c) => ({ ...v, dataFim: "talvez", periodicidade: "quinzenal" } as Record<string, string>)[c.campo] ?? "")], sugerirMapeamento(cab));
    expect(ruim.inconsistencias[0].erros.join(" ")).toMatch(/Data fim inválida.*Periodicidade inválida/);
  });

  it("contratos de clientes: Excel vira o mesmo CSV da importação", async () => {
    const x = modeloImportacao("contratosClientes", cad);
    const lido = await lerPlanilha(arquivo(x, "clientes.xlsx"));
    if ("texto" in lido) throw new Error("esperava xlsx");
    expect(lido.cabecalhos[0]).toBe("cliente"); // sem a marca “ *”
    const plano = planejarImportacao("contratosClientes", gerarCsv(lido.cabecalhos, lido.linhas), {
      hoje: "2026-10-20", fornecedores: [], contratos: [], clientes: [], usuarios: e.usuarios, empresas: e.empresas, licencas: [], movimentacoes: [], atribuicoes: [], colaboradores: [], dominios: [], linhas: [], usos: [],
    });
    expect(plano.linhas).toHaveLength(1); // a linha de exemplo, lida com datas e números do Excel
    expect(plano.linhas[0].motivo ?? "").not.toMatch(/inválid/);
  });

  it(".xls antigo pede para salvar como .xlsx", async () => {
    await expect(lerPlanilha(arquivo(new Uint8Array(), "velho.xls"))).rejects.toThrow(/xlsx/);
  });
});
