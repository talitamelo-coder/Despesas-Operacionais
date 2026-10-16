-- =============================================================================
-- Migração: Licenças de Software v1 + Telefonia + vigência obrigatória
-- MySQL 8 · utf8mb4. Em FastAPI, aplicar via Alembic (op.execute deste arquivo
-- ou tradução 1:1 em op.create_table). A base de licenças começa vazia.
-- =============================================================================

-- Contratos: status Cancelado e revisão anual do prazo indeterminado
ALTER TABLE contratos
  MODIFY status ENUM('Vigente','Suspenso','Encerrado','Rescindido','Cancelado') NOT NULL,
  MODIFY data_fim DATE NULL COMMENT 'Obrigatória no prazo determinado',
  ADD COLUMN data_base_revisao DATE NULL COMMENT 'Indeterminado: revisão anual (padrão = data_inicio)' AFTER tipo_vigencia;

CREATE TABLE IF NOT EXISTS avaliacoes_renovacao (
  id               CHAR(36)    PRIMARY KEY,
  contrato_id      CHAR(36)    NOT NULL,
  ciclo_revisao    DATE        NULL COMMENT 'Indeterminado: revisão a que a resposta se refere',
  respostas        JSON        NOT NULL,
  desfecho         ENUM('Renovação','Substituição de fornecedor','Manter fornecedor','Cancelar contrato') NOT NULL,
  respondido_por   CHAR(36)    NOT NULL,
  respondido_em    DATETIME    NOT NULL,
  FOREIGN KEY (contrato_id) REFERENCES contratos(contrato_id),
  INDEX ix_aval_contrato (contrato_id, respondido_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Perfis e auditoria
ALTER TABLE usuarios MODIFY perfil ENUM('Administrador','Suprimentos','Gestor','Juridico','Solicitante','Leitura') NOT NULL;
ALTER TABLE auditoria MODIFY entidade ENUM('contrato','processo','documento','configuracao','licenca','colaborador','telefonia') NOT NULL;

-- Remove o controle de licenças da versão anterior (base começa vazia)
DROP TABLE IF EXISTS atribuicoes_licenca;
DROP TABLE IF EXISTS produtos_licenca;
DROP TABLE IF EXISTS colaboradores;

-- -----------------------------------------------------------------------------
-- Colaboradores (quem usa). Separado de usuarios. Minimização LGPD.
-- -----------------------------------------------------------------------------
CREATE TABLE colaboradores (
  id                 CHAR(36)     PRIMARY KEY,
  email_corporativo  VARCHAR(200) NOT NULL COMMENT 'Minúsculas. Identidade',
  chave_identidade   VARCHAR(200) NOT NULL UNIQUE COMMENT 'E-mail com domínio do grupo normalizado',
  nome               VARCHAR(200) NOT NULL,
  area               VARCHAR(100) NULL,
  centro_custo       VARCHAR(100) NULL,
  status             ENUM('Ativo','Desligado') NOT NULL DEFAULT 'Ativo',
  tipo_conta         ENUM('Pessoa','Compartilhada') NOT NULL DEFAULT 'Pessoa',
  responsavel_id     CHAR(36)     NULL,
  data_desligamento  DATE         NULL,
  FOREIGN KEY (responsavel_id) REFERENCES colaboradores(id),
  INDEX ix_colab_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Licenças de software (o contratado). Nunca guarda chave de licença, senha ou token.
-- -----------------------------------------------------------------------------
CREATE TABLE licencas (
  id                        CHAR(36)      PRIMARY KEY,
  fornecedor_id             CHAR(36)      NOT NULL,
  contrato_id               CHAR(36)      NULL COMMENT 'Só referência; não altera o contrato',
  produto                   VARCHAR(200)  NOT NULL,
  plano                     VARCHAR(120)  NULL,
  categoria                 VARCHAR(100)  NULL,
  utilizacao                TEXT          NULL,
  tipo_cobranca             ENUM('Assento','Fixo','Consumo') NOT NULL,
  moeda                     ENUM('BRL','USD') NOT NULL,
  periodicidade             ENUM('Mensal','Anual') NOT NULL,
  vencimento_tipo           ENUM('Data','Mensal','Sob demanda') NOT NULL,
  data_vencimento           DATE          NULL,
  area                      VARCHAR(100)  NULL,
  centro_custo              VARCHAR(100)  NULL,
  responsavel               VARCHAR(150)  NULL,
  justificativa_manutencao  TEXT          NULL,
  substituto_possivel       TEXT          NULL,
  risco_troca               TEXT          NULL,
  limite_consumo_mensal     DECIMAL(15,2) NULL,
  status                    ENUM('Ativa','Cancelada') NOT NULL DEFAULT 'Ativa',
  criado_em                 DATETIME      NOT NULL,
  atualizado_em             DATETIME      NOT NULL,
  UNIQUE KEY uq_licenca (fornecedor_id, produto, plano),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(fornecedor_id),
  FOREIGN KEY (contrato_id) REFERENCES contratos(contrato_id),
  CONSTRAINT ck_venc_data CHECK (vencimento_tipo <> 'Data' OR data_vencimento IS NOT NULL),
  CONSTRAINT ck_anual_mensal CHECK (NOT (periodicidade = 'Anual' AND vencimento_tipo = 'Mensal'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Assentos contratados = soma das movimentações (nunca um campo digitado).
CREATE TABLE movimentacoes_licenca (
  id                  CHAR(36)      PRIMARY KEY,
  licenca_id          CHAR(36)      NOT NULL,
  tipo                ENUM('Compra','Redução','Renegociação','Cancelamento') NOT NULL,
  data                DATE          NOT NULL,
  quantidade          INT           NULL,
  preco_unitario      DECIMAL(15,4) NULL,
  responsavel         VARCHAR(150)  NOT NULL,
  referencia_pedido   VARCHAR(80)   NULL,
  observacao          TEXT          NULL,
  valor_anual_antes   DECIMAL(15,2) NOT NULL COMMENT 'Moeda da licença; registro de economia/aumento',
  valor_anual_depois  DECIMAL(15,2) NOT NULL,
  chave_importacao    VARCHAR(255)  NULL UNIQUE,
  registrado_por      CHAR(36)      NOT NULL,
  registrado_em       DATETIME      NOT NULL,
  FOREIGN KEY (licenca_id) REFERENCES licencas(id),
  INDEX ix_mov_licenca (licenca_id, data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Economias = movimentações com valor depois < antes (view, sem duplicar dado)
CREATE OR REPLACE VIEW economias_licenca AS
  SELECT id, licenca_id, tipo, data, valor_anual_antes, valor_anual_depois, responsavel, observacao
  FROM movimentacoes_licenca WHERE valor_anual_depois <> valor_anual_antes;

CREATE TABLE atribuicoes_licenca (
  id              CHAR(36) PRIMARY KEY,
  licenca_id      CHAR(36) NOT NULL,
  colaborador_id  CHAR(36) NOT NULL,
  status          ENUM('Ativa','Encerrada') NOT NULL DEFAULT 'Ativa',
  data_inicio     DATE     NOT NULL,
  data_fim        DATE     NULL,
  -- Uma atribuição ativa por pessoa e licença (coluna gerada: NULL quando encerrada).
  ativa_chave     CHAR(73) GENERATED ALWAYS AS (IF(status = 'Ativa', CONCAT(licenca_id, ':', colaborador_id), NULL)) STORED,
  UNIQUE KEY uq_atrib_ativa (ativa_chave),
  FOREIGN KEY (licenca_id) REFERENCES licencas(id),
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  INDEX ix_atrib_colab (colaborador_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- O limite "ativas <= assentos" é validado na API (transação com SELECT ... FOR UPDATE na licença).

CREATE TABLE cotacoes (
  data        DATE          PRIMARY KEY,
  ptax_venda  DECIMAL(12,6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE parametros (
  chave           ENUM('spread_cambial','aliquota_iof_usd','fator_impostos_simulado','exibir_cenario_impostos','dominios_grupo') NOT NULL,
  vigente_desde   DATE         NOT NULL,
  valor           VARCHAR(500) NOT NULL,
  descricao       VARCHAR(255) NULL,
  atualizado_por  CHAR(36)     NOT NULL,
  atualizado_em   DATETIME     NOT NULL,
  PRIMARY KEY (chave, vigente_desde)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orcamentos_fornecedor (
  id             CHAR(36)      PRIMARY KEY,
  fornecedor_id  CHAR(36)      NOT NULL,
  ano            SMALLINT      NOT NULL,
  valor_brl      DECIMAL(15,2) NOT NULL,
  UNIQUE KEY uq_orc (fornecedor_id, ano),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(fornecedor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pré-agregação FinOps (recalculada a cada movimentação/atribuição/cotação/parâmetro)
CREATE TABLE custo_licenca_mensal (
  competencia       CHAR(7)       NOT NULL COMMENT 'AAAA-MM',
  licenca_id        CHAR(36)      NOT NULL,
  tipo_parcela      ENUM('Pessoa','Disponível','Não atribuído') NOT NULL,
  colaborador_id    CHAR(36)      NULL,
  fornecedor_id     CHAR(36)      NOT NULL,
  area              VARCHAR(100)  NULL,
  centro_custo      VARCHAR(100)  NULL,
  valor_original    DECIMAL(15,4) NOT NULL,
  cotacao_usada     DECIMAL(12,6) NULL,
  custo_real_brl    DECIMAL(15,2) NULL,
  iof_brl           DECIMAL(15,2) NULL,
  valor_usd         DECIMAL(15,2) NULL,
  INDEX ix_cm_comp (competencia, fornecedor_id),
  INDEX ix_cm_area (competencia, area),
  INDEX ix_cm_colab (competencia, colaborador_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Telefonia (separada de licenças). BRL, sem câmbio e sem IOF.
-- -----------------------------------------------------------------------------
CREATE TABLE linhas_telefonicas (
  id             CHAR(36)      PRIMARY KEY,
  numero         VARCHAR(11)   NOT NULL UNIQUE COMMENT 'Só dígitos, com DDD',
  operadora      VARCHAR(80)   NOT NULL,
  fornecedor_id  CHAR(36)      NULL,
  contrato_id    CHAR(36)      NULL,
  plano          VARCHAR(120)  NULL,
  franquia       VARCHAR(60)   NULL,
  valor_mensal   DECIMAL(10,2) NOT NULL,
  situacao       ENUM('Ativa','Suspensa','Cancelada','Portada') NOT NULL DEFAULT 'Ativa',
  area           VARCHAR(100)  NULL,
  centro_custo   VARCHAR(100)  NULL,
  observacao     TEXT          NULL,
  criado_em      DATETIME      NOT NULL,
  atualizado_em  DATETIME      NOT NULL,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(fornecedor_id),
  FOREIGN KEY (contrato_id) REFERENCES contratos(contrato_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usos_linha (
  id              CHAR(36) PRIMARY KEY,
  linha_id        CHAR(36) NOT NULL,
  colaborador_id  CHAR(36) NOT NULL,
  status          ENUM('Ativa','Encerrada') NOT NULL DEFAULT 'Ativa',
  data_inicio     DATE     NOT NULL,
  data_fim        DATE     NULL,
  -- Uma pessoa por linha por vez.
  ativa_linha     CHAR(36) GENERATED ALWAYS AS (IF(status = 'Ativa', linha_id, NULL)) STORED,
  UNIQUE KEY uq_uso_ativo (ativa_linha),
  FOREIGN KEY (linha_id) REFERENCES linhas_telefonicas(id),
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
