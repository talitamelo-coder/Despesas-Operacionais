-- =============================================================================
-- Módulo de Gestão de Contratos — modelo de dados proposto (MySQL 8.0+)
-- RASCUNHO para a fase de backend (Python). Espelha src/domain/types.ts.
-- Convenções: InnoDB, utf8mb4, IDs como CHAR(36) (UUID) gerados pela aplicação,
-- valores monetários DECIMAL(18,2), câmbio DECIMAL(18,6), datas DATE.
-- Contratos e auditoria NUNCA são apagados (sem ON DELETE CASCADE nessas tabelas).
-- =============================================================================

CREATE TABLE usuarios (
  id            CHAR(36)     PRIMARY KEY,
  external_id   VARCHAR(64)  NULL COMMENT 'ID no SSO/Akross Atende',
  nome          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  perfil        ENUM('Administrador','Suprimentos','Gestor','Juridico') NOT NULL,
  cargo         VARCHAR(120) NULL,
  diretor       BOOLEAN      NOT NULL DEFAULT FALSE,
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE empresas (
  id      CHAR(36)     PRIMARY KEY,
  nome    VARCHAR(150) NOT NULL,
  cnpj    CHAR(14)     NULL UNIQUE,
  ativo   BOOLEAN      NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fornecedor: apenas dados relevantes ao contrato. Fonte oficial = sistema atual.
-- NÃO armazenar banco/agência/conta/PIX/dados de pagamento.
CREATE TABLE fornecedores (
  fornecedor_id     CHAR(36)     PRIMARY KEY,
  external_id       VARCHAR(64)  NULL UNIQUE COMMENT 'Código no sistema atual',
  razao_social      VARCHAR(200) NOT NULL,
  nome_fantasia     VARCHAR(150) NULL,
  cnpj              CHAR(14)     NULL,
  codigo_fornecedor VARCHAR(40)  NULL,
  cidade            VARCHAR(100) NULL,
  uf                CHAR(2)      NULL,
  status_cadastral  ENUM('Ativo','Inativo','Bloqueado','Potencial') NOT NULL,
  INDEX ix_fornecedor_cnpj (cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tipos_contrato (
  id    CHAR(36)     PRIMARY KEY,
  nome  VARCHAR(120) NOT NULL UNIQUE,
  ativo BOOLEAN      NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Parâmetros e listas auxiliares (moedas, periodicidades, fontes de cotação, índices,
-- origens de saving/oportunidade, regras de alerta) — chave/valor JSON versionado.
CREATE TABLE configuracoes (
  chave         VARCHAR(80) PRIMARY KEY,
  valor         JSON        NOT NULL,
  atualizado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36)   NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Processo de contratação (antecede o contrato). JIRA -> Processo -> Contrato -> Pedido
-- -----------------------------------------------------------------------------
CREATE TABLE processos (
  processo_id           CHAR(36)    PRIMARY KEY,
  codigo                VARCHAR(20) NOT NULL UNIQUE COMMENT 'PC-AAAA-NNNN',
  tipo                  ENUM('Nova contratação','Renovação','Substituição de fornecedor','Renegociação','Aditivo') NOT NULL,
  status                ENUM('Rascunho','Validação de Suprimentos','Em cotação','Em negociação','Aguardando aprovação comercial','Em análise jurídica','Aguardando assinatura','Concluído','Suspenso','Cancelado') NOT NULL,
  status_antes_suspensao VARCHAR(40) NULL,
  jira_key              VARCHAR(40) NULL,
  demanda_jira          JSON        NULL COMMENT 'Pré-cadastro recebido do JIRA (não oficial)',
  valor_validado        DECIMAL(18,2) NULL,
  quantidade_validada   DECIMAL(18,4) NULL,
  validado_por          CHAR(36)    NULL,
  validado_em           DATETIME    NULL,
  validacao_observacao  TEXT        NULL,
  contrato_anterior_id  CHAR(36)    NULL,
  contrato_gerado_id    CHAR(36)    NULL,
  external_id           VARCHAR(64) NULL,
  empresa_id            CHAR(36)    NULL,
  objeto                TEXT        NULL,
  gestor_id             CHAR(36)    NULL,
  diretor_id            CHAR(36)    NULL,
  analista_id           CHAR(36)    NULL,
  centro_custo          VARCHAR(60) NULL,
  projeto               VARCHAR(120) NULL,
  tipo_contrato_id      CHAR(36)    NULL,
  origem_oportunidade   ENUM('Suprimentos','Gestor','Área solicitante','Diretoria','Financeiro','Outro') NULL,
  motivo_substituicao   TEXT        NULL,
  proposta_recomendada_id CHAR(36)  NULL,
  estrategia_suprimentos TEXT       NULL,
  justificativa         TEXT        NULL,
  excecao               BOOLEAN     NOT NULL DEFAULT FALSE,
  condicoes             JSON        NULL COMMENT 'Rascunho das condições comerciais',
  vigencia              JSON        NULL,
  reajuste              JSON        NULL,
  rescisao              JSON        NULL,
  juridico_status       ENUM('Não iniciado','Em análise','Parecer emitido','Ressalvas') NOT NULL DEFAULT 'Não iniciado',
  juridico_responsavel  CHAR(36)    NULL,
  juridico_parecer      TEXT        NULL,
  assinatura_status     ENUM('Não iniciada','Enviado para assinatura','Assinado') NOT NULL DEFAULT 'Não iniciada',
  assinatura_data       DATE        NULL,
  envelope_id           VARCHAR(80) NULL COMMENT 'Adobe Sign — integração futura',
  origens               JSON        NOT NULL COMMENT 'campo -> importado|validado|herdado|calculado|manual',
  criado_por            CHAR(36)    NOT NULL,
  criado_em             DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_proc_status (status),
  INDEX ix_proc_jira (jira_key),
  INDEX ix_proc_anterior (contrato_anterior_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (gestor_id) REFERENCES usuarios(id),
  FOREIGN KEY (analista_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE propostas (
  id                     CHAR(36)     PRIMARY KEY,
  processo_id            CHAR(36)     NOT NULL,
  fornecedor_id          CHAR(36)     NULL,
  fornecedor_potencial   VARCHAR(200) NULL COMMENT 'Fornecedor ainda não cadastrado',
  moeda                  CHAR(3)      NOT NULL,
  proposta_inicial_anual DECIMAL(18,2) NOT NULL,
  proposta_final_anual   DECIMAL(18,2) NULL,
  observacao             TEXT         NULL,
  FOREIGN KEY (processo_id) REFERENCES processos(processo_id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(fornecedor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE aprovacoes (
  processo_id CHAR(36) NOT NULL,
  papel       ENUM('Gestor','Suprimentos','Diretor') NOT NULL,
  tipo        ENUM('Aprovação','Ciência') NOT NULL,
  status      ENUM('Pendente','Aprovado','Reprovado','Ciente') NOT NULL,
  usuario_id  CHAR(36) NOT NULL,
  data        DATETIME NULL,
  comentario  TEXT     NULL,
  PRIMARY KEY (processo_id, papel),
  FOREIGN KEY (processo_id) REFERENCES processos(processo_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Contrato. Renovação/substituição geram NOVO registro ligado ao anterior.
-- -----------------------------------------------------------------------------
CREATE TABLE contratos (
  contrato_id           CHAR(36)     PRIMARY KEY,
  codigo                VARCHAR(20)  NOT NULL UNIQUE COMMENT 'CT-AAAA-NNNN',
  processo_id           CHAR(36)     NULL,
  contrato_anterior_id  CHAR(36)     NULL,
  sucessor_id           CHAR(36)     NULL,
  relacao_anterior      ENUM('Renovação','Substituição') NULL,
  pedido_id             VARCHAR(64)  NULL COMMENT 'Sistema atual',
  external_id           VARCHAR(64)  NULL COMMENT 'Ex.: código na planilha legada',
  jira_key              VARCHAR(40)  NULL,
  empresa_id            CHAR(36)     NOT NULL,
  fornecedor_id         CHAR(36)     NOT NULL,
  objeto                TEXT         NOT NULL,
  tipo_contrato_id      CHAR(36)     NOT NULL,
  gestor_id             CHAR(36)     NOT NULL,
  diretor_id            CHAR(36)     NULL,
  analista_id           CHAR(36)     NOT NULL,
  centro_custo          VARCHAR(60)  NULL,
  projeto               VARCHAR(120) NULL,
  status                ENUM('Vigente','Suspenso','Encerrado','Rescindido') NOT NULL,
  -- condições comerciais
  moeda                 CHAR(3)      NOT NULL,
  valor_anual           DECIMAL(18,2) NOT NULL COMMENT 'Na moeda do contrato',
  quantidade            DECIMAL(18,4) NULL,
  unidade               VARCHAR(40)  NULL,
  preco_unitario        DECIMAL(18,6) NULL,
  periodicidade_pagamento VARCHAR(30) NOT NULL,
  condicao_pagamento    VARCHAR(200) NULL,
  cotacao_valor         DECIMAL(18,6) NULL,
  cotacao_data          DATE         NULL,
  cotacao_fonte         VARCHAR(40)  NULL,
  cotacao_observacao    VARCHAR(255) NULL,
  -- vigência
  data_inicio           DATE         NOT NULL,
  data_fim              DATE         NOT NULL,
  tipo_vigencia         ENUM('Prazo determinado','Prazo indeterminado') NOT NULL,
  aviso_previo_dias     INT          NOT NULL DEFAULT 0,
  renovacao_automatica  BOOLEAN      NOT NULL DEFAULT FALSE,
  prazo_gestor_dias     INT          NOT NULL DEFAULT 30,
  periodicidade_renovacao_meses INT  NULL,
  -- data limite e abertura da avaliação são CALCULADAS (não persistir; ver domain/rules/prazos.ts)
  reajuste              JSON         NOT NULL,
  rescisao              JSON         NOT NULL,
  motivo_substituicao   TEXT         NULL,
  substituicao          JSON         NULL,
  avaliacao_renovacao   JSON         NULL,
  origens               JSON         NOT NULL,
  criado_em             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_ct_status_fim (status, data_fim),
  INDEX ix_ct_fornecedor (fornecedor_id),
  INDEX ix_ct_empresa (empresa_id),
  INDEX ix_ct_gestor (gestor_id),
  INDEX ix_ct_analista (analista_id),
  INDEX ix_ct_anterior (contrato_anterior_id),
  FULLTEXT INDEX ft_ct_busca (codigo, objeto, projeto, jira_key),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(fornecedor_id),
  FOREIGN KEY (tipo_contrato_id) REFERENCES tipos_contrato(id),
  FOREIGN KEY (contrato_anterior_id) REFERENCES contratos(contrato_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE savings (
  contrato_id          CHAR(36) NULL,
  processo_id          CHAR(36) NULL,
  tipo_baseline        ENUM('Contrato anterior','Baseline ajustado','Proposta inicial') NOT NULL,
  baseline_anual       DECIMAL(18,2) NOT NULL COMMENT 'BRL',
  evidencia_baseline   TEXT          NULL,
  valor_negociado_anual DECIMAL(18,2) NOT NULL COMMENT 'BRL',
  origem_oportunidade  VARCHAR(40)   NOT NULL,
  UNIQUE KEY uk_saving_contrato (contrato_id),
  UNIQUE KEY uk_saving_processo (processo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Composição: uma linha por origem (sem dupla contagem garantida pela PK).
CREATE TABLE saving_componentes (
  referencia_id CHAR(36)     NOT NULL COMMENT 'contrato_id ou processo_id',
  origem        VARCHAR(60)  NOT NULL,
  valor_anual   DECIMAL(18,2) NOT NULL,
  descricao     VARCHAR(255) NULL,
  PRIMARY KEY (referencia_id, origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Espelho/cache da execução financeira vinda do sistema atual (somente leitura aqui).
CREATE TABLE execucao_financeira (
  contrato_id      CHAR(36)      PRIMARY KEY,
  pedido_id        VARCHAR(64)   NULL,
  valor_contratado DECIMAL(18,2) NULL,
  valor_consumido  DECIMAL(18,2) NULL,
  atualizado_em    DATETIME      NULL,
  FOREIGN KEY (contrato_id) REFERENCES contratos(contrato_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE documentos (
  id          CHAR(36)     PRIMARY KEY,
  contrato_id CHAR(36)     NULL,
  processo_id CHAR(36)     NULL,
  nome        VARCHAR(255) NOT NULL,
  categoria   ENUM('Proposta','Minuta','Contrato','Aditivo','Parecer','Contrato assinado','Anexo') NOT NULL,
  versao      INT          NOT NULL,
  storage_uri VARCHAR(500) NULL COMMENT 'Objeto em storage (S3/Blob) ou ECM',
  external_id VARCHAR(80)  NULL COMMENT 'Adobe — integração futura',
  tamanho_kb  INT          NULL,
  usuario_id  CHAR(36)     NOT NULL,
  data        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_doc_contrato (contrato_id),
  INDEX ix_doc_processo (processo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Log de alertas efetivamente disparados (os programados são calculados).
CREATE TABLE alertas_enviados (
  id           CHAR(36)    PRIMARY KEY,
  contrato_id  CHAR(36)    NOT NULL,
  tipo         VARCHAR(60) NOT NULL,
  categoria    ENUM('Decisão do gestor','Contratual crítico') NOT NULL,
  canal        ENUM('email','sistema') NOT NULL,
  destinatario_id CHAR(36) NOT NULL,
  enviado_em   DATETIME    NOT NULL,
  UNIQUE KEY uk_alerta (contrato_id, tipo, canal, destinatario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Trilha de auditoria — append-only. Conceder apenas INSERT/SELECT ao usuário da aplicação.
CREATE TABLE auditoria (
  id             BIGINT       AUTO_INCREMENT PRIMARY KEY,
  entidade       ENUM('contrato','processo','documento','configuracao') NOT NULL,
  entidade_id    CHAR(36)     NOT NULL,
  usuario_id     CHAR(36)     NOT NULL,
  data           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  acao           VARCHAR(150) NOT NULL,
  campo          VARCHAR(150) NULL,
  valor_anterior TEXT         NULL,
  valor_novo     TEXT         NULL,
  INDEX ix_aud_entidade (entidade_id, data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
