import { useEffect, useMemo, useState } from "react";
import { useApp, useOpcoes } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Input, InputNumero, Select, Textarea, Toggle } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { AREAS_PADRAO } from "@/domain/rules/usuario";
import { normalizarBusca } from "@/domain/formatacao";
import type { CategoriaLicenca, Colaborador, Contrato, FonteCotacao, Moeda, ProdutoLicenca, SituacaoProdutoLicenca, TipoColaborador } from "@/domain/types";
import { api } from "@/services";

const opcoes = (l: string[]) => l.map((v) => ({ valor: v, rotulo: v }));

export function novoProduto(): ProdutoLicenca {
  return { id: "", nome: "", fornecedorNome: "", categoria: "Software", quantidadeContratada: 1, valorUnitario: 0, moeda: "BRL", periodicidade: "Mensal", situacao: "Ativo", criadoEm: "", atualizadoEm: "" };
}

export function ProdutoLicencaModal({ produto, contratos, onFechar }: { produto?: ProdutoLicenca; contratos: Contrato[]; onFechar: () => void }) {
  const { usuario, executar, fornecedor } = useApp();
  const op = useOpcoes();
  const [p, setP] = useState<ProdutoLicenca>();
  const [revisado, setRevisado] = useState(false);
  useEffect(() => {
    setP(produto ? structuredClone(produto) : undefined);
    setRevisado(false);
  }, [produto]);
  const vigentes = useMemo(
    () =>
      contratos
        .filter((c) => c.status === "Vigente" || c.contrato_id === produto?.contrato_id)
        .map((c) => ({ valor: c.contrato_id, rotulo: `${c.codigo} · ${fornecedor(c.fornecedorId)?.nomeFantasia ?? ""} · ${c.objeto.slice(0, 50)}` }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
    [contratos, produto, fornecedor],
  );
  if (!p) return null;
  const set = (x: Partial<ProdutoLicenca>) => setP({ ...p, ...x });
  const salvar = async () => {
    const dados = revisado ? { ...p, confirmacoesPendentes: [] } : p;
    if (await executar(() => api.salvarProdutoLicenca(dados, usuario.id), "Produto salvo.")) onFechar();
  };
  return (
    <Modal
      aberto
      largura="xl"
      titulo={p.id ? `Editar ${p.nome}` : "Novo produto licenciado"}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!p.nome.trim()} onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-5">
        {!!p.confirmacoesPendentes?.length && (
          <Aviso tom="alerta" titulo="Pontos a confirmar (importação)">
            <ul className="list-disc pl-4">{p.confirmacoesPendentes.map((x) => <li key={x}>{x}</li>)}</ul>
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} /> Revisei e confirmei estes pontos
            </label>
          </Aviso>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input rotulo="Produto / plano" obrigatorio className="md:col-span-2" placeholder="Ex.: Power BI Pro" value={p.nome} onChange={(e) => set({ nome: e.target.value })} />
          <Select rotulo="Categoria" vazio={false} opcoes={opcoes(["Software", "Linha telefônica"])} value={p.categoria} onChange={(e) => set({ categoria: e.target.value as CategoriaLicenca })} />
          <Input rotulo="Fornecedor" value={p.fornecedorNome} onChange={(e) => set({ fornecedorNome: e.target.value })} />
          <Select rotulo="Contrato (somente vínculo)" className="md:col-span-2" vazio="Sem contrato" opcoes={vigentes} value={p.contrato_id ?? ""} onChange={(e) => set({ contrato_id: e.target.value || undefined })} ajuda="O contrato não é alterado; aqui só se indica a qual contrato estas licenças pertencem." />
          <InputNumero rotulo="Quantidade contratada" obrigatorio valor={p.quantidadeContratada} onValor={(v) => set({ quantidadeContratada: v ?? 0 })} />
          <InputNumero rotulo="Valor por licença" valor={p.valorUnitario} onValor={(v) => set({ valorUnitario: v ?? 0 })} ajuda={p.categoria === "Linha telefônica" ? "Para linhas, o custo vem do valor de cada linha" : undefined} />
          <div className="grid grid-cols-2 gap-2">
            <Select rotulo="Moeda" vazio={false} opcoes={op.moedas} value={p.moeda} onChange={(e) => set({ moeda: e.target.value as Moeda })} />
            <Select rotulo="Período do valor" vazio={false} opcoes={opcoes(["Mensal", "Anual"])} value={p.periodicidade} onChange={(e) => set({ periodicidade: e.target.value as "Mensal" | "Anual" })} />
          </div>
          {p.moeda !== "BRL" && (
            <>
              <InputNumero rotulo="Cotação (R$)" obrigatorio valor={p.cotacao?.valor} onValor={(v) => set({ cotacao: v ? { data: p.cotacao?.data ?? new Date().toISOString().slice(0, 10), fonte: p.cotacao?.fonte ?? "PTAX", ...p.cotacao, valor: v } : undefined })} />
              <Select rotulo="Fonte da cotação" vazio={false} opcoes={op.fontesCotacao} value={p.cotacao?.fonte ?? "PTAX"} onChange={(e) => p.cotacao && set({ cotacao: { ...p.cotacao, fonte: e.target.value as FonteCotacao } })} />
            </>
          )}
          <InputNumero rotulo="IOF (%)" valor={p.iofPercentual} onValor={(v) => set({ iofPercentual: v })} />
          <InputNumero rotulo="Impostos (%)" valor={p.impostosPercentual} onValor={(v) => set({ impostosPercentual: v })} />
          <Input rotulo="Vencimento" type="date" value={p.vencimento ?? ""} onChange={(e) => set({ vencimento: e.target.value || undefined })} />
          <Input rotulo="Vencimento (texto)" placeholder="Mensal, Por demanda…" value={p.vencimentoTexto ?? ""} onChange={(e) => set({ vencimentoTexto: e.target.value || undefined })} />
          <Select rotulo="Situação" vazio={false} opcoes={opcoes(["Ativo", "Cancelado", "Downgrade"])} value={p.situacao} onChange={(e) => set({ situacao: e.target.value as SituacaoProdutoLicenca })} />
          <div className="flex items-end pb-1 md:col-span-2">
            <Toggle rotulo="Controlar uso por pessoa" ajuda="Desligue para contas únicas/compartilhadas: o produto não gera custo ocioso" checked={p.controlePorUsuario !== false} onChange={(v) => set({ controlePorUsuario: v })} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Ficha da ferramenta</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input rotulo="Responsável" value={p.responsavel ?? ""} onChange={(e) => set({ responsavel: e.target.value || undefined })} />
            <Input rotulo="Utilização" value={p.utilizacao ?? ""} onChange={(e) => set({ utilizacao: e.target.value || undefined })} />
            <Textarea rotulo="Por que é mantida" value={p.manutencao ?? ""} onChange={(e) => set({ manutencao: e.target.value || undefined })} />
            <Textarea rotulo="Quem pode substituir" value={p.substituto ?? ""} onChange={(e) => set({ substituto: e.target.value || undefined })} />
            <Textarea rotulo="Riscos" value={p.riscos ?? ""} onChange={(e) => set({ riscos: e.target.value || undefined })} />
            <Textarea rotulo="Observações" value={p.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value || undefined })} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ColaboradorModal({ colaborador, onFechar }: { colaborador?: Colaborador; onFechar: () => void }) {
  const { usuario, executar, cad } = useApp();
  const op = useOpcoes();
  const [c, setC] = useState<Colaborador>();
  useEffect(() => setC(colaborador ? structuredClone(colaborador) : undefined), [colaborador]);
  if (!c) return null;
  const set = (x: Partial<Colaborador>) => setC({ ...c, ...x });
  const areas = cad.config.listasAuxiliares["Áreas"]?.length ? cad.config.listasAuxiliares["Áreas"] : AREAS_PADRAO;
  return (
    <Modal
      aberto
      largura="lg"
      titulo={c.id ? `Editar ${c.nome}` : "Novo colaborador"}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!c.nome.trim()} onClick={async () => (await executar(() => api.salvarColaborador({ ...c, confirmacoesPendentes: [] }, usuario.id), "Colaborador salvo.")) && onFechar()}>Salvar</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input rotulo="Nome" obrigatorio className="md:col-span-2" value={c.nome} onChange={(e) => set({ nome: e.target.value })} />
        <Input rotulo="E-mail" type="email" value={c.email ?? ""} onChange={(e) => set({ email: e.target.value || undefined })} />
        <Select rotulo="Tipo" vazio={false} opcoes={opcoes(["Pessoa", "Conta compartilhada"])} value={c.tipo} onChange={(e) => set({ tipo: e.target.value as TipoColaborador })} />
        <Select rotulo="Área" vazio="—" opcoes={opcoes(c.area && !areas.includes(c.area) ? [c.area, ...areas] : areas)} value={c.area ?? ""} onChange={(e) => set({ area: e.target.value || undefined })} />
        <Input rotulo="Centro de custo" value={c.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value || undefined })} />
        <Select rotulo="Empresa" vazio="—" opcoes={op.empresas} value={c.empresaId ?? ""} onChange={(e) => set({ empresaId: e.target.value || undefined })} />
        <div className="flex items-end pb-1">
          <Toggle rotulo="Ativo" ajuda="Inativo com licença gera alerta" checked={c.ativo} onChange={(v) => set({ ativo: v })} />
        </div>
      </div>
    </Modal>
  );
}

