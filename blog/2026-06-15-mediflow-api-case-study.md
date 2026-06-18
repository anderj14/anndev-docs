---
slug: mediflow-api-case-study
title: "MediFlow API: Un proyecto real con patrones de arquitectura"
authors: [andder]
tags: [dotnet, architecture, patterns, ddd, efcore]
---

Cuando enseño arquitectura de software, siempre llego al mismo punto: los patrones aislados son fáciles de entender, pero la mayoría de la gente se pierde cuando hay que conectarlos todos en un proyecto real.

Por eso construí MediFlow API — una agenda médica completa que usa todos los patrones que cubro en la documentación, funcionando juntos.

<!-- truncate -->

### El dominio

MediFlow es un sistema de agendamiento de citas médicas. Tiene doctores con especialidades (relación muchos a muchos), pacientes, y citas con reglas de negocio reales:

- No permitir conflictos de horario (overlap detection)
- Un paciente no puede tener dos citas el mismo día con el mismo doctor
- Las cancelaciones requieren 24 horas de anticipación
- Soft delete en todas las entidades
- Auditoría automática con `CreatedAt` y `UpdatedAt`

### Los patrones aplicados

| Patrón | Dónde se usa |
|---|---|
| **Repository + Unit of Work** | Coordinación de operaciones entre Doctors, Patients y Appointments |
| **Specification** | Queries de conflicto de horario, paginación, y filtros dinámicos |
| **DTOs + Mappers** | Contrato entre API y cliente, con dos enfoques (estático y AutoMapper) |
| **Middleware** | Manejo global de excepciones con respuesta JSON consistente |
| **DI** | Ciclo de vida Scoped compartido entre DbContext, repositorios y servicios |
| **Fluent API** | Configuración explícita de EF Core con índices compuestos y relaciones |

### Lo que aprendí construyéndolo

Que la teoría no prepara para las decisiones incómodas. Como cuándo vale la pena romper el patrón — por ejemplo, usando un repositorio específico en lugar del genérico cuando la query cruza demasiadas tablas. O cuándo un mapper estático gana sobre AutoMapper (spoiler: casi siempre en proyectos pequeños).

También reafirmé algo que ya sabía: el orden del middleware importa más de lo que la gente cree. Poner `UseCors` después de `UseAuthentication` rompe los preflight requests de CORS, y diagnosticar ese bug puede tomar horas si no sabes lo que buscas.

### Código disponible

El proyecto completo está en [Anndev Docs](https://anderj14.github.io/anndev-docs/), incluyendo Docker Compose para SQL Server, migraciones automáticas, data seeder, y un archivo `tests.http` para probar todos los endpoints desde VS Code. También hay un video en YouTube recorriendo la arquitectura paso a paso.

[Ver tutorial completo →](/docs/proyectos/mediflow-complete-guide) | [Canal de YouTube →](https://youtube.com/@anndev14)
