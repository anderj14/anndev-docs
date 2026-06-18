---
slug: anndev-docs-launch
title: Arquitectura en .NET — De cero a SaaS
authors: [andder]
tags: [dotnet, architecture, patterns]
---

Hace unos meses empecé un proyecto que llevaba tiempo dando vueltas en mi cabeza: una documentación viva de arquitectura de software con .NET, explicada en español y basada en código real de producción.

Hoy está en vivo. Se llama **Anndev Docs**.

<!-- truncate -->

No es un blog más con teoría abstracta. Es una guía práctica que cubre desde cómo funciona una Web API en ASP.NET Core hasta patrones como Specification, Unit of Work, y CQRS — todo con ejemplos que puedes clonar, correr, y modificar.

### Qué incluye

La documentación está organizada en fases. La Fase 1 cubre los fundamentos: controllers, middleware, DTOs, manejo de errores. La Fase 2 entra en los patrones que usamos en producción: Repository, DI, Unit of Work, Specification, EF Core. Y la Fase 3 conecta todo en un proyecto completo — una agenda médica API con reglas de negocio reales, validaciones, paginación, y soft delete.

Cada pieza de código viene de apps que están corriendo en producción hoy. Nada de ejemplos inventados para el tutorial.

### Por qué en español

Porque cuando empecé en .NET, todo lo bueno estaba en inglés. Traducía documentación, veía videos con subtítulos automáticos, y perdía horas buscando explicaciones claras. Quiero que la próxima generación de devs hispanohablantes tenga un recurso en su idioma, sin tener que saltar esa barrera.

### Lo que viene

El roadmap incluye patrones bajo presión (casos legacy reales con bases de datos sin FK), arquitectura modular, y un SaaS completo con multi-tenancy, autenticación JWT, y jobs programados.

Si te interesa la arquitectura de software con .NET, el canal de YouTube también está activo con videos que complementan la documentación.

[Anndev Docs →](https://anderj14.github.io/anndev-docs/) | [Canal de YouTube →](https://youtube.com/@anndev14)
