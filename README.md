# Banco Horizonte – Simulador Bancario Web

Aplicación web que simula las funciones básicas de un banco con **tres módulos integrados** que trabajan sobre la **misma base de datos MySQL**:

| Módulo | URL | Quién lo usa |
|---|---|---|
| Banca virtual | `http://localhost:3000/login.html` | Clientes |
| Panel administrativo | `http://localhost:3000/login.html?modo=admin` | Administradores |
| Cajero automático | `http://localhost:3000/cajero.html` | Clientes (número de cuenta + PIN) |

Cualquier operación hecha en un módulo (retiro en el cajero, consignación del administrador, transferencia en la banca virtual) se guarda en MySQL y se ve de inmediato en los otros dos.

## Integrantes

| Nombre | Rol / aporte |
|---|---|
| _Integrante 1_ | |
| _Integrante 2_ | |
| _Integrante 3_ | |

## Tecnologías utilizadas

- **Backend:** Node.js 18+ y Express 4
- **Base de datos:** MySQL 8 (driver `mysql2` con pool de conexiones y transacciones)
- **Sesiones:** `express-session` (cookie `httpOnly`, expira a los 30 min de inactividad)
- **Seguridad:** `bcryptjs` para contraseñas y PIN, `dotenv` para variables de entorno
- **Frontend:** HTML5, CSS3, JavaScript (sin frameworks), Bootstrap 5.3 y Bootstrap Icons (servidos localmente desde `node_modules`, funciona sin Internet)

## Requisitos para ejecutar el proyecto

