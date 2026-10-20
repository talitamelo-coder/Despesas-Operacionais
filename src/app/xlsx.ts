/**
 * Planilhas Excel (.xlsx) sem dependência externa: gera modelos (com listas suspensas e formatos)
 * e lê o arquivo preenchido. Só o necessário para carga de dados: primeira aba com dados, valores
 * de texto, número e data. Fórmulas são lidas pelo último valor calculado salvo no arquivo.
 */

export type ValorCelula = string | number | undefined;

export interface ColunaModelo {
  titulo: string;
  largura?: number;
  formato?: "texto" | "data" | "numero" | "inteiro";
  /** Lista suspensa: nome de uma lista em `listas`. */
  lista?: string;
  obrigatoria?: boolean;
}

export interface AbaModelo {
  nome: string;
  colunas: ColunaModelo[];
  linhas: ValorCelula[][];
}

export interface Modelo {
  abas: AbaModelo[];
  /** Listas para as listas suspensas (ficam numa aba "Listas"). */
  listas?: Record<string, string[]>;
  /** Texto da aba "Instruções" (uma linha por item). */
  instrucoes?: string[];
}

// ---------------------------------------------------------------- Escrita

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function letra(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Estilos: 0 normal, 1 cabeçalho, 2 cabeçalho obrigatório, 3 data, 4 número, 5 inteiro, 6 texto, 7 título instruções
const ESTILO = { data: 3, numero: 4, inteiro: 5, texto: 6 } as const;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** ISO (aaaa-mm-dd) → número de série do Excel. */
export function serialDeData(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000 + 25569;
}

/** Número de série do Excel → ISO (aaaa-mm-dd). */
export function dataDeSerial(n: number): string {
  return new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

function celula(ref: string, v: ValorCelula, estilo: number): string {
  const s = estilo ? ` s="${estilo}"` : "";
  if (v === undefined || v === "") return estilo ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (estilo === ESTILO.data && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}"${s}><v>${serialDeData(v)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

const LINHAS_FORMATADAS = 500;

function planilha(aba: AbaModelo, refLista: (nome: string) => string | undefined): string {
  const cols = aba.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 18}" customWidth="1"/>`).join("");
  const cab = `<row r="1" ht="32" customHeight="1">${aba.colunas.map((c, i) => celula(`${letra(i)}1`, c.titulo + (c.obrigatoria ? " *" : ""), c.obrigatoria ? 2 : 1)).join("")}</row>`;
  const total = Math.max(LINHAS_FORMATADAS, aba.linhas.length + 1);
  const linhas: string[] = [];
  for (let r = 0; r < total - 1; r++) {
    const dados = aba.linhas[r] ?? [];
    linhas.push(`<row r="${r + 2}">${aba.colunas.map((c, i) => celula(`${letra(i)}${r + 2}`, dados[i], c.formato ? ESTILO[c.formato] : 0)).join("")}</row>`);
  }
  const validacoes = aba.colunas
    .map((c, i) => (c.lista && refLista(c.lista) ? `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" errorTitle="Valor fora da lista" error="Escolha um valor da lista (aba Listas)." sqref="${letra(i)}2:${letra(i)}${total}"><formula1>${refLista(c.lista)}</formula1></dataValidation>` : ""))
    .filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${cab}${linhas.join("")}</sheetData>
${aba.colunas.length ? `<autoFilter ref="A1:${letra(aba.colunas.length - 1)}1"/>` : ""}
${validacoes.length ? `<dataValidations count="${validacoes.length}">${validacoes.join("")}</dataValidations>` : ""}
</worksheet>`;
}

function planilhaSimples(linhas: string[][], larguras: number[], estiloPrimeira = 0): string {
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => celula(`${letra(c)}${r + 1}`, v, r === 0 ? estiloPrimeira : 0)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

/** Gera o .xlsx: abas de dados, "Instruções" e "Listas" (oculta não: o usuário pode consultar). */
export function gerarXlsx(m: Modelo): Uint8Array {
  const listas = Object.entries(m.listas ?? {});
  const refLista = (nome: string) => {
    const i = listas.findIndex(([n]) => n === nome);
    return i < 0 || !listas[i][1].length ? undefined : `Listas!$${letra(i)}$2:$${letra(i)}$${listas[i][1].length + 1}`;
  };
  const folhas: { nome: string; xml: string }[] = m.abas.map((a) => ({ nome: a.nome, xml: planilha(a, refLista) }));
  if (m.instrucoes?.length) folhas.push({ nome: "Instruções", xml: planilhaSimples([["Como preencher"], ...m.instrucoes.map((t) => [t])], [140], 7) });
  if (listas.length) {
    const max = Math.max(...listas.map(([, v]) => v.length));
    const linhas = [listas.map(([n]) => n), ...Array.from({ length: max }, (_, r) => listas.map(([, v]) => v[r] ?? ""))];
    folhas.push({ nome: "Listas", xml: planilhaSimples(linhas, listas.map(() => 28), 1) });
  }
  const arquivos: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${folhas.map((f, i) => `<sheet name="${esc(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${m.abas[0]?.colunas.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(m.abas[0].nome)}'!$A$1:$${letra(m.abas[0].colunas.length - 1)}$1</definedName></definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...folhas.map((f, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, f.xml]),
  ];
  return zipSemCompressao(arquivos.map(([n, t]) => [n, new TextEncoder().encode(t)]));
}

// ---------------------------------------------------------------- ZIP

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipSemCompressao(arquivos: [string, Uint8Array][]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [nome, dados] of arquivos) {
    const n = new TextEncoder().encode(nome);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + dados.length;
  }
  const tamCentral = central.reduce((a, p) => a + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, offset, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(todas.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of todas) out.set(p, o), (o += p.length);
  return out;
}

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([dados as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lê as entradas de um ZIP (sem compressão ou deflate). */
export async function lerZip(buf: Uint8Array): Promise<Map<string, string>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo não é um .xlsx válido.");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Arquivo .xlsx corrompido.");
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!nome.endsWith(".xml") && !nome.endsWith(".rels")) continue;
    const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const bruto = buf.subarray(ini, ini + tam);
    const dados = metodo === 0 ? bruto : metodo === 8 ? await inflar(bruto) : undefined;
    if (dados) out.set(nome, new TextDecoder().decode(dados));
  }
  return out;
}

