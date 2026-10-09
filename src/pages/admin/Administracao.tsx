import { useState } from "react";
import { Download, Eraser, Plus, RotateCcw, Save, Upload, X } from "lucide-react";
import { useApp } from "@/app/contexto";
import { salvarArquivo } from "@/app/arquivos";
import { AuditoriaLista } from "@/components/dominio/AuditoriaLista";
import { FornecedorForm } from "@/components/dominio/FornecedorForm";
import { UsuarioForm } from "@/components/dominio/UsuarioForm";
import { validarUsuario } from "@/domain/rules/usuario";
import { fornecedorMascarado, validarFornecedor } from "@/domain/rules/fornecedor";
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
import { formatarCnpj, normalizarBusca } from "@/domain/formatacao";
import type { Configuracao, Empresa, Fornecedor, TipoContrato, Usuario } from "@/domain/types";
import { api, fonteDados } from "@/services";

const ABAS = [
  { id: "dados", rotulo: "Dados e backup" },
  { id: "usuarios", rotulo: "Usuários e perfis" },
  { id: "empresas", rotulo: "Empresas" },
  { id: "fornecedores", rotulo: "Fornecedores" },
  { id: "tipos", rotulo: "Tipos de contrato" },
  { id: "listas", rotulo: "Listas e parâmetros" },
  { id: "alertas", rotulo: "Regras de alertas" },
  { id: "importacao", rotulo: "Importação da planilha" },
  { id: "auditoria", rotulo: "Auditoria" },
] as const;
type AbaAdmin = (typeof ABAS)[number]["id"];

