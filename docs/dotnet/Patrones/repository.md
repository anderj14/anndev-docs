---
sidebar_position: 1
title: Patrón Repository
description: Separa cómo obtienes los datos de qué haces con ellos.
---

# Patrón Repository

## El problema que resuelve

Imagina que tienes este controller:

```csharp
[HttpGet("{id}")]
public async Task<ActionResult<Producto>> GetProducto(int id)
{
    var producto = await _context.Productos
        .Include(p => p.Categoria)
        .FirstOrDefaultAsync(p => p.Id == id);

    if (producto == null) return NotFound();
    return Ok(producto);
}
```

Funciona. Pero tiene un problema silencioso — tu controller sabe que estás usando EF Core. Sabe que existe un `DbContext`. Sabe cómo se hace la query.

Ahora multiplica eso por 10 controllers y 40 endpoints. Si algún día cambias algo en cómo accedes a datos — un índice, un `.AsNoTracking()`, migrar a Dapper en una tabla específica — tienes que buscar y cambiar en 40 lugares.

El Repository Pattern resuelve eso con una idea simple: **separar cómo obtienes los datos de qué haces con ellos.**

---

## La forma más simple — sin interfaz todavía

Empecemos con lo mínimo posible. Un repositorio es una clase que envuelve el acceso a datos de una entidad:

```csharp
public class ProductoRepository
{
    private readonly AppDbContext _context;

    public ProductoRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Producto?> GetByIdAsync(int id)
    {
        return await _context.Productos.FindAsync(id);
    }

    public async Task<List<Producto>> GetAllAsync()
    {
        return await _context.Productos.ToListAsync();
    }

    public void Add(Producto producto)
    {
        _context.Productos.Add(producto);
    }

    public void Delete(Producto producto)
    {
        _context.Productos.Remove(producto);
    }

    public async Task<int> SaveChangesAsync()
    {
        return await _context.SaveChangesAsync();
    }
}
```

Y el controller ahora se ve así:

```csharp
public class ProductosController(ProductoRepository repo) : BaseApiController
{
    [HttpGet("{id}")]
    public async Task<ActionResult<Producto>> GetProducto(int id)
    {
        var producto = await repo.GetByIdAsync(id);
        if (producto == null) return NotFound();
        return Ok(producto);
    }
}
```

El controller ya no sabe nada de EF Core. No sabe que existe un `DbContext`. Solo sabe que puede pedirle un producto al repositorio.

---

## El paso que lo cambia todo — la interfaz

La clase sola ya ayuda, pero todavía hay un problema: el controller depende de `ProductoRepository` directamente. Si mañana quieres hacer un test, necesitas una base de datos real.

La interfaz rompe esa dependencia:

```csharp
public interface IProductoRepository
{
    Task<Producto?> GetByIdAsync(int id);
    Task<List<Producto>> GetAllAsync();
    void Add(Producto producto);
    void Delete(Producto producto);
    Task<int> SaveChangesAsync();
}
```

La implementación implementa la interfaz:

```csharp
public class ProductoRepository : IProductoRepository
{
    // mismo código de antes
}
```

Y registras ambas en DI:

```csharp
// Program.cs
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
```

El controller ahora depende de la abstracción, no de la implementación:

```csharp
public class ProductosController(IProductoRepository repo) : BaseApiController
```

Esto es el principio **D de SOLID** — Dependency Inversion — aplicado en código real. Tu controller no sabe si detrás hay EF Core, Dapper, o un array en memoria para tests.

---

## Por qué `Scoped` y no `Singleton` o `Transient`

```csharp
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
```

`Scoped` significa una instancia por request HTTP. Eso es exactamente lo que necesitas porque el `DbContext` también es `Scoped` — comparten la misma instancia durante el mismo request, lo que garantiza consistencia en las queries.

| Lifetime | Cuándo usarlo |
|---|---|
| `Singleton` | Una instancia para toda la app — configs, caches |
| `Scoped` | Una instancia por request — repositorios, DbContext |
| `Transient` | Nueva instancia cada vez — servicios ligeros sin estado |

:::danger Captive dependency
Si registraras el repositorio como `Singleton` y el `DbContext` como `Scoped`, .NET te lanzaría un error en runtime porque estarías capturando una dependencia de vida más corta dentro de una de vida más larga. Esto se llama **captive dependency** y es uno de los bugs más comunes con DI.
:::

---

## Lo que ganaste — y lo que todavía falta

Con esto tienes:

- Controllers limpios sin lógica de acceso a datos
- Código testeable sin base de datos real
- Un solo lugar para cambiar cómo accedes a `Producto`

Lo que todavía falta cuando la app crece:

- ¿Qué pasa cuando necesitas el mismo patrón para `Categoria`, `Cliente`, `Orden`? → [Repository Genérico](./repository-generico)
- ¿Qué pasa cuando necesitas guardar cambios en dos entidades al mismo tiempo? → [Unit of Work](./unit-of-work)
- ¿Qué pasa cuando las queries se complican con filtros, ordenamiento y paginación? → [Specification Pattern](./specification)

Esos tres temas son exactamente los siguientes capítulos — y los vamos a ver con código real de dos apps en producción.