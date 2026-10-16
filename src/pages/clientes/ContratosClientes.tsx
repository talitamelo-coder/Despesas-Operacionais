import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { useApp } from "@/app/contexto";
import { temPerfil } from "@/domain/rules/permissoes";
import { nomeDeExibicao } from "@/domain/rules/usuario";
import { ClienteForm } from "@/components/dominio/ClienteForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, InputNumero, Select, Textarea, Toggle } from "@/components/ui/Campos";
import { Aviso, Carregando } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/status";
import { Tabela } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { formatarData, hoje } from "@/domain/datas";
import { formatarCnpj, formatarMoeda } from "@/domain/formatacao";
import { validarCliente, novoCliente } from "@/domain/rules/clientes";
import { prazosDoContrato } from "@/domain/rules/prazos";
import { errosContratoReceita, receitaMensalNaData } from "@/domain/rules/receita";
import { receitaMensalBRL } from "@/domain/rules/painelClientes";
import { ImportacaoCsv } from "@/pages/licencas/Importacao";
import { PainelClientes } from "./PainelClientes";
import type { Cliente, Contrato, Moeda, TipoReceita } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api, type NovoContratoCliente } from "@/services";

const ABAS = [
  { id: "painel", rotulo: "Painel" },
  { id: "contratos", rotulo: "Contratos" },
  { id: "clientes", rotulo: "Clientes" },
  { id: "importar", rotulo: "Importar" },
] as const;

/**
 * Contratos de clientes (receita): registro, valores contratados e saldo a faturar.
 * Faturamento e medição ficam no Contas a receber; mudanças de valor/prazo, por aditivo.
 */
export function ContratosClientes() {
  const [params, setParams] = useSearchParams();
  const { pode } = useApp();
  const abas = ABAS.filter((a) => a.id !== "importar" || pode("editar_processo"));
  const pedida = params.get("aba") ?? (params.get("novo") ? "contratos" : "painel");
  const aba = abas.some((a) => a.id === pedida) ? pedida : "painel";
  return (
    <>
      <PageHeader titulo="Contratos de clientes" descricao="Registro do contratado, valores e saldo a faturar. O faturamento é feito no Contas a receber, respeitando o que está registrado aqui." />
      <Tabs className="mb-4" abas={[...abas]} ativa={aba} onChange={(a) => setParams({ aba: a })} />
      {aba === "painel" && <PainelClientes />}
      {aba === "contratos" && <Contratos />}
      {aba === "clientes" && <Clientes />}
      {aba === "importar" && <ImportacaoCsv tipos={["contratosClientes"]} />}
    </>
  );
}

