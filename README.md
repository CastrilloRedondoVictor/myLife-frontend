# MyLife · Frontend

Interfaz web local para gestionar las finanzas personales y compartidas. El backend Node se encuentra en el directorio `backend/`.

## Stack y organización

- React 19, TypeScript, Vite 7.
- Apache ECharts (carga modular y diferida) para gráficos interactivos; Lucide para iconografía.
- `src/App.tsx`: sesión, selector de espacio, dashboard, gastos CoLife, liquidaciones, administración y formularios.
- `src/api.ts`: cliente HTTP tipado con cookies, CSRF y `x-space-id` para el contrato `/api` del backend.
- `src/types.ts`: tipos de respuesta y dominio consumidos.
- `src/styles.css`: diseño responsive, en español, EUR.

## Funcionalidad actual

- Resumen mensual de ingresos/gastos (separados en fijos y variables), saldo confirmado acumulado, desglose por categoría y pendientes.
- Inicio/cierre de sesión Google, espacios Personal/CoLife y administración de invitaciones, miembros, roles, archivo/restauración y auditoría.
- Registro y edición de gastos/repartos CoLife, cuotas Personales vinculadas, saldos y liquidaciones parciales.
- Alta de movimientos, búsqueda y filtros por tipo; confirmar movimientos fijos previstos y eliminarlos.
- Crear categorías de ingreso/gasto, reglas mensuales recurrentes (pausar/reactivar) y límites de presupuesto por categoría.
- La app pide al backend generar movimientos recurrentes pendientes al cargar; el backend garantiza que no se dupliquen.
- Gráfica mensual de líneas con los totales diarios confirmados de ingresos y gastos; el tooltip muestra ambos importes del día y se puede ampliar, restablecer o descargar.
- Desglose de gastos por categoría e historial de precios por supermercado y variante, con zoom y exportación.

El acceso requiere autenticación Google y la API mantiene el gate de datos cerrado hasta completar la preparación SQL manual. No publiques el servidor Vite en redes ni expongas el backend sin una revisión de despliegue.

## Desarrollo local

1. Instala Node.js 20.19–22.x y npm.
2. Configura e inicia el backend según su README. La URL del frontend debe coincidir exactamente con `FRONTEND_ORIGIN`; las credenciales de Google y la cadena de conexión se configuran solo localmente en backend.
3. En este repositorio, ejecuta `npm install`; copia `.env.example` a `.env` solo si necesitas cambiar la API.
4. Ejecuta `npm run dev` y abre `http://localhost:5173`. Inicia sesión con Google cuando el backend confirme que `TENANT_DATA_READY=true`.

Variables del frontend:

- `VITE_API_URL`: raíz de la API, por defecto `http://localhost:4000/api`. Usa el mismo hostname (`localhost`, sin mezclarlo con `127.0.0.1`) en frontend y API para que funcionen las cookies de sesión.

El backend permite CORS solo desde `FRONTEND_ORIGIN` (por defecto `http://localhost:5173`), valida CSRF en mutaciones y requiere `x-space-id` para rutas de negocio. Mantén coordinados ambos valores si cambias los puertos.

## Integración API

Se consumen `GET /dashboard?month=YYYY-MM`, categorías, movimientos paginados, reglas recurrentes, presupuestos y las operaciones de alta/confirmación/eliminación descritas en el README del backend. Los importes de movimientos pueden llegar como texto decimal JSON; la interfaz los convierte para visualización. Todas las fechas de formularios se envían como `YYYY-MM-DD`; los periodos como `YYYY-MM`.

Si aparece un error de autenticación o conexión, comprueba que las migraciones/backfill fueron revisadas y completadas localmente, que `TENANT_DATA_READY=true` solo después de la verificación final, que backend y frontend usan el mismo hostname y que `FRONTEND_ORIGIN` coincide exactamente. No apuntes la app de desarrollo a datos personales sin autorización.

## Comandos

- `npm run dev`: servidor Vite.
- `npm run build`: comprobación TypeScript y compilación de producción.
- `npm run preview`: previsualizar build local.
- `npm run typecheck`, `npm run lint`.

## Próximas fases posibles

Cuentas múltiples, objetivos más avanzados, exportación/importación y vistas de tendencias. La autorización y el aislamiento deben seguir aplicándose en el backend; ocultar datos en esta interfaz no es una medida de seguridad.