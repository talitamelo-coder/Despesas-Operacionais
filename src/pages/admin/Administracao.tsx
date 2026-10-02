import { useState } from "react";
import { Plus, RotateCcw, Save, Upload, X } from "lucide-react";
import { useApp } from "@/app/contexto";
import { AuditoriaLista } from "@/components/dominio/AuditoriaLista";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, InputNumero, Select, Toggle } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabela } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { ROTULO_PERFIL } from "@/domain/rules/permissoes";
import { CAMPOS_IMPORTACAO, chaveDuplicidade, parseCSV, processarImportacao, sugerirMapeamento, type Mapeamento, type RelatorioImportacao } from "@/domain/rules/importacao";
import { formatarCnpj } from "@/domain/formatacao";
import type { Configuracao, Empresa, Perfil, TipoContrato, Usuario } from "@/domain/types";
import { api, fonteDados } from "@/services";

const ABAS = [
  { id: "usuarios", rotulo: "Usuários e perfis" },
  { id: "empresas", rotulo: "Empresas" },
  { id: "tipos", rotulo: "Tipos de contrato" },
  { id: "listas", rotulo: "Listas e parâmetros" },
  { id: "alertas", rotulo: "Regras de alertas" },
  { id: "importacao", rotulo: "Importação da planilha" },
  { id: "auditoria", rotulo: "Auditoria" },
] as const;
type AbaAdmin = (typeof ABAS)[number]["id"];

export function Administracao() {
  const { pode } = useApp();
  const [aba, setAba] = useState<AbaAdmin>("usuarios");
  if (!pode("administrar")) return <Aviso tom="alerta" titulo="Acesso restrito">A Administração é exclusiva do perfil Administrador.</Aviso>;
  return (
    <>
      <PageHeader titulo="Administração" descricao="Cadastros de apoio, parâmetros, regras de alertas e importação da planilha legada." acoes={fonteDados === "mock" ? <RestaurarDemo /> : undefined} />
      <Tabs className="mb-4" abas={[...ABAS]} ativa={aba} onChange={setAba} />
      {aba === "usuarios" && <Usuarios />}
      {aba === "empresas" && <Empresas />}
      {aba === "tipos" && <Tipos />}
      {aba === "listas" && <Listas />}
      {aba === "alertas" && <RegrasAlertas />}
      {aba === "importacao" && <Importacao />}
      {aba === "auditoria" && (
        <Card>
          <CardHeader titulo="Trilha de auditoria" subtitulo="Últimos 500 registros — histórico nunca é apagado" />
          <AuditoriaLista />
        </Card>
      )}
    </>
  );
}

function RestaurarDemo() {
  const { executar } = useApp();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variante="secundario" icone={<RotateCcw size={16} />} onClick={() => setAberto(true)}>Restaurar dados de demonstração</Button>
      <Modal
        aberto={aberto}
        titulo="Restaurar dados de demonstração"
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button variante="perigo" onClick={async () => (await executar(() => api.restaurarDadosDemonstracao(), "Dados de demonstração restaurados."), setAberto(false))}>Restaurar</Button>
          </>
        }
      >
        <p className="text-sm">Todas as alterações feitas neste navegador serão descartadas e os cenários de demonstração serão recriados.</p>
      </Modal>
    </>
  );
}

const PERFIS: Perfil[] = ["Administrador", "Suprimentos", "Gestor", "Juridico"];