function Contratos() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const { cad, pode, nomeUsuario, cliente } = useApp();
  const { dados: todos, carregando } = useConsulta(() => api.listarContratos(), []);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("Vigente");
  const h = hoje();
  const contratos = useMemo(() => (todos ?? []).filter((c) => c.natureza === "Receita"), [todos]);
  const novo = params.get("novo") === "1";
  const anterior = params.get("anterior") ?? undefined;
  if (carregando && !todos) return <Carregando />;

  const b = busca.trim().toLowerCase();
  const linhas = contratos
    .filter((c) => (!status || c.status === status) && (!b || `${c.codigo} ${c.objeto} ${cliente(c.clienteId)?.razaoSocial ?? ""} ${cliente(c.clienteId)?.nomeFantasia ?? ""}`.toLowerCase().includes(b)))
    .sort((x, y) => receitaMensalBRL(y, h) - receitaMensalBRL(x, h));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          titulo="Contratos"
          subtitulo="Receita mensal = fixo vigente (com valores previstos) + variável estimado"
          acoes={pode("editar_processo") && <Button icone={<Plus size={16} />} onClick={() => setParams({ novo: "1" })} disabled={!cad.clientes.length}>Novo contrato de cliente</Button>}
        />
        {!cad.clientes.length && <CardBody><Aviso tom="info">Cadastre o cliente primeiro, na aba Clientes.</Aviso></CardBody>}
        <CardBody className="grid grid-cols-1 gap-3 border-b border-borda md:grid-cols-3">
          <Input rotulo="Buscar" placeholder="Código, cliente ou objeto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Select rotulo="Situação" value={status} vazio="Todas" onChange={(e) => setStatus(e.target.value)} opcoes={["Vigente", "Suspenso", "Encerrado", "Cancelado", "Rescindido"].map((s) => ({ valor: s, rotulo: s }))} />
        </CardBody>
        <Tabela
          linhas={linhas}
          chave={(c) => c.contrato_id}
          onLinha={(c) => navegar(`/contratos/${c.contrato_id}`)}
          vazio="Nenhum contrato de cliente."
          minLargura="min-w-[1000px]"
          colunas={[
            { id: "cod", titulo: "Contrato", render: (c) => <span className="font-semibold text-primaria-800">{c.codigo}</span> },
            { id: "cli", titulo: "Cliente", render: (c) => cliente(c.clienteId)?.nomeFantasia || cliente(c.clienteId)?.razaoSocial || "—" },
            { id: "obj", titulo: "Objeto", render: (c) => <span className="line-clamp-2">{c.objeto}</span> },
            { id: "tipo", titulo: "Receita", render: (c) => (c.receita?.contratoPrincipalId ? <Badge>No contrato principal</Badge> : c.receita?.tipoReceita) },
            { id: "mes", titulo: "Receita mensal", alinhamento: "direita", render: (c) => (c.receita ? formatarMoeda(receitaMensalNaData(c.receita, h), c.condicoes.moeda) : "—") },
            { id: "fim", titulo: "Fim / fase", render: (c) => { const p = prazosDoContrato(c); return <span>{c.vigencia.tipoVigencia === "Prazo indeterminado" ? "Indeterminado" : formatarData(c.vigencia.dataFim)}<span className="block text-xs text-texto-suave">{p.fase}</span></span>; } },
            { id: "resp", titulo: "Gestor", render: (c) => nomeUsuario(c.gestorId) },
            { id: "st", titulo: "Situação", render: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Card>
      {novo && <NovoContratoModal contratos={contratos} anteriorId={anterior} onFechar={(id) => (setParams({}), id && navegar(`/contratos/${id}`))} />}
    </div>
  );
}

function NovoContratoModal({ contratos, anteriorId, onFechar }: { contratos: Contrato[]; anteriorId?: string; onFechar: (id?: string) => void }) {
  const { cad, usuario, executar } = useApp();
  const ant = contratos.find((c) => c.contrato_id === anteriorId);
  const [d, setD] = useState<NovoContratoCliente>(() => ({
    empresaId: ant?.empresaId ?? cad.empresas[0]?.id ?? "",
    clienteId: ant?.clienteId ?? "",
    objeto: ant?.objeto ?? "",
    gestorId: ant?.gestorId ?? "",
    tipoContratoId: ant?.tipoContratoId,
    moeda: ant?.condicoes.moeda ?? "BRL",
    vigencia: { dataInicio: hoje(), dataFim: "", tipoVigencia: "Prazo determinado", avisoPrevioDias: ant?.vigencia.avisoPrevioDias ?? 60, renovacaoAutomatica: false, prazoGestorDias: 30 },
    receita: ant?.receita ? { ...ant.receita, escalonamento: undefined } : { tipoReceita: "Fixa" },
    contratosAnterioresIds: ant ? [ant.contrato_id] : [],
    relacaoAnterior: "Renovação",
  }));
  const [tentou, setTentou] = useState(false);
  const set = (p: Partial<NovoContratoCliente>) => setD({ ...d, ...p });
  const rec = (p: Partial<NovoContratoCliente["receita"]>) => setD({ ...d, receita: { ...d.receita, ...p } });
  const vig = (p: Partial<NovoContratoCliente["vigencia"]>) => setD({ ...d, vigencia: { ...d.vigencia, ...p } });
  const erros = errosContratoReceita({ ...d, natureza: "Receita" } as unknown as Contrato);
  const r = d.receita;
  const anteriores = contratos.filter((c) => !c.sucessor_id);
  // Gestor do contrato: quem responde a avaliação de renovação e recebe os alertas (precisa do perfil Gestor).
  const usuarios = cad.usuarios.filter((u) => u.ativo && temPerfil(u, "Gestor")).map((u) => ({ valor: u.id, rotulo: nomeDeExibicao(u) }));
  const salvar = async () => {
    setTentou(true);
    if (erros.length) return;
    const c = await executar(() => api.registrarContratoCliente(d, usuario.id), "Contrato de cliente registrado.");
    if (c) onFechar(c.contrato_id);
  };
  return (
    <Modal aberto titulo={ant ? `Novo contrato a partir de ${ant.codigo}` : "Novo contrato de cliente"} largura="xl" onFechar={() => onFechar()} rodape={<><Button variante="secundario" onClick={() => onFechar()}>Cancelar</Button><Button onClick={salvar}>Registrar contrato</Button></>}>
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select rotulo="Cliente" obrigatorio value={d.clienteId} onChange={(e) => set({ clienteId: e.target.value })} opcoes={cad.clientes.filter((c) => c.statusCadastral === "Ativo").map((c) => ({ valor: c.cliente_id, rotulo: c.razaoSocial }))} />
          <Select rotulo="Empresa do grupo" obrigatorio vazio={false} value={d.empresaId} onChange={(e) => set({ empresaId: e.target.value })} opcoes={cad.empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
          <Select rotulo="Gestor do contrato" obrigatorio ajuda={usuarios.length ? "Responde a avaliação de renovação e recebe os alertas." : "Nenhum usuário com perfil Gestor: cadastre em Administração → Usuários."} value={d.gestorId} onChange={(e) => set({ gestorId: e.target.value })} opcoes={usuarios} />
          <Input className="md:col-span-2" rotulo="Objeto" obrigatorio value={d.objeto} onChange={(e) => set({ objeto: e.target.value })} />
          <Select rotulo="Tipo de contrato" value={d.tipoContratoId ?? ""} onChange={(e) => set({ tipoContratoId: e.target.value || undefined })} opcoes={cad.tipos.filter((t) => t.ativo).map((t) => ({ valor: t.id, rotulo: t.nome }))} />
        </section>
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Vigência</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Select rotulo="Tipo" vazio={false} value={d.vigencia.tipoVigencia} onChange={(e) => vig({ tipoVigencia: e.target.value as NovoContratoCliente["vigencia"]["tipoVigencia"], ...(e.target.value === "Prazo indeterminado" ? { dataFim: "" } : {}) })} opcoes={["Prazo determinado", "Prazo indeterminado"].map((v) => ({ valor: v, rotulo: v }))} />
            <Input rotulo="Início" type="date" obrigatorio value={d.vigencia.dataInicio} onChange={(e) => vig({ dataInicio: e.target.value })} />
            {d.vigencia.tipoVigencia === "Prazo determinado" ? <Input rotulo="Fim" type="date" obrigatorio value={d.vigencia.dataFim} onChange={(e) => vig({ dataFim: e.target.value })} /> : <p className="self-end pb-2 text-xs text-texto-suave">Revisão anual automática.</p>}
            <InputNumero rotulo="Aviso prévio (dias)" valor={d.vigencia.avisoPrevioDias} onValor={(v) => vig({ avisoPrevioDias: v ?? 0 })} />
            <div className="flex items-end pb-1"><Toggle rotulo="Renovação automática" checked={d.vigencia.renovacaoAutomatica} onChange={(v) => vig({ renovacaoAutomatica: v })} /></div>
          </div>
        </section>
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Valores contratados</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Select rotulo="Tipo de receita" vazio={false} value={r.tipoReceita} onChange={(e) => rec({ tipoReceita: e.target.value as TipoReceita })} opcoes={(["Fixa", "Variável", "Fixa + variável"] as const).map((v) => ({ valor: v, rotulo: v }))} />
            <Select rotulo="Moeda" vazio={false} value={d.moeda} onChange={(e) => set({ moeda: e.target.value as Moeda })} opcoes={cad.config.moedas.map((m) => ({ valor: m, rotulo: m }))} />
            {r.tipoReceita !== "Variável" && <InputNumero rotulo={`Fixo mensal (${d.moeda})`} obrigatorio valor={r.valorMensalFixo} onValor={(v) => rec({ valorMensalFixo: v })} />}
            {r.tipoReceita !== "Fixa" && <InputNumero rotulo={`Variável estimado / mês (${d.moeda})`} ajuda="Estimativa; o apurado vem do Contas a receber." valor={r.valorMensalVariavelEstimado} onValor={(v) => rec({ valorMensalVariavelEstimado: v })} />}
            <InputNumero rotulo={`Valor total do contrato (${d.moeda})`} ajuda="Opcional. Sem ele, o saldo é o fixo × meses." valor={r.valorTotalContratado} onValor={(v) => rec({ valorTotalContratado: v })} />
            <Select rotulo="Receita apurada em outro contrato" vazio="Não (este contrato fatura)" value={r.contratoPrincipalId ?? ""} onChange={(e) => rec({ contratoPrincipalId: e.target.value || undefined })} opcoes={contratos.filter((c) => c.status === "Vigente" && !c.receita?.contratoPrincipalId).map((c) => ({ valor: c.contrato_id, rotulo: `${c.codigo} · ${c.objeto.slice(0, 40)}` }))} />
          </div>
          {r.tipoReceita !== "Variável" && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-texto-suave">Valores já previstos no contrato (ex.: “a partir de 11/2026, R$ X/mês”). Mudanças futuras não previstas entram por aditivo.</p>
              {(r.escalonamento ?? []).map((e, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                  <Input rotulo="A partir de" type="date" value={e.aPartirDe} onChange={(x) => rec({ escalonamento: r.escalonamento!.map((y, j) => (j === i ? { ...y, aPartirDe: x.target.value } : y)) })} />
                  <InputNumero rotulo={`Fixo mensal (${d.moeda})`} valor={e.valorMensalFixo} onValor={(v) => rec({ escalonamento: r.escalonamento!.map((y, j) => (j === i ? { ...y, valorMensalFixo: v ?? 0 } : y)) })} />
                  <Button variante="fantasma" tamanho="sm" onClick={() => rec({ escalonamento: r.escalonamento!.filter((_, j) => j !== i) })}>Remover</Button>
                </div>
              ))}
              <Button variante="secundario" tamanho="sm" onClick={() => rec({ escalonamento: [...(r.escalonamento ?? []), { aPartirDe: "", valorMensalFixo: r.valorMensalFixo ?? 0 }] })}>Adicionar valor previsto</Button>
            </div>
          )}
        </section>
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Renova ou substitui</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select rotulo="Relação" vazio={false} value={d.relacaoAnterior ?? "Renovação"} onChange={(e) => set({ relacaoAnterior: e.target.value as "Renovação" | "Substituição" })} opcoes={[{ valor: "Renovação", rotulo: "Renovação" }, { valor: "Substituição", rotulo: "Substituição" }]} />
            <div className="md:col-span-2">
              <p className="mb-1 text-xs text-texto-suave">Contratos anteriores (pode marcar mais de um)</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                {anteriores.map((c) => {
                  const marcado = d.contratosAnterioresIds?.includes(c.contrato_id);
                  return (
                    <button key={c.contrato_id} type="button" onClick={() => set({ contratosAnterioresIds: marcado ? d.contratosAnterioresIds!.filter((x) => x !== c.contrato_id) : [...(d.contratosAnterioresIds ?? []), c.contrato_id] })} className={`rounded-full border px-2.5 py-1 text-xs ${marcado ? "border-primaria-800 bg-primaria-800 text-white" : "border-borda-forte hover:bg-fundo"}`}>
                      {c.codigo}
                    </button>
                  );
                })}
                {!anteriores.length && <span className="text-xs text-texto-fraco">Nenhum.</span>}
              </div>
            </div>
          </div>
          <p className="mt-1 text-xs text-texto-fraco">Os contratos anteriores não são alterados: só recebem o vínculo com este.</p>
        </section>
        <Textarea rotulo="Observações" value={d.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value || undefined })} />
        {tentou && erros.length > 0 && <Aviso tom="critico" titulo="Não foi possível registrar">{erros.join(" ")}</Aviso>}
      </div>
    </Modal>
  );
}