- [Node.js](https://nodejs.org/) 18 o superior (incluye npm)
- [MySQL Server](https://dev.mysql.com/downloads/) 8.0.16 o superior (o MariaDB 10.5+). Opcional: MySQL Workbench

## Instalación

```bash
# 1. Entrar a la carpeta del proyecto
cd Banco

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno
#    (Windows)  copy .env.example .env
#    (Linux/Mac) cp .env.example .env
```

Edite `.env` con los datos de su MySQL:

```env
PORT=3000
SESSION_SECRET=una_cadena_larga_y_aleatoria
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=su_contraseña_de_mysql
DB_NAME=banco_horizonte
```

## Configuración de la base de datos

El archivo [`database/database.sql`](database/database.sql) crea la base `banco_horizonte` con tablas, llaves primarias y foráneas, restricciones `CHECK`, triggers y datos de prueba. **Si la base ya existe, la elimina y la vuelve a crear.**

Elija una de estas opciones:

- **Opción A – con npm (recomendada, no requiere el cliente mysql):**
  ```bash
  npm run db:init
  ```
- **Opción B – desde la terminal:**
  ```bash
  mysql -u root -p < database/database.sql
  ```
- **Opción C – MySQL Workbench:** *File → Open SQL Script…* → `database/database.sql` → ejecutar (⚡).

Modelo de datos:

| Tabla | Descripción |
|---|---|
| `usuarios` | Clientes y administradores (rol, estado ACTIVO / INACTIVO / BLOQUEADO, contraseña cifrada) |
| `cuentas` | Cuentas de ahorros o corriente, saldo (nunca negativo) y PIN cifrado |
| `movimientos` | Historial inmutable: fecha, tipo, canal, descripción, valor y saldo resultante |
| `transferencias` | Cabecera de cada transferencia (origen, destino, valor); genera dos movimientos |

El diagrama está en [`database/diagrama-bd.png`](database/diagrama-bd.png) y en formato Mermaid en [`database/diagrama-bd.md`](database/diagrama-bd.md).

## Ejecutar el sistema

```bash
npm start        # modo normal
npm run dev      # modo desarrollo (se reinicia al guardar cambios, usa nodemon)
```

Abra **http://localhost:3000** en el navegador.

## Usuarios de prueba

**Administrador**

| Usuario | Contraseña |
|---|---|
| `admin@bancohorizonte.com` | `Admin123*` |

**Clientes**: todos usan la contraseña `Cliente123*`. Pueden ingresar con el correo o con el número de documento.

| Cliente | Correo | Documento | Cuenta | Tipo | Saldo inicial | PIN cajero | Estado |
|---|---|---|---|---|---|---|---|
| Laura Gómez | laura.gomez@correo.com | 1020304050 | 4001000001 | Ahorros | $1.000.000 | 1234 | Activo |
| Laura Gómez | | | 5001000002 | Corriente | $350.000 | 5678 | Activo |
| Carlos Ramírez | carlos.ramirez@correo.com | 1030405060 | 4001000003 | Ahorros | $2.500.000 | 4321 | Activo |
| Ana Martínez | ana.martinez@correo.com | 1040506070 | 4001000004 | Ahorros | $180.000 | 2468 | Activo |
| Pedro Rojas | pedro.rojas@correo.com | 1050607080 | 4001000005 | Ahorros | $50.000 | 1357 | **Bloqueado** |

Pedro está bloqueado a propósito, para demostrar que un cliente o cuenta bloqueada no puede iniciar sesión ni operar.

## Principales funcionalidades

### Banca virtual (cliente)
- Inicio y cierre de sesión (correo o documento + contraseña).
- Tarjetas con número, tipo de cuenta y saldo disponible.
- Historial de movimientos con fecha, tipo, descripción, canal, valor y saldo resultante; filtros por tipo y fechas.
- Transferencias a cualquier cuenta registrada: se verifica el titular, se pide confirmación y se muestra un comprobante.
- Consulta de información personal y edición de correo, teléfono, dirección y ciudad.
- Cambio de contraseña (pide la contraseña actual).
- El cliente **no puede** modificar saldo, número de cuenta, rol, estado ni movimientos: la API no ofrece esas operaciones.

### Panel administrativo
- Dashboard: total de clientes, clientes activos, clientes bloqueados, cuentas activas, suma total de saldos, operaciones del día y actividad reciente.
- Crear clientes con su primera cuenta, PIN y consignación inicial opcional.
- Listar y buscar clientes por nombre, documento, correo o número de cuenta; filtrar por estado.
- Ver el detalle de un cliente (datos, cuentas, últimos movimientos) y editar su información.
- Habilitar, inactivar o bloquear clientes y cuentas (sin borrar nada de la base de datos).
- Restablecer la contraseña, cambiar el PIN y abrir cuentas adicionales.
- Consultar todas las cuentas con su saldo.
- Realizar consignaciones.
- Historial general de movimientos con filtros por cuenta, tipo, canal y fechas.

### Cajero automático
- Identificación con número de cuenta + PIN (teclado en pantalla o teclado físico).
- Consulta de saldo, retiros (montos rápidos u otro valor) y últimos 5 movimientos.
- Al retirar: disminuye el saldo, se registra el movimiento “Retiro cajero” y se muestra el nuevo saldo.
- Tres intentos fallidos de PIN bloquean la cuenta (el administrador la puede habilitar de nuevo).
- La operación se cierra sola después de 3 minutos sin actividad.

## Reglas de negocio y seguridad

| Regla | Dónde se aplica |
|---|---|
| Contraseñas y PIN cifrados con bcrypt | `usuarios.password_hash`, `cuentas.pin_hash` |
| Credenciales de la BD en variables de entorno | `.env` (excluido por `.gitignore`) |
| Validación en frontend **y** en backend | HTML5 + `src/utils/validaciones.js` |
| Un cliente solo ve sus propias cuentas | Todas las consultas filtran por el `id` de la sesión |
| No se opera con valores ≤ 0 | Backend + `CHECK` en MySQL |
| No se retira ni transfiere más del saldo | Backend + `CHECK (saldo >= 0)` |
| Una cuenta o cliente bloqueado no puede operar | Backend (`verificarOperable`) y en el login |
| Cada consignación, retiro y transferencia genera movimientos | `src/services/operaciones.js` |
| Los movimientos no se pueden eliminar ni modificar | La API no lo permite y hay triggers en MySQL |
| El saldo solo cambia en el backend | Transacciones con `SELECT … FOR UPDATE`, evitan inconsistencias con operaciones simultáneas |
| Los datos se conservan al reiniciar el servidor | Todo se guarda en MySQL |

## Prueba mínima de funcionamiento (demostración)

1. Ingrese a la banca virtual como **Laura** → saldo de la cuenta 4001000001: **$1.000.000**.
2. Abra el **cajero** (puede ser en otra pestaña) → cuenta `4001000001`, PIN `1234`.
3. Retire **$200.000**.
4. El cajero muestra el nuevo saldo: **$800.000**.
5. Vuelva a la banca virtual (recargue la página) → saldo **$800.000** y el movimiento **Retiro cajero −$200.000**.
6. En otra ventana (o en modo incógnito), ingrese como **administrador** → *Cuentas* → la cuenta 4001000001 muestra **$800.000**.
7. *Consignaciones* → consigne **$300.000** a la cuenta 4001000001.
8. El cliente recarga la banca virtual → saldo **$1.100.000** y el movimiento de consignación.

> Use una ventana de incógnito o un navegador diferente para tener abiertas a la vez la sesión del cliente y la del administrador, porque comparten la misma cookie de sesión.

## Estructura del proyecto

```
Banco/
├── database/
│   ├── database.sql          # Script de creación + datos de prueba
│   ├── diagrama-bd.png       # Diagrama entidad-relación
│   └── diagrama-bd.md        # Diagrama en Mermaid + restricciones
├── public/                   # Frontend
│   ├── index.html            # Portada con los tres módulos
│   ├── login.html            # Login de clientes y administradores
│   ├── banca.html            # Banca virtual
│   ├── admin.html            # Panel administrativo
│   ├── cajero.html           # Cajero automático
│   ├── css/styles.css
│   └── js/ (comun.js, login.js, banca.js, admin.js, cajero.js)
├── scripts/init-db.js        # npm run db:init
├── src/
│   ├── server.js             # Punto de entrada
│   ├── app.js                # Configuración de Express
│   ├── config/db.js          # Pool MySQL y transacciones
│   ├── middlewares/auth.js   # Autenticación y roles
│   ├── routes/               # auth, cliente, admin, cajero
│   ├── services/operaciones.js  # Consignar, retirar, transferir
│   └── utils/                # Validaciones y errores
├── .env.example
├── .gitignore
└── package.json
```

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Sesión de cliente/administrador |
| GET | `/api/cliente/cuentas` · `/api/cliente/cuentas/:id/movimientos` | Cuentas y movimientos propios |
| POST | `/api/cliente/transferencias` | Transferir |
| GET/PUT | `/api/cliente/perfil` · PUT `/api/cliente/password` | Perfil y contraseña |
| GET | `/api/admin/dashboard` · `/api/admin/clientes` · `/api/admin/cuentas` · `/api/admin/movimientos` | Consultas administrativas |
| POST/PUT/PATCH | `/api/admin/clientes[/:id][/estado]` | Crear, editar, habilitar o bloquear |
| POST | `/api/admin/consignaciones` | Consignar |
| POST | `/api/cajero/ingresar` · `/api/cajero/retiro` · `/api/cajero/salir` | Cajero |
| GET | `/api/cajero/saldo` · `/api/cajero/movimientos` | Cajero |

## Git y GitHub

El repositorio incluye un `.gitignore` que excluye `node_modules/` y `.env`. Para subirlo:

```bash
git init
git add .
git commit -m "Estructura inicial del simulador bancario"
git branch -M main
git remote add origin https://github.com/USUARIO/banco-horizonte.git
git push -u origin main
```

Recuerde agregar a todos los integrantes como colaboradores y hacer commits a lo largo del desarrollo, no uno solo al final.
