import { useMemo, useState } from "react";
import { useApp } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Input, InputNumero, Select, Textarea } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { hoje } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import {
  aplicarMovimentacao,
  erroAtribuicao,
  errosLicenca,
  errosMovimentacao,
  pareceContaCompartilhada,
  posicaoNaData,
  rotuloTipoCobranca,
  valorAnualOriginal,
} from "@/domain/rules/licencas";
import { AREAS_PADRAO } from "@/domain/rules/usuario";
import type { Colaborador, Licenca, TipoMovimentacao } from "@/domain/types";
import { api, type NovaMovimentacao } from "@/services";
import type { ContextoLicencas } from "./Licencas";

const op = <T extends string>(l: readonly T[], rot?: (v: T) => string) => l.map((v) => ({ valor: v, rotulo: rot ? rot(v) : v }));

export function novaLicenca(): Licenca {
  return { id: "", fornecedorId: "", produto: "", tipoCobranca: "Assento", moeda: "BRL", periodicidade: "Mensal", vencimentoTipo: "Mensal", status: "Ativa", criadoEm: "", atualizadoEm: "" };
}

export function LicencaModal({ licenca, ctx, onFechar }: { licenca?: Licenca; ctx: ContextoLicencas; onFechar: (salva?: Licenca) => void }) {
  const { cad, usuario, executar } = useApp();
  const [l, setL] = useState<Licenca | undefined>(licenca);
  const [compra, setCompra] = useState<{ quantidade?: number; precoUnitario?: number; data: string; responsavel: string }>({ data: hoje(), responsavel: usuario.nome });
  const [tentou, setTentou] = useState(false);
  if (licenca && l?.id !== licenca.id) setL(licenca);
  if (!l) return null;
  const nova = !l.id;
  const temMov = ctx.dados.movimentacoes.some((m) => m.licencaId === l.id);
  const set = (p: Partial<Licenca>) => setL({ ...l, ...p });
  const erros = errosLicenca(l);
  const errosCompra = nova ? errosMovimentacao(l, [], 0, { tipo: "Compra", data: compra.data, quantidade: l.tipoCobranca === "Assento" ? compra.quantidade : 1, precoUnitario: compra.precoUnitario, responsavel: compra.responsavel }) : [];
  const contratos = ctx.contratos.filter((c) => (!l.fornecedorId || c.fornecedorId === l.fornecedorId) && (c.status === "Vigente" || c.contrato_id === l.contrato_id));
  const salvar = async () => {
    setTentou(true);
    if (erros.length || errosCompra.length) return;
    const r = await executar(
      () => api.salvarLicenca(l, usuario.id, nova ? { licencaId: "", tipo: "Compra", data: compra.data, quantidade: l.tipoCobranca === "Assento" ? compra.quantidade : 1, precoUnitario: compra.precoUnitario, responsavel: compra.responsavel } : undefined),
      nova ? "Licença cadastrada." : "Licença atualizada.",
    );
    if (r) onFechar(r);
  };
  return (
    <Modal aberto titulo={nova ? "Nova licença" : `Editar ${l.produto}`} largura="xl" onFechar={() => onFechar()} rodape={<><Button variante="secundario" onClick={() => onFechar()}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select rotulo="Fornecedor" obrigatorio value={l.fornecedorId} onChange={(e) => set({ fornecedorId: e.target.value, contrato_id: undefined })} opcoes={cad.fornecedores.map((f) => ({ valor: f.fornecedor_id, rotulo: f.nomeFantasia || f.razaoSocial })).sort((a, b) => a.rotulo.localeCompare(b.rotulo))} />
          <Input rotulo="Produto" obrigatorio value={l.produto} onChange={(e) => set({ produto: e.target.value })} />
          <Input rotulo="Plano" value={l.plano ?? ""} onChange={(e) => set({ plano: e.target.value || undefined })} />
          <Select rotulo="Contrato vinculado" ajuda="Só referencia o contrato; nada nele é alterado." value={l.contrato_id ?? ""} vazio="Sem contrato" onChange={(e) => set({ contrato_id: e.target.value || undefined })} opcoes={contratos.map((c) => ({ valor: c.contrato_id, rotulo: `${c.codigo} · ${c.objeto.slice(0, 40)}` }))} />
          <Input rotulo="Categoria" value={l.categoria ?? ""} onChange={(e) => set({ categoria: e.target.value || undefined })} />
          <Input rotulo="Utilização (para que serve)" value={l.utilizacao ?? ""} onChange={(e) => set({ utilizacao: e.target.value || undefined })} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Select rotulo="Tipo de cobrança" vazio={false} disabled={temMov} value={l.tipoCobranca} onChange={(e) => set({ tipoCobranca: e.target.value as Licenca["tipoCobranca"], limiteConsumoMensal: undefined })} opcoes={op(["Assento", "Fixo", "Consumo"] as const, rotuloTipoCobranca)} />
          <Select rotulo="Moeda" vazio={false} disabled={temMov} value={l.moeda} onChange={(e) => set({ moeda: e.target.value as Licenca["moeda"] })} opcoes={op(["BRL", "USD"] as const)} />
          <Select rotulo="Periodicidade" vazio={false} disabled={temMov} value={l.periodicidade} onChange={(e) => set({ periodicidade: e.target.value as Licenca["periodicidade"] })} opcoes={op(["Mensal", "Anual"] as const)} />
          <Select rotulo="Vencimento" vazio={false} value={l.vencimentoTipo} onChange={(e) => set({ vencimentoTipo: e.target.value as Licenca["vencimentoTipo"], dataVencimento: e.target.value === "Data" ? l.dataVencimento : undefined })} opcoes={op(["Data", "Mensal", "Sob demanda"] as const)} />
          {l.vencimentoTipo === "Data" && <Input rotulo="Data de vencimento" type="date" obrigatorio value={l.dataVencimento ?? ""} onChange={(e) => set({ dataVencimento: e.target.value || undefined })} />}
          {l.tipoCobranca === "Consumo" && <InputNumero rotulo={`Limite de consumo mensal (${l.moeda})`} ajuda="Sem limite gera alerta de custo." valor={l.limiteConsumoMensal} onValor={(v) => set({ limiteConsumoMensal: v })} />}
          <Select rotulo="Área dona" value={l.area ?? ""} onChange={(e) => set({ area: e.target.value || undefined })} opcoes={op(cad.config.listasAuxiliares["Áreas"] ?? AREAS_PADRAO)} />
          <Input rotulo="Centro de custo" value={l.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value || undefined })} />
          <Input rotulo="Responsável" value={l.responsavel ?? ""} onChange={(e) => set({ responsavel: e.target.value || undefined })} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Textarea rotulo="Justificativa de manutenção" value={l.justificativaManutencao ?? ""} onChange={(e) => set({ justificativaManutencao: e.target.value || undefined })} />
          <Textarea rotulo="Quem pode substituir" value={l.substitutoPossivel ?? ""} onChange={(e) => set({ substitutoPossivel: e.target.value || undefined })} />
          <Textarea rotulo="Riscos de trocar" value={l.riscoTroca ?? ""} onChange={(e) => set({ riscoTroca: e.target.value || undefined })} />
        </div>
        {nova && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Compra inicial</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {l.tipoCobranca === "Assento" ? (
                <InputNumero rotulo="Assentos" obrigatorio valor={compra.quantidade} onValor={(v) => setCompra({ ...compra, quantidade: v })} />
              ) : (
                <div className="flex items-end pb-2 text-xs text-texto-suave">Valor fixo/consumo: quantidade 1.</div>
              )}
              <InputNumero rotulo={`${l.tipoCobranca === "Assento" ? "Preço por assento" : "Valor"} (${l.moeda}/${l.periodicidade === "Mensal" ? "mês" : "ano"})`} obrigatorio valor={compra.precoUnitario} onValor={(v) => setCompra({ ...compra, precoUnitario: v })} />
              <Input rotulo="Data da compra" type="date" obrigatorio value={compra.data} onChange={(e) => setCompra({ ...compra, data: e.target.value })} />
              <Input rotulo="Responsável pela compra" obrigatorio value={compra.responsavel} onChange={(e) => setCompra({ ...compra, responsavel: e.target.value })} />
            </div>
            <p className="mt-2 text-xs text-texto-suave">
              Equivalente anual: {formatarMoeda((compra.precoUnitario ?? 0) * (l.tipoCobranca === "Assento" ? compra.quantidade ?? 0 : 1) * (l.periodicidade === "Mensal" ? 12 : 1), l.moeda)} · calculado pelo sistema. Compras seguintes entram em “Registrar movimentação” e somam ao contratado.
            </p>
          </div>
        )}
        {tentou && (erros.length > 0 || errosCompra.length > 0) && <Aviso tom="critico" titulo="Não foi possível salvar">{[...erros, ...errosCompra].join(" ")}</Aviso>}
      </div>
    </Modal>
  );
}

