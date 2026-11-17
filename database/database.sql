-- =====================================================================
--  Banco Horizonte - Simulador Bancario Web
--  Script de creación de la base de datos (MySQL 8.0.16+)
--
--  Crea la base de datos, las tablas, relaciones, restricciones,
--  triggers de protección y los datos de prueba.
--
--  ATENCIÓN: elimina y vuelve a crear la base de datos banco_horizonte.
-- =====================================================================

DROP DATABASE IF EXISTS banco_horizonte;
CREATE DATABASE banco_horizonte
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE banco_horizonte;

-- ---------------------------------------------------------------------
--  Tabla: usuarios
--  Clientes y administradores del banco. Nunca se eliminan físicamente:
--  se manejan con el campo estado (ACTIVO / INACTIVO / BLOQUEADO).
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  tipo_documento   ENUM('CC','CE','TI','PASAPORTE') NOT NULL DEFAULT 'CC',
  documento        VARCHAR(20)   NOT NULL,
  nombres          VARCHAR(80)   NOT NULL,
  apellidos        VARCHAR(80)   NOT NULL,
  email            VARCHAR(120)  NOT NULL,
  telefono         VARCHAR(20)   NULL,
  direccion        VARCHAR(150)  NULL,
  ciudad           VARCHAR(80)   NULL,
  password_hash    VARCHAR(255)  NOT NULL,
  rol              ENUM('ADMIN','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  estado           ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  ultimo_acceso    DATETIME      NULL,
  fecha_creacion   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pk_usuarios PRIMARY KEY (id),
  CONSTRAINT uq_usuarios_documento UNIQUE (documento),
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT ck_usuarios_documento CHECK (CHAR_LENGTH(documento) >= 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  Tabla: cuentas
--  Cuentas bancarias. El saldo nunca puede ser negativo.
--  El PIN del cajero se guarda cifrado (bcrypt).
-- ---------------------------------------------------------------------
CREATE TABLE cuentas (
  id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  numero_cuenta          CHAR(10)      NOT NULL,
  usuario_id             INT UNSIGNED  NOT NULL,
  tipo                   ENUM('AHORROS','CORRIENTE') NOT NULL DEFAULT 'AHORROS',
  saldo                  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  pin_hash               VARCHAR(255)  NOT NULL,
  intentos_pin_fallidos  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estado                 ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  fecha_apertura         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_cuentas PRIMARY KEY (id),
  CONSTRAINT uq_cuentas_numero UNIQUE (numero_cuenta),
  CONSTRAINT fk_cuentas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_cuentas_saldo CHECK (saldo >= 0),
  CONSTRAINT ck_cuentas_numero CHECK (numero_cuenta REGEXP '^[0-9]{10}$')
) ENGINE=InnoDB;

CREATE INDEX idx_cuentas_usuario ON cuentas (usuario_id);

-- ---------------------------------------------------------------------
--  Tabla: transferencias
--  Cabecera de cada transferencia entre dos cuentas del banco.
--  Cada transferencia genera dos movimientos (uno en cada cuenta).
-- ---------------------------------------------------------------------
CREATE TABLE transferencias (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cuenta_origen_id   INT UNSIGNED  NOT NULL,
  cuenta_destino_id  INT UNSIGNED  NOT NULL,
  valor              DECIMAL(15,2) NOT NULL,
  descripcion        VARCHAR(150)  NULL,
  realizado_por      INT UNSIGNED  NOT NULL,
  fecha              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_transferencias PRIMARY KEY (id),
  CONSTRAINT fk_transf_origen FOREIGN KEY (cuenta_origen_id)
    REFERENCES cuentas (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_transf_destino FOREIGN KEY (cuenta_destino_id)
    REFERENCES cuentas (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_transf_usuario FOREIGN KEY (realizado_por)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_transf_valor CHECK (valor > 0),
  CONSTRAINT ck_transf_cuentas CHECK (cuenta_origen_id <> cuenta_destino_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  Tabla: movimientos
--  Registro inmutable de cada operación financiera.
--  valor: positivo = ingreso, negativo = egreso.
--  saldo_resultante: saldo de la cuenta inmediatamente después.
-- ---------------------------------------------------------------------
CREATE TABLE movimientos (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cuenta_id          INT UNSIGNED  NOT NULL,
  tipo               ENUM('CONSIGNACION','RETIRO_CAJERO','TRANSFERENCIA_ENVIADA','TRANSFERENCIA_RECIBIDA') NOT NULL,
  canal              ENUM('BANCA_VIRTUAL','CAJERO','OFICINA') NOT NULL,
  descripcion        VARCHAR(150)  NOT NULL,
  valor              DECIMAL(15,2) NOT NULL,
  saldo_resultante   DECIMAL(15,2) NOT NULL,
  transferencia_id   INT UNSIGNED  NULL,
  realizado_por      INT UNSIGNED  NULL,
  fecha              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_movimientos PRIMARY KEY (id),
  CONSTRAINT fk_mov_cuenta FOREIGN KEY (cuenta_id)
    REFERENCES cuentas (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_mov_transferencia FOREIGN KEY (transferencia_id)
    REFERENCES transferencias (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_mov_usuario FOREIGN KEY (realizado_por)
    REFERENCES usuarios (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_mov_valor CHECK (valor <> 0),
  CONSTRAINT ck_mov_saldo CHECK (saldo_resultante >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_mov_cuenta_fecha ON movimientos (cuenta_id, fecha);
CREATE INDEX idx_mov_fecha ON movimientos (fecha);

-- ---------------------------------------------------------------------
--  Triggers: los movimientos y transferencias no se pueden modificar
--  ni eliminar (regla de negocio: historial financiero inmutable).
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_movimientos_no_update BEFORE UPDATE ON movimientos
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los movimientos financieros no se pueden modificar';

CREATE TRIGGER trg_movimientos_no_delete BEFORE DELETE ON movimientos
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los movimientos financieros no se pueden eliminar';

CREATE TRIGGER trg_transferencias_no_update BEFORE UPDATE ON transferencias
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las transferencias no se pueden modificar';

CREATE TRIGGER trg_transferencias_no_delete BEFORE DELETE ON transferencias
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las transferencias no se pueden eliminar';

-- =====================================================================
--  DATOS DE PRUEBA
--  Contraseñas y PIN cifrados con bcrypt (10 rondas).
--    Administrador:  admin@bancohorizonte.com      / Admin123*
--    Clientes:       (correo o documento)           / Cliente123*
--  PIN de cajero por cuenta: ver README.md
-- =====================================================================

INSERT INTO usuarios (id, tipo_documento, documento, nombres, apellidos, email, telefono, direccion, ciudad, password_hash, rol, estado, fecha_creacion) VALUES
  (1, 'CC', '1000000001', 'Mauricio', 'Administrador', 'admin@bancohorizonte.com', '6015550000', 'Cra. 7 # 32-10', 'Bogotá',
      '$2a$10$V9SKkG6.WTvCmOBQ2g1z3Oz9fo/SZ2ZTZCzMg21mRySzaGNmJ6Z2q', 'ADMIN', 'ACTIVO', '2026-09-01 08:00:00'),
  (2, 'CC', '1020304050', 'Laura', 'Gómez Restrepo', 'laura.gomez@correo.com', '3001234567', 'Calle 45 # 12-30', 'Medellín',
      '$2a$10$PLcJvpqxcyM4YM7IMb6ueOkrULuuv7bNDEzZnBR9eVk2Wx4xeMALC', 'CLIENTE', 'ACTIVO', '2026-10-01 09:00:00'),
  (3, 'CC', '1030405060', 'Carlos', 'Ramírez Ortiz', 'carlos.ramirez@correo.com', '3109876543', 'Av. 30 de Agosto # 40-55', 'Pereira',
      '$2a$10$PLcJvpqxcyM4YM7IMb6ueOkrULuuv7bNDEzZnBR9eVk2Wx4xeMALC', 'CLIENTE', 'ACTIVO', '2026-10-01 09:30:00'),
  (4, 'CC', '1040506070', 'Ana', 'Martínez Lozano', 'ana.martinez@correo.com', '3204567890', 'Cra. 15 # 80-21', 'Bogotá',
      '$2a$10$PLcJvpqxcyM4YM7IMb6ueOkrULuuv7bNDEzZnBR9eVk2Wx4xeMALC', 'CLIENTE', 'ACTIVO', '2026-10-02 10:00:00'),
  (5, 'CC', '1050607080', 'Pedro', 'Rojas Díaz', 'pedro.rojas@correo.com', '3157654321', 'Calle 10 # 5-15', 'Cali',
      '$2a$10$PLcJvpqxcyM4YM7IMb6ueOkrULuuv7bNDEzZnBR9eVk2Wx4xeMALC', 'CLIENTE', 'BLOQUEADO', '2026-10-03 11:00:00');

INSERT INTO cuentas (id, numero_cuenta, usuario_id, tipo, saldo, pin_hash, estado, fecha_apertura) VALUES
  (1, '4001000001', 2, 'AHORROS',   1000000.00, '$2a$10$yO4zQ76vBwcj3UUIXKTx.OnVjCfi.zYytoaK.L88tquppEJIqs9tW', 'ACTIVO',    '2026-10-01 09:05:00'),
  (2, '5001000002', 2, 'CORRIENTE',  350000.00, '$2a$10$k/MhooD5uyoHloZ/d8JeJubgW7jjkG1uZHnyBkTNea7o0NFz.Xsgi', 'ACTIVO',    '2026-10-01 09:10:00'),
  (3, '4001000003', 3, 'AHORROS',   2500000.00, '$2a$10$u39xH46jZuSA62HcgqOBQerRwiYfYiRvgwW39noW64R6fEGtlDiPm', 'ACTIVO',    '2026-10-01 09:35:00'),
  (4, '4001000004', 4, 'AHORROS',    180000.00, '$2a$10$Y6xnHCtlkh4lP3W3zEEaDeJiM4k6z/Mu6OMu3lMr7dFkDK/SjMs9G', 'ACTIVO',    '2026-10-02 10:05:00'),
  (5, '4001000005', 5, 'AHORROS',     50000.00, '$2a$10$VUVjlnJmpy6vdYstRH7Fd.zd8PHFbZKrKy57FYaA4ULFFcJx6AY7W', 'BLOQUEADO', '2026-10-03 11:05:00');

INSERT INTO transferencias (id, cuenta_origen_id, cuenta_destino_id, valor, descripcion, realizado_por, fecha) VALUES
  (1, 1, 4, 150000.00, 'Pago arriendo compartido', 2, '2026-10-12 18:20:00'),
  (2, 3, 1,  50000.00, 'Devolución préstamo',      3, '2026-10-20 12:45:00');

INSERT INTO movimientos (cuenta_id, tipo, canal, descripcion, valor, saldo_resultante, transferencia_id, realizado_por, fecha) VALUES
  -- Laura - Ahorros 4001000001
  (1, 'CONSIGNACION',           'OFICINA',       'Consignación inicial de apertura',           1200000.00, 1200000.00, NULL, 1, '2026-10-01 09:06:00'),
  (1, 'RETIRO_CAJERO',          'CAJERO',        'Retiro cajero',                               -100000.00, 1100000.00, NULL, 2, '2026-10-05 17:40:00'),
  (1, 'TRANSFERENCIA_ENVIADA',  'BANCA_VIRTUAL', 'Transferencia a cuenta 4001000004 - Pago arriendo compartido', -150000.00, 950000.00, 1, 2, '2026-10-12 18:20:00'),
  (1, 'TRANSFERENCIA_RECIBIDA', 'BANCA_VIRTUAL', 'Transferencia de cuenta 4001000003 - Devolución préstamo',       50000.00, 1000000.00, 2, 3, '2026-10-20 12:45:00'),
  -- Laura - Corriente 5001000002
  (2, 'CONSIGNACION',           'OFICINA',       'Consignación inicial de apertura',            350000.00,  350000.00, NULL, 1, '2026-10-01 09:11:00'),
  -- Carlos - Ahorros 4001000003
  (3, 'CONSIGNACION',           'OFICINA',       'Consignación inicial de apertura',           2000000.00, 2000000.00, NULL, 1, '2026-10-01 09:36:00'),
  (3, 'CONSIGNACION',           'OFICINA',       'Consignación en oficina',                     600000.00, 2600000.00, NULL, 1, '2026-10-08 10:15:00'),
  (3, 'TRANSFERENCIA_ENVIADA',  'BANCA_VIRTUAL', 'Transferencia a cuenta 4001000001 - Devolución préstamo',       -50000.00, 2550000.00, 2, 3, '2026-10-20 12:45:00'),
  (3, 'RETIRO_CAJERO',          'CAJERO',        'Retiro cajero',                                -50000.00, 2500000.00, NULL, 3, '2026-10-25 08:30:00'),
  -- Ana - Ahorros 4001000004
  (4, 'CONSIGNACION',           'OFICINA',       'Consignación inicial de apertura',             30000.00,   30000.00, NULL, 1, '2026-10-02 10:06:00'),
  (4, 'TRANSFERENCIA_RECIBIDA', 'BANCA_VIRTUAL', 'Transferencia de cuenta 4001000001 - Pago arriendo compartido', 150000.00, 180000.00, 1, 2, '2026-10-12 18:20:00'),
  -- Pedro - Ahorros 4001000005 (cliente bloqueado)
  (5, 'CONSIGNACION',           'OFICINA',       'Consignación inicial de apertura',             50000.00,   50000.00, NULL, 1, '2026-10-03 11:06:00');
