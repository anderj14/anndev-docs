---
slug: repository-pattern-vs-linq
title: "Repository Pattern vs LINQ: Cuándo usar cada uno"
authors: [andder]
tags: [dotnet, patterns, repository, efcore]
---

Uno de los debates más comunes en equipos .NET es si el Repository Pattern sigue teniendo sentido cuando ya tienes LINQ y EF Core. La respuesta corta: depende de lo que estés construyendo.

La respuesta larga es más interesante.

<!-- truncate -->

### El argumento en contra

LINQ ya abstrae el proveedor de datos. `_context.Productos.Where(p => p.Activo).ToListAsync()` es elegantemente simple. ¿Por qué agregar otra capa?

El argumento es válido cuando tu aplicación es un CRUD sin reglas de negocio complejas. Si solo estás mapeando endpoints a tablas, el repositorio es ruido innecesario.

### El argumento a favor

El problema aparece cuando tu dominio crece. Sin Repository, el código de acceso a datos se filtra a los controllers y services:

```csharp
// Sin repository — el controller sabe de EF Core
var productos = await _context.Productos
    .Include(p => p.Categoria)
    .Where(p => p.Activo && p.Stock > 0)
    .OrderBy(p => p.Nombre)
    .Skip(10).Take(10)
    .ToListAsync();
```

Esa línea parece inofensiva hasta que la misma lógica aparece en 5 lugares distintos con variaciones sutiles. El día que cambias el esquema de paginación, o agregas un filtro global de tenant, o migras una tabla a Dapper, tienes que cazar cada aparición.

### Mi regla personal

- **CRUD simple sin reglas de negocio**: LINQ directo desde el service. El Repository Pattern no aporta valor.
- **Dominio con reglas complejas**: Repository + Specification. La abstracción te permite testear, cambiar de ORM, y mantener queries consistentes.

En la mayoría de los proyectos que he visto como consultor, el punto de inflexión llega cuando superas las 10-15 entidades con relaciones. Antes de eso, la simplicidad de LINQ directo gana. Después, la estructura del Repository Pattern empieza a pagar su deuda.

En [Anndev Docs](https://anderj14.github.io/anndev-docs/) cubro ambos enfoques con código real — incluyendo Generic Repository, Unit of Work, y Specification Pattern aplicados en una agenda médica completa.