/** Atribuir licença: busca o colaborador pelo nome ou e-mail. Para linhas, pede número e valor. */
export function AtribuirModal({ produto, colaboradores, onFechar }: { produto?: ProdutoLicenca; colaboradores: Colaborador[]; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [busca, setBusca] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [linha, setLinha] = useState({ numero: "", operadora: "", plano: "" });
  const [valor, setValor] = useState<number>();
  useEffect(() => {
    setBusca("");
    setColaboradorId("");
    setLinha({ numero: "", operadora: produto?.fornecedorNome ?? "", plano: "" });
    setValor(undefined);
  }, [produto]);
  if (!produto) return null;
  const ehLinha = produto.categoria === "Linha telefônica";
  const filtrados = colaboradores
    .filter((c) => c.ativo && (!busca || normalizarBusca(`${c.nome} ${c.email ?? ""}`).includes(normalizarBusca(busca))))
    .slice(0, 50);
  return (
    <Modal
      aberto
      titulo={`Atribuir — ${produto.nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button
            disabled={!colaboradorId || (ehLinha && !linha.numero.trim())}
            onClick={async () => {
              const extra = ehLinha ? { linha: { ...linha, numero: linha.numero.trim() }, valorMensalBRL: valor } : undefined;
              if (await executar(() => api.atribuirLicenca(produto.id, colaboradorId, usuario.id, extra), "Licença atribuída.")) onFechar();
            }}
          >
            Atribuir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input rotulo="Buscar colaborador" placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="max-h-64 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
          {filtrados.map((c) => (
            <li key={c.id}>
              <button onClick={() => setColaboradorId(c.id)} className={`flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-fundo ${colaboradorId === c.id ? "bg-primaria-50 font-medium" : ""}`}>
                <span>{c.nome}</span>
                <span className="truncate text-xs text-texto-suave">{c.email ?? c.area ?? ""}</span>
              </button>
            </li>
          ))}
          {filtrados.length === 0 && <li className="px-3 py-4 text-center text-sm text-texto-suave">Nenhum colaborador ativo encontrado. Cadastre em "Por pessoa".</li>}
        </ul>
        {ehLinha && (
          <div className="grid grid-cols-2 gap-3">
            <Input rotulo="Número da linha" obrigatorio placeholder="(21) 98888-7777" value={linha.numero} onChange={(e) => setLinha({ ...linha, numero: e.target.value })} />
            <Input rotulo="Operadora" value={linha.operadora} onChange={(e) => setLinha({ ...linha, operadora: e.target.value })} />
            <Input rotulo="Plano" value={linha.plano} onChange={(e) => setLinha({ ...linha, plano: e.target.value })} />
            <InputNumero rotulo="Valor mensal (R$)" valor={valor} onValor={setValor} />
          </div>
        )}
      </div>
    </Modal>
  );
}