function Usuarios() {
  const { cad, usuario, executar } = useApp();
  const [edit, setEdit] = useState<Usuario>();
  return (
    <Card>
      <CardHeader titulo="Usuários" subtitulo="Saving e baseline só podem ser alterados por Suprimentos ou Administrador" acoes={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setEdit({ id: "", nome: "", email: "", perfil: "Gestor", ativo: true })}>Novo usuário</Button>} />
      <Tabela<Usuario>
        linhas={cad.usuarios}
        chave={(u) => u.id}
        onLinha={setEdit}
        colunas={[
          { id: "n", titulo: "Nome", render: (u) => u.nome },
          { id: "e", titulo: "E-mail", render: (u) => <span className="text-texto-suave">{u.email}</span> },
          { id: "c", titulo: "Cargo", render: (u) => u.cargo ?? "—" },
          { id: "p", titulo: "Perfil", render: (u) => <Badge tom="primario">{ROTULO_PERFIL[u.perfil]}</Badge> },
          { id: "d", titulo: "Diretor", render: (u) => (u.diretor ? "Sim" : "—") },
          { id: "a", titulo: "Situação", render: (u) => <Badge tom={u.ativo ? "sucesso" : "neutro"}>{u.ativo ? "Ativo" : "Inativo"}</Badge> },
        ]}
      />
      <Modal
        aberto={Boolean(edit)}
        titulo={edit?.id ? "Editar usuário" : "Novo usuário"}
        onFechar={() => setEdit(undefined)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button disabled={!edit?.nome || !edit?.email} onClick={async () => (await executar(() => api.salvarUsuario(edit!, usuario.id), "Usuário salvo.")) && setEdit(undefined)}>Salvar</Button>
          </>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-4">
            <Input rotulo="Nome" obrigatorio className="col-span-2" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
            <Input rotulo="E-mail" obrigatorio className="col-span-2" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <Input rotulo="Cargo" value={edit.cargo ?? ""} onChange={(e) => setEdit({ ...edit, cargo: e.target.value })} />
            <Select rotulo="Perfil" vazio={false} value={edit.perfil} onChange={(e) => setEdit({ ...edit, perfil: e.target.value as Perfil })} opcoes={PERFIS.map((p) => ({ valor: p, rotulo: ROTULO_PERFIL[p] }))} />
            <Toggle rotulo="Diretor (ciência/aprovação em exceção)" checked={Boolean(edit.diretor)} onChange={(v) => setEdit({ ...edit, diretor: v })} />
            <Toggle rotulo="Ativo" checked={edit.ativo} onChange={(v) => setEdit({ ...edit, ativo: v })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Empresas() {
  const { cad, usuario, executar } = useApp();
  const [edit, setEdit] = useState<Empresa>();
  return (
    <Card>
      <CardHeader titulo="Empresas do grupo" acoes={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setEdit({ id: "", nome: "", cnpj: "", ativo: true })}>Nova empresa</Button>} />
      <Tabela<Empresa>
        linhas={cad.empresas}
        chave={(e) => e.id}
        onLinha={setEdit}
        colunas={[
          { id: "n", titulo: "Nome", render: (e) => e.nome },
          { id: "c", titulo: "CNPJ", render: (e) => <span className="tabular">{formatarCnpj(e.cnpj)}</span> },
          { id: "a", titulo: "Situação", render: (e) => <Badge tom={e.ativo ? "sucesso" : "neutro"}>{e.ativo ? "Ativa" : "Inativa"}</Badge> },
        ]}
      />
      <Modal
        aberto={Boolean(edit)}
        titulo={edit?.id ? "Editar empresa" : "Nova empresa"}
        onFechar={() => setEdit(undefined)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button disabled={!edit?.nome} onClick={async () => (await executar(() => api.salvarEmpresa(edit!, usuario.id), "Empresa salva.")) && setEdit(undefined)}>Salvar</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Input rotulo="Nome" obrigatorio value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
            <Input rotulo="CNPJ" value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} />
            <Toggle rotulo="Ativa" checked={edit.ativo} onChange={(v) => setEdit({ ...edit, ativo: v })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Tipos() {
  const { cad, usuario, executar } = useApp();
  const [novo, setNovo] = useState("");
  return (
    <Card>
      <CardHeader titulo="Tipos de contrato" />
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo tipo de contrato" className="h-9 w-72 rounded-md border border-borda-forte px-3 text-sm" />
          <Button disabled={!novo.trim()} onClick={async () => (await executar(() => api.salvarTipoContrato({ id: "", nome: novo.trim(), ativo: true }, usuario.id), "Tipo criado.")) && setNovo("")}>Adicionar</Button>
        </div>
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {cad.tipos.map((t: TipoContrato) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className={t.ativo ? "" : "text-texto-fraco line-through"}>{t.nome}</span>
              <Toggle rotulo={t.ativo ? "Ativo" : "Inativo"} checked={t.ativo} onChange={(v) => executar(() => api.salvarTipoContrato({ ...t, ativo: v }, usuario.id))} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function ListaEditavel({ titulo, itens, onChange }: { titulo: string; itens: string[]; onChange: (l: string[]) => void }) {
  const [novo, setNovo] = useState("");
  return (
    <Card>
      <CardHeader titulo={titulo} />
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {itens.map((i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-borda bg-fundo py-0.5 pr-1 pl-2.5 text-xs">
              {i}
              <button onClick={() => onChange(itens.filter((x) => x !== i))} className="rounded-full p-0.5 hover:bg-critico-50 hover:text-critico-600" aria-label={`Remover ${i}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (novo.trim() && !itens.includes(novo.trim())) onChange([...itens, novo.trim()]);
            setNovo("");
          }}
        >
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item" className="h-8 flex-1 rounded-md border border-borda-forte px-2 text-xs" />
          <Button tamanho="sm" variante="secundario" type="submit">Adicionar</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function useConfigEditavel() {
  const { cad, usuario, executar } = useApp();
  const [cfg, setCfg] = useState<Configuracao>(() => structuredClone(cad.config));
  const sujo = JSON.stringify(cfg) !== JSON.stringify(cad.config);
  const salvar = () => executar(() => api.salvarConfiguracao(cfg, usuario.id), "Configuração salva.");
  return { cfg, setCfg, sujo, salvar };
}

function Listas() {
  const { cfg, setCfg, sujo, salvar } = useConfigEditavel();
  const lista = <K extends keyof Configuracao>(k: K) => ({ itens: cfg[k] as unknown as string[], onChange: (l: string[]) => setCfg({ ...cfg, [k]: l }) });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button icone={<Save size={16} />} disabled={!sujo} onClick={salvar}>Salvar alterações</Button></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaEditavel titulo="Moedas (código ISO)" {...lista("moedas")} />
        <ListaEditavel titulo="Periodicidades" {...lista("periodicidades")} />
        <ListaEditavel titulo="Fontes de cotação" {...lista("fontesCotacao")} />
        <ListaEditavel titulo="Índices de reajuste" {...lista("indicesReajuste")} />
        <ListaEditavel titulo="Tipos (origens) de saving" {...lista("origensSaving")} />
        <ListaEditavel titulo="Origens da oportunidade" {...lista("origensOportunidade")} />
        {Object.entries(cfg.listasAuxiliares).map(([nome, itens]) => (
          <ListaEditavel key={nome} titulo={nome} itens={itens} onChange={(l) => setCfg({ ...cfg, listasAuxiliares: { ...cfg.listasAuxiliares, [nome]: l } })} />
        ))}
      </div>
    </div>
  );
}

function RegrasAlertas() {
  const { cfg, setCfg, sujo, salvar } = useConfigEditavel();
  const r = cfg.regrasAlerta;
  const set = (p: Partial<typeof r>) => setCfg({ ...cfg, regrasAlerta: { ...r, ...p } });
  return (
    <Card>
      <CardHeader titulo="Regras de alertas e prazos" acoes={<Button icone={<Save size={16} />} disabled={!sujo} onClick={salvar}>Salvar</Button>} />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InputNumero rotulo="Prazo padrão do gestor (dias)" valor={r.prazoGestorPadraoDias} onValor={(v) => set({ prazoGestorPadraoDias: v ?? 30 })} ajuda="Aplicado a novos contratos; cada contrato pode ter o seu" />
          <InputNumero rotulo="Antecedência — renovação automática em risco (dias)" valor={r.diasRiscoRenovacaoAutomatica} onValor={(v) => set({ diasRiscoRenovacaoAutomatica: v ?? 30 })} ajuda="Dias antes da data limite de manifestação" />
          <Input rotulo="Lembretes antes da data limite (dias)" value={r.lembretesDias.join(", ")} onChange={(e) => set({ lembretesDias: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) })} ajuda="Eventos suportados: 60 e 30" />
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle rotulo="Enviar por e-mail" ajuda="Canal principal no MVP" checked={r.canalEmail} onChange={(v) => set({ canalEmail: v })} />
          <Toggle rotulo="Exibir no sistema" checked={r.canalSistema} onChange={(v) => set({ canalSistema: v })} />
        </div>
        <Aviso tom="info">
          Data limite = data fim − aviso prévio. Abertura da avaliação = data limite − prazo do gestor. Ex.: aviso 90 + gestor 30 = avaliação inicia 120 dias antes do fim.
          Lembretes de decisão param quando o gestor responde; o alerta crítico de renovação automática segue para Suprimentos até a resolução formal.
        </Aviso>
      </CardBody>
    </Card>
  );
}

function Importacao() {
  const { usuario, executar } = useApp();
  const [arquivo, setArquivo] = useState<string>();
  const [csv, setCsv] = useState<{ cabecalhos: string[]; linhas: string[][] }>();
  const [map, setMap] = useState<Mapeamento>({});
  const [rel, setRel] = useState<RelatorioImportacao>();
  const [importados, setImportados] = useState<string[]>();

  async function ler(f: File) {
    const texto = await f.text();
    const r = parseCSV(texto);
    setArquivo(f.name);
    setCsv(r);
    setMap(sugerirMapeamento(r.cabecalhos));
    setRel(undefined);
    setImportados(undefined);
  }

  async function validar() {
    if (!csv) return;
    const contratos = await api.listarContratos();
    const fornecedores = await api.listarFornecedores();
    const cnpj = new Map(fornecedores.map((f) => [f.fornecedor_id, f.cnpj ?? ""]));
    setRel(
      processarImportacao(csv.cabecalhos, csv.linhas, map, {
        codigos: contratos.flatMap((c) => [c.codigo, c.external_id ?? ""]).filter(Boolean),
        chaves: contratos.map((c) => chaveDuplicidade(cnpj.get(c.fornecedorId) ?? "", c.objeto, c.vigencia.dataFim)),
      }),
    );
  }

  const modelo = () => {
    const cab = CAMPOS_IMPORTACAO.map((c) => c.rotulo).join(";");
    const ex = "CT-123;Fornecedor Exemplo Ltda;11.222.333/0001-81;Exemplo Holding S.A.;Serviço de exemplo;Carlos Mendes;Rafael Costa;120000,00;BRL;01/01/2026;31/12/2026;90;Sim;Serviços de TI;CC-1000;";
    const blob = new Blob(["﻿" + cab + "\n" + ex], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-importacao-contratos.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader titulo="1. Arquivo" subtitulo="Exporte a planilha atual como CSV (separador ; ou ,)" acoes={<Button variante="fantasma" tamanho="sm" onClick={modelo}>Baixar modelo</Button>} />
        <CardBody>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-borda-forte p-4 hover:bg-fundo">
            <Upload size={18} className="text-primaria-700" />
            <span className="text-sm">{arquivo ? `${arquivo} — ${csv?.linhas.length ?? 0} linhas` : "Selecionar arquivo CSV"}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
          </label>
        </CardBody>
      </Card>

      {csv && (
        <Card>
          <CardHeader titulo="2. Mapeamento de colunas" subtitulo="Sugerido automaticamente pelo nome das colunas — ajuste se necessário" acoes={<Button onClick={validar}>Validar dados</Button>} />
          <CardBody>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CAMPOS_IMPORTACAO.map((c) => (
                <Select key={c.campo} rotulo={c.rotulo} obrigatorio={c.obrigatorio} vazio="— Não importar —" value={map[c.campo] ?? ""} onChange={(e) => setMap({ ...map, [c.campo]: e.target.value || undefined })} opcoes={csv.cabecalhos.map((h) => ({ valor: h, rotulo: h }))} />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {rel && (
        <Card>
          <CardHeader
            titulo="3. Relatório de importação"
            subtitulo={`${rel.total} linhas analisadas`}
            acoes={
              <Button disabled={!rel.importados.length || Boolean(importados)} onClick={async () => { const r = await executar(() => api.importarContratos(rel.importados, usuario.id), "Importação concluída."); if (r) setImportados(r.codigos); }}>
                Importar {rel.importados.length} registro(s)
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Prontos para importar", rel.importados.length, "sucesso"],
                ["Inconsistências", rel.inconsistencias.length, "critico"],
                ["Registros incompletos", rel.incompletos.length, "alerta"],
                ["Duplicidades", rel.duplicidades.length, "neutro"],
              ].map(([r, q, t]) => (
                <div key={r as string} className="rounded-md border border-borda p-3">
                  <Badge tom={t as "sucesso"}>{r}</Badge>
                  <p className="mt-2 text-2xl font-semibold tabular">{q}</p>
                </div>
              ))}
            </div>
            {importados && <Aviso tom="sucesso" titulo={`${importados.length} contrato(s) criados`}>{importados.slice(0, 20).join(", ")}{importados.length > 20 ? "…" : ""}</Aviso>}
            {rel.inconsistencias.length > 0 && <ListaRelatorio titulo="Inconsistências" itens={rel.inconsistencias.map((i) => [i.linha, i.erros.join("; ")])} />}
            {rel.incompletos.length > 0 && <ListaRelatorio titulo="Registros incompletos" itens={rel.incompletos.map((i) => [i.linha, `Faltando: ${i.faltando.join(", ")}`])} />}
            {rel.duplicidades.length > 0 && <ListaRelatorio titulo="Duplicidades" itens={rel.duplicidades.map((i) => [i.linha, i.motivo])} />}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ListaRelatorio({ titulo, itens }: { titulo: string; itens: [number, string][] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-texto-suave uppercase">{titulo}</p>
      <ul className="max-h-60 divide-y divide-borda overflow-y-auto rounded-md border border-borda text-sm">
        {itens.map(([l, m]) => (
          <li key={l} className="flex gap-3 px-3 py-1.5">
            <span className="w-16 shrink-0 text-texto-suave tabular">Linha {l}</span>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