export function Administracao() {
  const { pode } = useApp();
  const [aba, setAba] = useState<AbaAdmin>("dados");
  const { cad } = useApp();
  if (!pode("administrar")) {
    // Na demonstração qualquer perfil pode iniciar a base real; com dados reais, só o Administrador.
    if (cad.modo === "demonstracao")
      return (
        <>
          <PageHeader titulo="Administração" descricao="Para os demais cadastros e parâmetros, use o perfil Administrador." />
          <DadosBackup />
        </>
      );
    return <Aviso tom="alerta" titulo="Acesso restrito">A Administração é exclusiva do perfil Administrador.</Aviso>;
  }
  return (
    <>
      <PageHeader titulo="Administração" descricao="Cadastros de apoio, parâmetros, regras de alertas, importação da planilha legada e cópias de segurança." />
      <Tabs className="mb-4" abas={[...ABAS]} ativa={aba} onChange={setAba} />
      {aba === "dados" && <DadosBackup />}
      {aba === "usuarios" && <Usuarios />}
      {aba === "empresas" && <Empresas />}
      {aba === "fornecedores" && <Fornecedores />}
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

function DadosBackup() {
  const { cad, usuario, executar, notificar } = useApp();
  const [modal, setModal] = useState<"vazia" | "demo">();
  const [admin, setAdmin] = useState({ nome: "", email: "" });
  const [confirmacao, setConfirmacao] = useState("");
  const real = cad.modo === "real";

  if (fonteDados !== "mock") return <Aviso tom="info">Com o banco de dados oficial, cópias de segurança são feitas no servidor.</Aviso>;

  const fechar = () => (setModal(undefined), setConfirmacao(""));
  const exportar = async () => {
    const json = await executar(() => api.exportarBackup(usuario.id));
    if (!json) return;
    const nome = `backup-contratos-${new Date().toISOString().slice(0, 10)}.json`;
    const r = await executar(() => salvarArquivo(nome, json));
    if (r === "salvo") notificar("Cópia de segurança salva.");
  };
  const restaurar = async (f: File) => {
    const r = await executar(async () => api.importarBackup(await f.text(), usuario.id));
    if (r) notificar(`Backup restaurado: ${r.contratos} contrato(s) e ${r.processos} processo(s).`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader titulo="Base em uso" />
        <CardBody className="space-y-3">
          {real ? (
            <Aviso tom="info" titulo="Dados reais">
              Os dados ficam guardados <b>somente neste navegador, neste computador</b>. Outras pessoas não veem o que você cadastra, e limpar os dados do navegador apaga tudo.
              Faça uma cópia de segurança ao fim de cada sessão de uso.
            </Aviso>
          ) : (
            <Aviso tom="alerta" titulo="Dados de demonstração (fictícios)">
              Para testar com dados reais, comece uma base vazia. Os dados fictícios serão removidos deste navegador.
            </Aviso>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variante={real ? "secundario" : "primario"} icone={<Eraser size={16} />} onClick={() => setModal("vazia")}>
              Começar base vazia
            </Button>
            {real && (
              <Button variante="secundario" icone={<RotateCcw size={16} />} onClick={() => setModal("demo")}>
                Voltar para a demonstração
              </Button>
            )}
            {!real && (
              <Button variante="secundario" icone={<RotateCcw size={16} />} onClick={() => setModal("demo")}>
                Restaurar dados de demonstração
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader titulo="Cópia de segurança" subtitulo="Arquivo com todos os contratos, processos, cadastros, documentos (metadados) e auditoria" />
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button icone={<Download size={16} />} onClick={exportar}>Salvar cópia de segurança</Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-borda-forte bg-superficie px-4 text-sm font-medium hover:bg-fundo">
            <Upload size={16} /> Restaurar de um arquivo
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => (e.target.files?.[0] && restaurar(e.target.files[0]), (e.target.value = ""))} />
          </label>
          <p className="w-full text-xs text-texto-suave">Restaurar substitui a base atual pelo conteúdo do arquivo. Use também para levar seus dados para outro computador.</p>
        </CardBody>
      </Card>

      <Modal
        aberto={modal === "vazia"}
        titulo="Começar base vazia"
        onFechar={fechar}
        rodape={
          <>
            <Button variante="secundario" onClick={fechar}>Cancelar</Button>
            <Button
              variante="perigo"
              disabled={!admin.nome.trim() || !admin.email.trim() || (real && confirmacao !== "APAGAR")}
              onClick={async () => {
                const ok = await executar(async () => (await api.iniciarBaseVazia(admin, usuario.id), true), "Base vazia criada. Comece cadastrando empresas, usuários e fornecedores.");
                if (ok) {
                  fechar();
                  setUsuarioPadrao();
                }
              }}
            >
              Começar base vazia
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm">
            {real ? "Todos os dados reais deste navegador serão apagados." : "Os contratos, processos, fornecedores, empresas e usuários fictícios serão removidos."} Ficam mantidos os tipos de contrato e as listas de parâmetros.
          </p>
          <p className="text-sm">Você será o primeiro Administrador:</p>
          <Input rotulo="Seu nome" obrigatorio value={admin.nome} onChange={(e) => setAdmin({ ...admin, nome: e.target.value })} />
          <Input rotulo="Seu e-mail" obrigatorio type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
          {real && <Input rotulo='Digite APAGAR para confirmar' value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} ajuda="Recomendado: salve uma cópia de segurança antes." />}
        </div>
      </Modal>

      <Modal
        aberto={modal === "demo"}
        titulo="Restaurar dados de demonstração"
        onFechar={fechar}
        rodape={
          <>
            <Button variante="secundario" onClick={fechar}>Cancelar</Button>
            <Button variante="perigo" disabled={real && confirmacao !== "APAGAR"} onClick={async () => (await executar(() => api.restaurarDadosDemonstracao(usuario.id), "Dados de demonstração restaurados."), fechar())}>
              Restaurar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm">{real ? "Seus dados reais deste navegador serão substituídos pelos dados fictícios." : "Todas as alterações feitas neste navegador serão descartadas e os cenários de demonstração serão recriados."}</p>
          {real && <Input rotulo="Digite APAGAR para confirmar" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} ajuda="Recomendado: salve uma cópia de segurança antes." />}
        </div>
      </Modal>
    </div>
  );
}

/** Após trocar de base, o usuário simulado passa a ser o administrador criado. */
function setUsuarioPadrao() {
  try {
    localStorage.setItem("akross-contratos:usuario", "u-admin");
  } catch {
    /* preferência local */
  }
}

function Fornecedores() {
  const { cad, usuario, executar } = useApp();
  const [edit, setEdit] = useState<Fornecedor>();
  const [tentou, setTentou] = useState(false);
  const [busca, setBusca] = useState("");
  const lista = cad.fornecedores.filter((f) => !busca || normalizarBusca(`${f.razaoSocial} ${f.nomeFantasia} ${f.cnpj ?? ""}`).includes(normalizarBusca(busca)));
  const erros = edit ? validarFornecedor(edit) : {};
  const abrir = (f: Fornecedor) => (setTentou(false), setEdit(structuredClone(f)));
  const salvar = async () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    if (await executar(() => api.salvarFornecedor(edit!, usuario.id), "Fornecedor salvo.")) setEdit(undefined);
  };
  return (
    <Card>
      <CardHeader
        titulo="Fornecedores"
        subtitulo="Cadastro completo, incluindo dados bancários e PIX (exibidos mascarados)."
        acoes={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => abrir({ fornecedor_id: "", razaoSocial: "", nomeFantasia: "", statusCadastral: "Ativo", regimeTributario: "Não informado" })}>Novo fornecedor</Button>}
      />
      <div className="border-b border-borda p-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="h-9 w-full max-w-md rounded-md border border-borda-forte px-3 text-sm" />
      </div>
      <Tabela<Fornecedor>
        linhas={lista}
        chave={(f) => f.fornecedor_id}
        onLinha={abrir}
        vazio="Nenhum fornecedor cadastrado. Use “Novo fornecedor” ou importe a planilha de contratos."
        colunas={[
          { id: "r", titulo: "Razão social", render: (f) => <span>{f.razaoSocial}<span className="block text-xs text-texto-suave">{f.nomeFantasia !== f.razaoSocial ? f.nomeFantasia : ""}</span></span> },
          { id: "c", titulo: "CNPJ", render: (f) => <span className="whitespace-nowrap tabular">{f.estrangeiro ? "Estrangeiro" : formatarCnpj(f.cnpj)}</span> },
          { id: "contato", titulo: "Contato", render: (f) => <span className="text-xs">{f.email ?? "—"}<span className="block text-texto-suave">{f.telefone ?? ""}</span></span> },
          { id: "uf", titulo: "Cidade/UF", render: (f) => (f.cidade ? `${f.cidade}/${f.uf ?? ""}` : "—") },
          {
            id: "banco",
            titulo: "Banco / PIX",
            render: (f) => {
              const m = fornecedorMascarado(f);
              return (
                <span className="text-xs tabular">
                  {m.dadosBancarios ? `${m.dadosBancarios.nomeBanco ?? m.dadosBancarios.codigoBanco ?? "Banco"} · ag ${m.dadosBancarios.agencia ?? "—"} · cc ${m.dadosBancarios.conta ?? "—"}` : "—"}
                  {m.pix && <span className="block text-texto-suave">PIX {m.pix.tipo}: {m.pix.chave}</span>}
                </span>
              );
            },
          },
          { id: "s", titulo: "Status", render: (f) => <Badge tom={f.statusCadastral === "Ativo" ? "sucesso" : f.statusCadastral === "Potencial" ? "alerta" : "neutro"}>{f.statusCadastral}</Badge> },
        ]}
      />
      <Modal
        aberto={Boolean(edit)}
        titulo={edit?.fornecedor_id ? "Editar fornecedor" : "Novo fornecedor"}
        largura="xl"
        onFechar={() => setEdit(undefined)}
        rodape={
          <>
            {tentou && Object.keys(erros).length > 0 && <span className="mr-auto self-center text-xs text-critico-600">Corrija os campos destacados.</span>}
            <Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </>
        }
      >
        {edit && <FornecedorForm f={edit} onChange={setEdit} erros={tentou ? erros : {}} />}
      </Modal>
    </Card>
  );
}

function Usuarios() {
  const { cad, usuario, executar, nomeEmpresa } = useApp();
  const [edit, setEdit] = useState<Usuario>();
  const [senha, setSenha] = useState("");
  const [tentou, setTentou] = useState(false);
  const abrir = (u: Usuario) => (setEdit(structuredClone(u)), setSenha(""), setTentou(false));
  const erros = edit
    ? validarUsuario(edit, senha, {
        novo: !edit.id,
        emailsExistentes: cad.usuarios.filter((x) => x.id !== edit.id).map((x) => x.email.trim().toLowerCase()),
      })
    : {};
  const salvar = async () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    if (await executar(() => api.salvarUsuario(edit!, usuario.id, senha || undefined), edit!.id ? "Usuário atualizado." : "Usuário cadastrado.")) {
      setEdit(undefined);
      setSenha("");
    }
  };
  return (
    <Card>
      <CardHeader
        titulo="Usuários"
        subtitulo="Saving e baseline só podem ser alterados por Suprimentos ou Administrador"
        acoes={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => abrir({ id: "", nome: "", email: "", perfil: "Solicitante", empresasIds: [], ativo: true })}>Novo usuário</Button>}
      />
      <Tabela<Usuario>
        linhas={cad.usuarios}
        chave={(u) => u.id}
        onLinha={abrir}
        colunas={[
          { id: "n", titulo: "Nome", render: (u) => <span>{u.nome}{u.diretor && <span className="ml-2 text-xs text-texto-suave">Diretor</span>}</span> },
          { id: "e", titulo: "E-mail", render: (u) => <span className="text-texto-suave">{u.email || <span className="text-alerta-600">a completar</span>}</span> },
          { id: "p", titulo: "Perfil", render: (u) => <Badge tom="primario">{ROTULO_PERFIL[u.perfil]}</Badge> },
          { id: "ar", titulo: "Área", render: (u) => u.area ?? <span className="text-alerta-600">a completar</span> },
          { id: "f", titulo: "Filiais", render: (u) => <span className="text-xs">{u.empresasIds?.length ? u.empresasIds.map(nomeEmpresa).join(", ") : "Todas"}</span> },
          { id: "s", titulo: "Senha", render: (u) => (u.temSenha ? <Badge tom="sucesso">Definida</Badge> : <Badge tom="alerta">Não definida</Badge>) },
          { id: "a", titulo: "Situação", render: (u) => <Badge tom={u.ativo ? "sucesso" : "neutro"}>{u.ativo ? "Ativo" : "Inativo"}</Badge> },
        ]}
      />
      <Modal
        aberto={Boolean(edit)}
        titulo={edit?.id ? "Editar usuário" : "Novo usuário"}
        largura="lg"
        onFechar={() => setEdit(undefined)}
        rodape={
          <>
            {tentou && Object.keys(erros).length > 0 && <span className="mr-auto self-center text-xs text-critico-600">Corrija os campos destacados.</span>}
            <Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button onClick={salvar}>{edit?.id ? "Salvar" : "Cadastrar Usuário"}</Button>
          </>
        }
      >
        {edit && <UsuarioForm u={edit} onChange={setEdit} senha={senha} onSenha={setSenha} erros={tentou ? erros : {}} />}
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
    const ex = "CT-123;Fornecedor Exemplo Ltda;11.222.333/0001-81;Nome da Empresa;Serviço de exemplo;Nome do Gestor;Nome do Analista;120000,00;BRL;01/01/2026;31/12/2026;90;Sim;Serviços de TI;CC-1000;";
    executar(() => salvarArquivo("modelo-importacao-contratos.csv", "\uFEFF" + cab + "\n" + ex));
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
