# Flujo de caja y banquito

Aplicación web para registrar ingresos y egresos, controlar cuentas, cobros y pagos, presupuestos, proyección de caja y administrar un **banquito** (socios, ahorro semanal, préstamos, balance y devoluciones).

Diseñado por [Gaver Studio](https://gaverstudio.com/). Interfaz pensada para computador.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| Panel | Saldo, ingresos, egresos y flujo neto del mes, gráfico de 6 meses, alertas, vencimientos y últimos movimientos |
| Movimientos | Libro con filtros y saldo acumulado. Ingreso, egreso y transferencia. Se corrige anulando (queda el historial) |
| Cuentas | Cajas, bancos y billeteras con saldo inicial y transferencias internas |
| Cobros y pagos | Cuentas por cobrar y por pagar, con pagos parciales y vencimientos |
| Presupuestos | Límite por categoría y mes, gastado, comprometido y restante |
| Proyección | Saldo futuro con movimientos programados y vencimientos, con escenarios de cobro |
| Reportes | Por período, categoría, mes y cuenta. Excel, CSV e impresión a PDF |
| Banquito | Registro semanal, socios, balance (solo semana / hasta la semana), devoluciones a socios, importación de tu Excel |
| Administración | Usuarios, accesos por flujo (administra / registra / solo consulta), categorías, historial de cambios |

Cada **flujo de caja** es independiente. Un usuario solo ve los flujos que se le asignan.

## Poner la app en línea (GitHub + Hostinger)

### 1. Subir a GitHub
1. Crea un repositorio nuevo (privado) en github.com.
2. Sube **el contenido de esta carpeta**: `server.js`, `package.json`, `package-lock.json`, `src/`, `public/`, `scripts/`, `README.md`, `.gitignore`, `.env.example`.
3. **No subas** `.env`, `node_modules` ni archivos Excel con datos de socios.

### 2. Base de datos (MongoDB Atlas)
En Atlas, **Network Access**: Hostinger no tiene una IP fija, así que agrega `0.0.0.0/0` (permitir desde cualquier lugar). Por eso la contraseña del usuario de la base debe ser larga y secreta.

### 3. Hostinger
1. hPanel → **Sitios web** → **Agregar sitio web** → **Aplicación web Node.js** → **Importar repositorio de Git** y conecta tu GitHub.
2. Configuración de compilación: framework **Express.js**, versión de Node **20 o 22**, comando de inicio `npm start`, archivo de entrada `server.js`.
3. En **Variables de entorno** agrega las de `.env.example` con tus valores reales.
4. Despliega. Abre tu dominio e ingresa con el usuario y contraseña de `ADMIN_USER` y `ADMIN_PASSWORD`.

Cada vez que subas cambios a GitHub, vuelve a desplegar desde Hostinger.

### 4. Cargar tu banquito
Ingresa → **Flujos de caja** → **Nuevo flujo** (tipo *Banquito*) → **Configuración → Banquito → Importar** y elige tu archivo `BANQUITO_2025-1.xlsm`.

## Trabajar en tu computador
```bash
npm install
cp .env.example .env     # completa los valores
npm start                # http://localhost:3000
```

## Si olvidas la contraseña del administrador
```bash
npm run reset-clave -- Maribel NuevaClave123
```
(con el `.env` configurado en tu computador).

## Seguridad incluida
Contraseñas con bcrypt, sesión en cookie `httpOnly`, permisos verificados en el servidor, límite de intentos de acceso, cabeceras de seguridad (helmet), protección contra solicitudes de otros sitios, y registro de quién hizo cada cambio.

## Fuera de esta versión
Adjuntar archivos de comprobantes (hoy se guarda el número), conciliación bancaria, varias monedas con tipo de cambio, facturación electrónica y modo multiempresa con autoservicio.
