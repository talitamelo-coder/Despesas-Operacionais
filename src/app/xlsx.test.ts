import { describe, expect, it } from "vitest";
import { dataDeSerial, gerarXlsx, lerXlsx, lerZip, serialDeData } from "./xlsx";

/** Recompacta com deflate (como o Excel salva) para testar a leitura real. */
async function comDeflate(entradas: Map<string, string>, extras: Record<string, string> = {}): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  const todos = [...entradas.entries(), ...Object.entries(extras)];
  for (const [nome, txt] of todos) {
    const n = new TextEncoder().encode(nome);
    const cru = new TextEncoder().encode(txt);
    const comp = new Uint8Array(await new Response(new Blob([cru]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(8, 8, true); l.setUint32(18, comp.length, true); l.setUint32(22, cru.length, true); l.setUint16(26, n.length, true);
    partes.push(new Uint8Array(l.buffer), n, comp);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(20, comp.length, true); c.setUint32(24, cru.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + comp.length;
  }
  const tc = central.reduce((a, p) => a + p.length, 0);
  const f = new DataView(new ArrayBuffer(22));
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, todos.length, true); f.setUint16(10, todos.length, true); f.setUint32(12, tc, true); f.setUint32(16, off, true);
  const all = [...partes, ...central, new Uint8Array(f.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of all) out.set(p, o), (o += p.length);
  return out;
}

describe("xlsx", () => {
  const modelo = gerarXlsx({
    abas: [{ nome: "Contratos", colunas: [{ titulo: "Fornecedor", obrigatoria: true }, { titulo: "Início", formato: "data" }, { titulo: "Valor", formato: "numero" }, { titulo: "Moeda", lista: "Moedas" }], linhas: [["Fornecedor & Cia <Ltda>", "2026-01-31", 1234.5, "BRL"]] }],
    listas: { Moedas: ["BRL", "USD"] },
    instrucoes: ["Preencha uma linha por contrato."],
  });

  it("gera um .xlsx que se lê de volta (datas, números, caracteres especiais)", async () => {
    const l = await lerXlsx(modelo);
    expect(l[0]).toEqual(["Fornecedor *", "Início", "Valor", "Moeda"]);
    expect(l[1]).toEqual(["Fornecedor & Cia <Ltda>", "2026-01-31", "1234.5", "BRL"]);
    expect(l).toHaveLength(2); // linhas formatadas vazias não contam
    const zip = await lerZip(modelo);
    expect(zip.get("xl/worksheets/sheet1.xml")).toMatch(/Listas!\$A\$2:\$A\$3/);
    expect([...zip.keys()]).toContain("xl/worksheets/sheet3.xml"); // Instruções + Listas
  });

  it("lê arquivo salvo pelo Excel: deflate, textos compartilhados, data com formato próprio, células puladas", async () => {
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3" s="1"><v>${serialDeData("2027-12-31")}</v></c></row></sheetData></worksheet>`;
    const arq = await comDeflate(new Map(), {
      "xl/workbook.xml": `<workbook><sheets><sheet name="Dados" sheetId="1" r:id="rId9"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId9" Target="worksheets/planilha.xml"/></Relationships>`,
      "xl/worksheets/planilha.xml": sheet,
      "xl/sharedStrings.xml": `<sst><si><t>Fornecedor</t></si><si><r><t>Data </t></r><r><t>fim</t></r></si><si><t>Ação &amp; Cia</t></si></sst>`,
      "xl/styles.xml": `<styleSheet><numFmts><numFmt numFmtId="170" formatCode="dd/mm/yyyy;@"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="170"/></cellXfs></styleSheet>`,
    });
    expect(await lerXlsx(arq)).toEqual([["Fornecedor", "", "Data fim"], ["Ação & Cia", "", "2027-12-31"]]);
  });

  it("série do Excel ↔ data", () => {
    expect(serialDeData("1900-03-01")).toBe(61);
    expect(dataDeSerial(46022)).toBe("2025-12-31");
  });

  it("recusa arquivo que não é xlsx", async () => {
    await expect(lerXlsx(new TextEncoder().encode("a;b;c"))).rejects.toThrow(/xlsx/);
  });
});
