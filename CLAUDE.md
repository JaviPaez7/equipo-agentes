@AGENTS.md

# Equipo de agentes

- Arquitectura, variables de entorno y puesta en marcha: `README.md`.
- Cada turno de agente es un paso de `workflows/agent-team.ts`. Los pasos deben ser idempotentes: Workflows puede reintentarlos.
- Las conversaciones de los agentes son solo de añadir: no reescribas ni recortes mensajes anteriores, porque se invalidarían el razonamiento y la caché de prompts.
- Antes de dar algo por hecho: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
- Nunca escribas claves ni contraseñas en el repositorio; van en `.env.local` (ignorado) o en Vercel.