function Clientes() {
  const { cad, pode, usuario, executar } = useApp();
  const [edit, setEdit] = useState<Cliente>();
  const [tentou, setTentou] = useState(false);
  const [busca, setBusca] = useState("");
  const erros = edit ? validarCliente(edit, cad.clientes) : {};
  const b = busca.trim().toLowerCase();
  const lista = cad.clientes.filter((c) => !b || `${c.razaoSocial} ${c.nomeFantasia} ${c.cnpj ?? ""}`.toLowerCase().includes(b));
  const salvar = async () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    if (await executar(() => api.salvarCliente(edit!, usuario.id), "Cliente salvo.")) setEdit(undefined);
  };
  return (
    <Card>
      <CardHeader titulo="Clientes" subtitulo="Cadastro separado do de fornecedores" acoes={pode("editar_processo") && <Button icone={<Users size={16} />} onClick={() => (setTentou(false), setEdit(novoCliente()))}>Novo cliente</Button>} />
      <CardBody className="border-b border-borda">
        <Input rotulo="Buscar" placeholder="Nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
      </CardBody>
      <Tabela
        linhas={lista}
        chave={(c) => c.cliente_id}
        onLinha={(c) => pode("editar_processo") && (setTentou(false), setEdit(structuredClone(c)))}
        vazio="Nenhum cliente cadastrado."
        colunas={[
          { id: "r", titulo: "Razão social", render: (c) => <span>{c.razaoSocial}{c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && <span className="block text-xs text-texto-suave">{c.nomeFantasia}</span>}</span> },
          { id: "d", titulo: "CNPJ", render: (c) => <span className="tabular">{c.estrangeiro ? `Exterior · ${c.pais}` : formatarCnpj(c.cnpj)}</span> },
          { id: "cr", titulo: "Código no Contas a receber", render: (c) => c.codigoCliente ?? "—" },
          { id: "ct", titulo: "Contato", render: (c) => <span className="text-xs">{c.contato ?? "—"}<span className="block text-texto-suave">{c.email ?? ""}</span></span> },
          { id: "s", titulo: "Situação", render: (c) => <Badge tom={c.statusCadastral === "Ativo" ? "sucesso" : "neutro"}>{c.statusCadastral}</Badge> },
        ]}
      />
      <Modal aberto={Boolean(edit)} titulo={edit?.cliente_id ? "Editar cliente" : "Novo cliente"} largura="lg" onFechar={() => setEdit(undefined)} rodape={<><Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></>}>
        {edit && <ClienteForm c={edit} onChange={setEdit} erros={tentou ? erros : {}} />}
      </Modal>
    </Card>
  );
}
