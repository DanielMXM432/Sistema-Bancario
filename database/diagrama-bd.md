# Diagrama entidad–relación – Banco Horizonte

Imagen: [`diagrama-bd.png`](diagrama-bd.png). El siguiente diagrama Mermaid se visualiza directamente en GitHub y en VS Code (con la extensión *Markdown Preview Mermaid Support*).

```mermaid
erDiagram
    USUARIOS ||--o{ CUENTAS : "es titular de"
    CUENTAS ||--o{ MOVIMIENTOS : "registra"
    CUENTAS ||--o{ TRANSFERENCIAS : "origen"
    CUENTAS ||--o{ TRANSFERENCIAS : "destino"
    TRANSFERENCIAS |o--o{ MOVIMIENTOS : "genera (2)"
    USUARIOS |o--o{ MOVIMIENTOS : "realizado por"
    USUARIOS ||--o{ TRANSFERENCIAS : "realizada por"

    USUARIOS {
        INT id PK
        ENUM tipo_documento "CC, CE, TI, PASAPORTE"
        VARCHAR documento UK
        VARCHAR nombres
        VARCHAR apellidos
        VARCHAR email UK
        VARCHAR telefono
        VARCHAR direccion
        VARCHAR ciudad
        VARCHAR password_hash "bcrypt"
        ENUM rol "ADMIN, CLIENTE"
        ENUM estado "ACTIVO, INACTIVO, BLOQUEADO"
        DATETIME ultimo_acceso
        DATETIME fecha_creacion
        DATETIME fecha_actualizacion
    }

    CUENTAS {
        INT id PK
        CHAR numero_cuenta UK "10 digitos"
        INT usuario_id FK
        ENUM tipo "AHORROS, CORRIENTE"
        DECIMAL saldo "CHECK saldo >= 0"
        VARCHAR pin_hash "bcrypt"
        TINYINT intentos_pin_fallidos
        ENUM estado "ACTIVO, INACTIVO, BLOQUEADO"
        DATETIME fecha_apertura
    }

    TRANSFERENCIAS {
        INT id PK
        INT cuenta_origen_id FK
        INT cuenta_destino_id FK
        DECIMAL valor "CHECK valor > 0"
        VARCHAR descripcion
        INT realizado_por FK
        DATETIME fecha
    }

    MOVIMIENTOS {
        INT id PK
        INT cuenta_id FK
        ENUM tipo "CONSIGNACION, RETIRO_CAJERO, TRANSFERENCIA_ENVIADA, TRANSFERENCIA_RECIBIDA"
        ENUM canal "BANCA_VIRTUAL, CAJERO, OFICINA"
        VARCHAR descripcion
        DECIMAL valor "+ ingreso / - egreso"
        DECIMAL saldo_resultante
        INT transferencia_id FK "NULL si no es transferencia"
        INT realizado_por FK
        DATETIME fecha
    }
```

## Restricciones y reglas implementadas en la base de datos

| Regla | Implementación |
|---|---|
| Documento y correo únicos | `UNIQUE (documento)`, `UNIQUE (email)` en `usuarios` |
| Número de cuenta único de 10 dígitos | `UNIQUE (numero_cuenta)` + `CHECK (numero_cuenta REGEXP '^[0-9]{10}$')` |
| El saldo nunca es negativo | `CHECK (saldo >= 0)` en `cuentas` |
| No hay operaciones con valores ≤ 0 | `CHECK (valor > 0)` en `transferencias`, `CHECK (valor <> 0)` en `movimientos` |
| No se transfiere a la misma cuenta | `CHECK (cuenta_origen_id <> cuenta_destino_id)` |
| No se eliminan clientes ni cuentas con historial | Llaves foráneas con `ON DELETE RESTRICT`; los clientes se manejan con `estado` |
| Los movimientos no se modifican ni eliminan | Triggers `trg_movimientos_no_update` y `trg_movimientos_no_delete` (igual para `transferencias`) |
| Contraseñas y PIN no se guardan en texto plano | Columnas `password_hash` y `pin_hash` con bcrypt |