// ---------------------------------------------------------------- Leitura

const desc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const textos = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => desc(m[1] ?? "")).join("");

function colunaIndice(ref: string): number {
  const l = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function estilosDeData(styles?: string): Set<number> {
  const datas = new Set<number>();
  if (!styles) return datas;
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(+m[1], desc(m[2]));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].forEach((m, i) => {
    const id = +(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? 0);
    const fmt = custom.get(id)?.replace(/\[[^\]]*\]|"[^"]*"/g, "") ?? "";
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dy]/i.test(fmt) || (/m/i.test(fmt) && !/[h0#]/i.test(fmt))) datas.add(i);
  });
  return datas;
}

/** Converte número para texto sem notação científica nem ruído de ponto flutuante. */
function numeroTexto(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * Lê a primeira aba (ou a aba `nome`) de um .xlsx como matriz de textos.
 * Datas viram aaaa-mm-dd; números viram texto com ponto decimal.
 */
export async function lerXlsx(buf: ArrayBuffer | Uint8Array, nome?: string): Promise<string[][]> {
  const zip = await lerZip(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const wb = zip.get("xl/workbook.xml");
  const rels = zip.get("xl/_rels/workbook.xml.rels") ?? "";
  if (!wb) throw new Error("Arquivo não é uma planilha do Excel (.xlsx).");
  const folhas = [...wb.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)].map((m) => ({ nome: desc(m[1]), id: m[2] }));
  const folha = nome ? folhas.find((f) => f.nome.trim().toLowerCase() === nome.trim().toLowerCase()) : folhas[0];
  if (!folha) throw new Error(nome ? `Aba "${nome}" não encontrada no arquivo.` : "A planilha não tem abas.");
  const alvo = new RegExp(`<Relationship\\b[^>]*Id="${folha.id}"[^>]*Target="([^"]*)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]*)"[^>]*Id="${folha.id}"`).exec(rels)?.[1];
  const caminho = alvo ? (alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`) : "xl/worksheets/sheet1.xml";
  const xml = zip.get(caminho);
  if (!xml) throw new Error(`Aba "${folha.nome}" não encontrada no arquivo.`);
  const compartilhados = [...(zip.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const datas = estilosDeData(zip.get("xl/styles.xml"));
  const linhas: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const linha: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /t="([^"]*)"/.exec(attrs)?.[1];
      const s = +(/s="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const corpo = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let valor = "";
      if (t === "s") valor = compartilhados[+(v ?? -1)] ?? "";
      else if (t === "inlineStr") valor = textos(/<is>([\s\S]*?)<\/is>/.exec(corpo)?.[1] ?? "");
      else if (t === "str" || t === "e") valor = desc(v ?? "");
      else if (t === "b") valor = v === "1" ? "Sim" : "Não";
      else if (v !== undefined && v !== "") valor = datas.has(s) ? dataDeSerial(+v) : numeroTexto(+v);
      const i = ref ? colunaIndice(ref) : linha.length;
      while (linha.length < i) linha.push("");
      linha[i] = valor.trim();
    }
    if (linha.some((x) => x !== "")) linhas.push(linha);
  }
  return linhas;
}
