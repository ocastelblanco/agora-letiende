<hr>

<div align="center">

<h1 align="center">Ágora</h1>

</div>

<pre align="center">Boletería para los espectáculos del teatro de Le Tiende</pre>

![Status](https://img.shields.io/badge/estado-en%20arranque-yellow) ![License](https://img.shields.io/badge/license-MIT-blue) [![SLIM](https://img.shields.io/badge/Best%20Practices%20from-SLIM-blue)](https://nasa-ammos.github.io/slim/)

Ágora es la aplicación de boletería del centro cultural **Le Tiende** (Bogotá, Colombia). Permite al `cliente` comprar boletas para un evento sin necesidad de crear cuenta, al `productor` validar comprobantes de pago y ver el estado de venta de su evento, y al `portero` validar el ingreso en la puerta escaneando el código QR de cada boleta. El `administrador` crea y edita los eventos, y gestiona el equipo con acceso al sistema.

El objetivo es reemplazar el proceso manual actual —conversaciones de WhatsApp, comprobantes revisados a mano, listas de asistentes dispersas y validación de entrada leyendo nombres en papel— por un flujo digital de punta a punta, sin sobreventa y sin sobrecargar de trabajo simultáneo al equipo de Le Tiende.

[PRD](docs/PRD.md) | [Especificaciones técnicas](docs/tech-specs.md) | [TODO / roadmap activo](docs/TODO.md) | [Memoria de proyecto](docs/MEMORY.md)

## Features

* Cartelera pública de eventos, sin necesidad de autenticación, indexable vía SSR
* Compra de boletas con reserva temporal de sillas (sin sobreventa) y carga de comprobante de pago
* Aprobación de comprobantes por el productor, con emisión automática de boletas digitales
* Boleta digital con código QR único, entregada por correo
* Validación de boletas en la puerta por escaneo de QR, con veredicto claro (válida / usada / inexistente / de otro evento)
* Venta en efectivo desde la puerta o presencial
* Panel de control del evento: vendidas, disponibles, ingresados
* Autenticación con Google (Firebase Authentication), proyecto compartido con Comandante y Babel, roles propios de Ágora (`administrador` / `productor` / `portero`)

## Estado del proyecto

Ágora está en **fase de arranque**: la documentación de producto y arquitectura (`docs/PRD.md`, `docs/tech-specs.md`) ya existe, y el scaffold inicial del proyecto Angular está en curso. Las tareas activas están descritas en [`docs/TODO.md`](docs/TODO.md).

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
| UI | PrimeNG 22.x + Tailwind CSS 4.x, tema propio con la paleta de Le Tiende |
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
npm run test:api       # pruebas unitarias del backend (cuando exista server/)
```

## Seguridad y costos

Ágora maneja dinero real y datos personales de clientes sin cuenta — las reglas de seguridad obligatorias (control de acceso, prevención de sobreventa, manejo de comprobantes, Habeas Data) están en [`CLAUDE.md`](CLAUDE.md) §5. Las reglas de costo de infraestructura (DynamoDB siempre `PAY_PER_REQUEST`, presupuestos, etiquetado) están en la sección "Costos de infraestructura" del mismo documento y en [`docs/advertencia-urgente-costos-aws.md`](docs/advertencia-urgente-costos-aws.md) — lectura obligatoria antes de tocar cualquier infraestructura.

## Contributing

Todo cambio de código pasa por un Pull Request hacia `main` desde una rama `feature/*`, `fix/*`, `docs/*`, `hotfix/*` o `refactor/*`. Ver el flujo completo (incluyendo las prohibiciones absolutas de Git) en [`CLAUDE.md`](CLAUDE.md) §6.

## License

Ver [`LICENSE`](LICENSE).

## Support

Proyecto interno de Le Tiende. Para dudas o soporte, contactar al equipo de Le Tiende.
