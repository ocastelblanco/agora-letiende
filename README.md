<hr>

<div align="center">

<h1 align="center">Ágora</h1>

</div>

<pre align="center">Boletería para los espectáculos del teatro de Le Tiende</pre>

![Status](https://img.shields.io/badge/estado-en%20producción-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) [![SLIM](https://img.shields.io/badge/Best%20Practices%20from-SLIM-blue)](https://nasa-ammos.github.io/slim/)

Ágora es la aplicación de boletería del centro cultural **Le Tiende** (Bogotá, Colombia), en producción en [**agora.letiende.co**](https://agora.letiende.co). Permite al `cliente` comprar boletas para un evento sin necesidad de crear cuenta, al `productor` validar comprobantes de pago y ver el estado de venta de su evento, y al `portero` validar el ingreso en la puerta escaneando el código QR de cada boleta. El `administrador` crea y edita los eventos, y gestiona el equipo con acceso al sistema.

El objetivo es reemplazar el proceso manual —conversaciones de WhatsApp, comprobantes revisados a mano, listas de asistentes dispersas y validación de entrada leyendo nombres en papel— por un flujo digital de punta a punta, sin sobreventa y sin sobrecargar de trabajo simultáneo al equipo de Le Tiende.

[PRD](docs/PRD.md) | [Especificaciones técnicas](docs/tech-specs.md) | [Roadmap v2/v3 (no técnico)](docs/roadmap-v2-v3.md) | [TODO / roadmap activo](docs/TODO.md) | [Memoria de proyecto](docs/MEMORY.md)

## Features

* Cartelera pública de eventos, sin necesidad de autenticación, indexable vía SSR, con código QR descargable para afiches
* Compra de boletas con reserva temporal de sillas (sin sobreventa) y carga de comprobante de pago, con liberación activa de reservas vencidas
* Aprobación de comprobantes por el productor, con emisión automática de boletas digitales
* Boleta digital con código QR único, entregada por correo
* Validación de boletas en la puerta por escaneo de QR, con veredicto claro (válida / usada / inexistente / de otro evento)
* Venta en efectivo desde la puerta o presencial
* Etapas de boletería (preventa, taquilla, etc.) con cierre automático por fecha
* Panel de control del evento (vendidas, disponibles, ingresados) con exportación de reportes en Excel
* Gestión de usuarios y roles propios de Ágora (`administrador` / `productor` / `portero`), autorización por evento asignado
* Autenticación con Google (Firebase Authentication), proyecto compartido con Comandante y Babel

Lo que sigue después de v1 — pago automático con Bold, notificaciones por WhatsApp, exportación en PDF, sincronización con Google Calendar — está descrito para audiencia no técnica en [`docs/roadmap-v2-v3.md`](docs/roadmap-v2-v3.md).

## Estado del proyecto

**Ágora está en producción** desde el 14 de agosto de 2026, en [`agora.letiende.co`](https://agora.letiende.co). El ciclo completo de un evento (crear, vender, cobrar, emitir boleta, validar en puerta) funciona de punta a punta. La documentación de producto y arquitectura está en [`docs/PRD.md`](docs/PRD.md) y [`docs/tech-specs.md`](docs/tech-specs.md); el estado detallado y las decisiones tomadas en el camino están en [`docs/MEMORY.md`](docs/MEMORY.md). Las tareas activas (si las hay) están en [`docs/TODO.md`](docs/TODO.md) — el proyecto puede quedar sin una tarea activa mientras se espera retroalimentación real de uso antes de priorizar lo que sigue.

## Contents

* [Stack tecnológico](#stack-tecnológico)
* [Quick Start](#quick-start)
* [Seguridad y costos](#seguridad-y-costos)
* [Contributing](#contributing)
* [License](#license)
* [Support](#support)

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22.x (standalone components, Signals, SSR con `@angular/ssr`) |
| UI | Angular Material 22.x + Tailwind CSS 4.x, tema Material 3 propio con la paleta de Le Tiende |
| Backend | Node.js 24.x en AWS Lambda + API Gateway (IaC con Serverless Framework 4) |
| Base de datos | AWS DynamoDB (`PAY_PER_REQUEST` siempre — ver `CLAUDE.md`) |
| Autenticación | Google Firebase Authentication (proyecto compartido con Comandante y Babel, roles independientes) |
| Correo | AWS SES, desde `taquilla@letiende.co` |
| Código QR | Generación en servidor + `@zxing/browser` para el escaneo en puerta |
| Costo de infraestructura objetivo | **< US$1/mes**, medido — ver `docs/advertencia-urgente-costos-aws.md` |

Ver el detalle completo en [`docs/tech-specs.md`](docs/tech-specs.md) y [`CLAUDE.md`](CLAUDE.md).

## Quick Start

### Requisitos

* Node.js 24.x
* Cuenta de AWS (para despliegue de Lambda/DynamoDB)
* Proyecto Firebase compartido con Comandante y Babel (Authentication)

### Setup

```bash
git clone https://github.com/ocastelblanco/agora-letiende.git
cd agora-letiende
npm install
```

### Ejecutar en desarrollo

```bash
npm run start          # servidor de desarrollo local (ng serve)
```

### Build de producción (SSR)

```bash
npm run build -- --configuration=production
npm run serve:ssr
```

### Tests

```bash
npm run test           # pruebas unitarias del frontend
npm run test:api       # pruebas unitarias del backend (Lambdas en server/)
```

## Seguridad y costos

Ágora maneja dinero real y datos personales de clientes sin cuenta — las reglas de seguridad obligatorias (control de acceso, prevención de sobreventa, manejo de comprobantes, Habeas Data) están en [`CLAUDE.md`](CLAUDE.md) §5. Las reglas de costo de infraestructura (DynamoDB siempre `PAY_PER_REQUEST`, presupuestos, etiquetado) están en la sección "Costos de infraestructura" del mismo documento y en [`docs/advertencia-urgente-costos-aws.md`](docs/advertencia-urgente-costos-aws.md) — lectura obligatoria antes de tocar cualquier infraestructura.

## Contributing

Todo cambio de código pasa por un Pull Request hacia `main` desde una rama `feature/*`, `fix/*`, `docs/*`, `hotfix/*` o `refactor/*`. Ver el flujo completo (incluyendo las prohibiciones absolutas de Git) en [`CLAUDE.md`](CLAUDE.md) §6.

## License

Ver [`LICENSE`](LICENSE).

## Support

Proyecto interno de Le Tiende. Para dudas o soporte, contactar al equipo de Le Tiende.
