# MyLife · Frontend

Interfaz web local para gestionar las finanzas personales. Este repositorio GitHub es independiente del backend; la API Node se encuentra en el repositorio `myLife-backend`.

## Stack y organización

- React 19, TypeScript, Vite 7.
- Apache ECharts (carga modular y diferida) para gráficos interactivos; Lucide para iconografía.
- `src/App.tsx`: navegación, dashboard, pantallas de movimientos, reglas recurrentes y presupuestos, y formularios.
- `src/api.ts`: cliente HTTP tipado para el contrato `/api` del backend.
- `src/types.ts`: tipos de respuesta y dominio consumidos.
- `src/styles.css`: diseño responsive, en español, EUR.

## Funcionalidad actual

- Resumen mensual de ingresos/gastos (separados en fijos y variables), saldo confirmado acumulado, desglose por categoría y pendientes.
- Alta de movimientos, búsqueda y filtros por tipo; confirmar movimientos fijos previstos y eliminarlos.
- Crear categorías de ingreso/gasto, reglas mensuales recurrentes (pausar/reactivar) y límites de presupuesto por categoría.
- La app pide al backend generar movimientos recurrentes pendientes al cargar; el backend garantiza que no se dupliquen.
- Gráfica mensual de líneas con los totales diarios confirmados de ingresos y gastos; el tooltip muestra ambos importes del día y se puede ampliar, restablecer o descargar.
- Desglose de gastos por categoría e historial de precios por supermercado y variante, con zoom y exportación.

No hay login: la aplicación está pensada para desarrollo local y datos personales. No publiques el servidor Vite en redes ni expongas el backend sin añadir autenticación.

## Desarrollo local

1. Instala Node.js 20.19–22.x y npm.
2. Inicia el backend en su repositorio; crea `.env` desde su `.env.example`, aplica las migraciones de Azure SQL y carga categorías iniciales.
3. En este repositorio, ejecuta `npm install`; copia `.env.example` a `.env` si la API no está en la dirección por defecto.
4. Ejecuta `npm run dev` y abre la URL que muestre Vite (habitualmente `http://localhost:5173`).

Variables del frontend:

- `VITE_API_URL`: raíz de la API, por defecto `http://127.0.0.1:4000/api`.

El backend permite CORS solo desde `FRONTEND_ORIGIN` (por defecto `http://localhost:5173`). Mantén coordinados ambos valores si cambias los puertos.

## Integración API

Se consumen `GET /dashboard?month=YYYY-MM`, categorías, movimientos paginados, reglas recurrentes, presupuestos y las operaciones de alta/confirmación/eliminación descritas en el README del backend. Los importes de movimientos pueden llegar como texto decimal JSON; la interfaz los convierte para visualización. Todas las fechas de formularios se envían como `YYYY-MM-DD`; los periodos como `YYYY-MM`.

Si aparece un error de conexión, comprueba el estado de Azure SQL (puede estar reanudándose), que el backend escuche en `127.0.0.1:4000`, el firewall de Azure y la variable CORS.

## Comandos

- `npm run dev`: servidor Vite.
- `npm run build`: comprobación TypeScript y compilación de producción.
- `npm run preview`: previsualizar build local.
- `npm run typecheck`, `npm run lint`.

## Próximas fases posibles

Autenticación y espacio de hogar compartido, cuentas múltiples, objetivos más avanzados, exportación/importación y vistas de tendencias. Al añadir login, el backend debe aplicar autorización por usuario; ocultar datos en esta interfaz no es una medida de seguridad.