const TIPOS_MOV: TipoMovimentacao[] = ["Compra", "Redução", "Renegociação", "Cancelamento"];

export function MovimentacaoModal({ licenca, ctx, onFechar }: { licenca?: Licenca; ctx: ContextoLicencas; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [m, setM] = useState<NovaMovimentacao>({ licencaId: "", tipo: "Compra", data: hoje(), responsavel: usuario.nome });
  const [tentou, setTentou] = useState(false);
  const movs = useMemo(() => ctx.dados.movimentacoes.filter((x) => x.licencaId === licenca?.id), [ctx.dados.movimentacoes, licenca]);
  if (!licenca) return null;
  const ativas = ctx.dados.atribuicoes.filter((a) => a.licencaId === licenca.id && a.status === "Ativa").length;
  const mm = { ...m, licencaId: licenca.id, quantidade: m.tipo === "Compra" && licenca.tipoCobranca !== "Assento" ? 1 : m.quantidade };
  const erros = errosMovimentacao(licenca, movs, m.tipo === "Cancelamento" ? 0 : ativas, mm);
  const lotes = posicaoNaData(movs, "9999-12-31").lotes;
  const antes = valorAnualOriginal(lotes, licenca.periodicidade);
  const depois = valorAnualOriginal(aplicarMovimentacao(lotes, mm), licenca.periodicidade);
  const tipos = TIPOS_MOV.filter((t) => licenca.tipoCobranca === "Assento" || t !== "Redução").filter((t) => licenca.tipoCobranca === "Assento" || t !== "Compra" || !lotes.length);
  const salvar = async () => {
    setTentou(true);
    if (erros.length) return;
    const r = await executar(() => api.registrarMovimentacao(mm, usuario.id), `${m.tipo} registrada.`);
    if (r) onFechar();
  };
  return (
    <Modal aberto titulo={`Movimentação · ${licenca.produto}`} largura="lg" onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button variante={m.tipo === "Cancelamento" ? "perigo" : "primario"} onClick={salvar}>Registrar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select rotulo="Tipo" vazio={false} value={m.tipo} onChange={(e) => setM({ ...m, tipo: e.target.value as TipoMovimentacao, quantidade: undefined, precoUnitario: undefined })} opcoes={op(tipos)} />
          <Input rotulo="Data" type="date" obrigatorio value={m.data} onChange={(e) => setM({ ...m, data: e.target.value })} />
          {(m.tipo === "Compra" || m.tipo === "Redução") && licenca.tipoCobranca === "Assento" && <InputNumero rotulo={m.tipo === "Compra" ? "Assentos comprados" : "Assentos reduzidos"} obrigatorio valor={m.quantidade} onValor={(v) => setM({ ...m, quantidade: v })} />}
          {(m.tipo === "Compra" || m.tipo === "Renegociação") && <InputNumero rotulo={`${m.tipo === "Renegociação" ? "Novo preço" : "Preço"} unitário (${licenca.moeda}/${licenca.periodicidade === "Mensal" ? "mês" : "ano"})`} obrigatorio valor={m.precoUnitario} onValor={(v) => setM({ ...m, precoUnitario: v })} />}
          <Input rotulo="Responsável" obrigatorio value={m.responsavel} onChange={(e) => setM({ ...m, responsavel: e.target.value })} />
          <Input rotulo="Referência do pedido" value={m.referenciaPedido ?? ""} onChange={(e) => setM({ ...m, referenciaPedido: e.target.value || undefined })} />
          <Textarea className="md:col-span-2" rotulo="Observação" value={m.observacao ?? ""} onChange={(e) => setM({ ...m, observacao: e.target.value || undefined })} />
        </div>
        <div className="rounded-md bg-fundo px-3 py-2 text-sm">
          Valor anual: <b>{formatarMoeda(antes, licenca.moeda)}</b> → <b>{formatarMoeda(depois, licenca.moeda)}</b>{" "}
          <span className={depois < antes ? "text-sucesso-600" : depois > antes ? "text-alerta-600" : "text-texto-suave"}>
            ({depois < antes ? "economia" : depois > antes ? "aumento" : "sem variação"} de {formatarMoeda(Math.abs(depois - antes), licenca.moeda)})
          </span>
          <span className="block text-xs text-texto-suave">Calculado pelo sistema e guardado como registro de {depois < antes ? "economia" : "aumento"}.</span>
        </div>
        {m.tipo === "Cancelamento" && ativas > 0 && <Aviso tom="alerta">As {ativas} atribuição(ões) ativas serão encerradas na data do cancelamento.</Aviso>}
        {licenca.tipoCobranca !== "Assento" && lotes.length > 0 && <p className="text-xs text-texto-suave">Valor fixo ou consumo: para mudar o valor, use renegociação.</p>}
        {tentou && erros.length > 0 && <Aviso tom="critico">{erros.join(" ")}</Aviso>}
      </div>
    </Modal>
  );
}

export function AtribuirModal({ licenca, ctx, onFechar }: { licenca?: Licenca; ctx: ContextoLicencas; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [busca, setBusca] = useState("");
  const [colabId, setColabId] = useState("");
  const [data, setData] = useState(hoje());
  if (!licenca) return null;
  const movs = ctx.dados.movimentacoes.filter((m) => m.licencaId === licenca.id);
  const assentos = posicaoNaData(movs, "9999-12-31").assentos;
  const emUso = ctx.dados.atribuicoes.filter((a) => a.licencaId === licenca.id && a.status === "Ativa");
  const jaTem = new Set(emUso.map((a) => a.colaboradorId));
  const b = busca.trim().toLowerCase();
  const candidatos = ctx.dados.colaboradores
    .filter((c) => c.nome && c.status === "Ativo" && !jaTem.has(c.id) && (!b || c.nome.toLowerCase().includes(b) || c.email.includes(b)))
    .slice(0, 50);
  const escolhido = ctx.dados.colaboradores.find((c) => c.id === colabId);
  const erro = escolhido ? erroAtribuicao(licenca, movs, ctx.dados.atribuicoes, escolhido) : licenca.tipoCobranca === "Assento" && emUso.length >= assentos ? `Sem assento livre (${emUso.length} de ${assentos}). Registre uma compra antes.` : undefined;
  const salvar = async () => {
    const r = await executar(() => api.atribuirLicenca(licenca.id, colabId, data, usuario.id), "Licença atribuída.");
    if (r) (setColabId(""), setBusca(""), onFechar());
  };
  return (
    <Modal aberto titulo={`Atribuir · ${licenca.produto}`} onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button disabled={!colabId || Boolean(erro)} onClick={salvar}>Atribuir</Button></>}>
      <div className="space-y-3">
        {licenca.tipoCobranca === "Assento" && <p className="text-sm text-texto-suave">{emUso.length} de {assentos} assento(s) em uso · {Math.max(0, assentos - emUso.length)} livre(s)</p>}
        <Input rotulo="Buscar pessoa" placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="max-h-60 divide-y divide-borda overflow-auto rounded-md border border-borda">
          {candidatos.map((c) => (
            <li key={c.id}>
              <button onClick={() => setColabId(c.id)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${colabId === c.id ? "bg-primaria-50" : "hover:bg-fundo"}`}>
                <span>{c.nome}{c.tipoConta === "Compartilhada" && <span className="ml-1 text-xs text-texto-suave">(compartilhada)</span>}</span>
                <span className="text-xs text-texto-suave">{c.email} · {c.area ?? "sem área"}</span>
              </button>
            </li>
          ))}
          {!candidatos.length && <li className="px-3 py-2 text-sm text-texto-suave">Ninguém encontrado. Cadastre a pessoa em “Pessoas”.</li>}
        </ul>
        <Input rotulo="Início" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        {erro && <Aviso tom="critico">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

export function novoColaborador(): Colaborador {
  return { id: "", email: "", nome: "", status: "Ativo", tipoConta: "Pessoa" };
}

export function ColaboradorModal({ colaborador, ctx, onFechar }: { colaborador?: Colaborador; ctx: ContextoLicencas; onFechar: () => void }) {
  const { cad, usuario, executar } = useApp();
  const [c, setC] = useState<Colaborador | undefined>(colaborador);
  if (colaborador && c?.id !== colaborador.id) setC(colaborador);
  if (!c) return null;
  const set = (p: Partial<Colaborador>) => setC({ ...c, ...p });
  const sugereCompartilhada = c.email.includes("@") && c.tipoConta === "Pessoa" && pareceContaCompartilhada(c.email);
  const salvar = async () => {
    const r = await executar(() => api.salvarColaborador(c, usuario.id), c.id ? "Pessoa atualizada." : "Pessoa cadastrada.");
    if (r) onFechar();
  };
  const pessoas = ctx.dados.colaboradores.filter((x) => x.tipoConta === "Pessoa" && x.status === "Ativo" && x.nome && x.id !== c.id);
  return (
    <Modal aberto titulo={c.id ? `Editar ${c.nome}` : "Nova pessoa"} onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input className="md:col-span-2" rotulo="E-mail corporativo" obrigatorio ajuda="É a identidade da pessoa: não pode repetir." value={c.email} onChange={(e) => set({ email: e.target.value })} />
        <Input className="md:col-span-2" rotulo="Nome" obrigatorio value={c.nome} onChange={(e) => set({ nome: e.target.value })} />
        <Select rotulo="Área" value={c.area ?? ""} onChange={(e) => set({ area: e.target.value || undefined })} opcoes={op(cad.config.listasAuxiliares["Áreas"] ?? AREAS_PADRAO)} />
        <Input rotulo="Centro de custo" value={c.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value || undefined })} />
        <Select rotulo="Tipo de conta" vazio={false} value={c.tipoConta} onChange={(e) => set({ tipoConta: e.target.value as Colaborador["tipoConta"] })} opcoes={op(["Pessoa", "Compartilhada"] as const)} />
        {c.tipoConta === "Compartilhada" && <Select rotulo="Responsável" obrigatorio value={c.responsavelId ?? ""} onChange={(e) => set({ responsavelId: e.target.value || undefined })} opcoes={pessoas.map((p) => ({ valor: p.id, rotulo: p.nome }))} />}
      </div>
      {sugereCompartilhada && <div className="mt-3"><Aviso tom="info">Este e-mail não segue o padrão nome.sobrenome. Se for conta de serviço ou de equipe, marque como compartilhada.</Aviso></div>}
    </Modal>
  );
}

export function DesligarModal({ colaborador, ctx, onFechar }: { colaborador?: Colaborador; ctx: ContextoLicencas; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [data, setData] = useState(hoje());
  if (!colaborador) return null;
  const lic = ctx.dados.atribuicoes.filter((a) => a.colaboradorId === colaborador.id && a.status === "Ativa").length;
  const lin = ctx.dados.usosLinha.filter((u) => u.colaboradorId === colaborador.id && u.status === "Ativa").length;
  const salvar = async () => {
    const r = await executar(() => api.desligarColaborador(colaborador.id, data, usuario.id));
    if (r) onFechar();
  };
  return (
    <Modal aberto titulo={`Desligar ${colaborador.nome}`} onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button variante="perigo" onClick={salvar}>Desligar</Button></>}>
      <div className="space-y-3 text-sm">
        <p>Serão encerradas <b>{lic} licença(s)</b> e <b>{lin} linha(s) telefônica(s)</b> desta pessoa. Os assentos voltam a ficar disponíveis e o histórico é mantido.</p>
        <Input rotulo="Data do desligamento" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
    </Modal>
  );
}
