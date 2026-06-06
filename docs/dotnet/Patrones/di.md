---
sidebar_position: 1
title: Inyección de dependencias
description: Qué es DI, cómo funciona el contenedor de .NET, lifetimes, y cómo conecta con Repository y Unit of Work.
---

# Inyección de dependencias

Antes de hablar de Repository. Antes de hablar de Unit of Work.

Hay un mecanismo que hace que todo eso funcione.

Se llama Inyección de Dependencias.

Y si no lo entiendes bien, vas a copiar patrones sin saber por qué funcionan — ni por qué a veces explotan.

---

## El problema que resuelve

Imagina que tienes esto:

```csharp
public class ProductosController : ControllerBase
{
    [HttpGet("{id}")]
    public async Task<ActionResult<Producto>> GetProducto(int id)
    {
        var context = new AppDbContext();            // ← instancias tú el contexto
        var repo = new ProductoRepository(context);  // ← instancias tú el repo

        var producto = await repo.GetByIdAsync(id);
        return Ok(producto);
    }
}
```

Funciona. Pero tiene tres problemas que crecen con el tiempo.

**Primero** — el controller está acoplado a implementaciones concretas. `ProductoRepository`. `AppDbContext`. Si cambias la implementación, cambias el controller.

**Segundo** — no puedes testearlo sin una base de datos real. Para hacer un test necesitas que `AppDbContext` conecte a algún lugar.

**Tercero** — tú controlas el ciclo de vida del objeto. Tú decides cuándo se crea y cuándo se destruye. En una aplicación web eso es un problema — si creas un `DbContext` por request y no lo destruyes, acumulas conexiones abiertas hasta que explota.

La Inyección de Dependencias resuelve los tres. De una sola vez.

---

## La idea central

En lugar de que una clase cree sus dependencias, alguien se las pasa desde afuera.

```csharp
// Sin DI — la clase crea lo que necesita
public class ProductosController : ControllerBase
{
    public async Task<ActionResult<Producto>> GetProducto(int id)
    {
        var context = new AppDbContext();
        var repo = new ProductoRepository(context);
        // ...
    }
}

// Con DI — alguien le pasa lo que necesita
public class ProductosController(IProductoRepository repo) : ControllerBase
{
    public async Task<ActionResult<Producto>> GetProducto(int id)
    {
        var producto = await repo.GetByIdAsync(id);
        // ...
    }
}
```

El controller ya no sabe cómo se construye `IProductoRepository`. No sabe si es `ProductoRepository`, una versión mock, o una que consulta una API externa. Solo sabe que tiene uno y que puede usarlo.

*Eso es exactamente lo que quieres.*

---

## El contenedor de DI

¿Quién construye `IProductoRepository` y se lo pasa al controller?

El **contenedor de DI** de .NET. También llamado **IoC container** — Inversion of Control.

Es un registro centralizado que sabe:
- Qué interfaces existen
- Qué clase concreta corresponde a cada interfaz
- Cómo construir esa clase y cuánto tiempo mantenerla viva

Lo configuras en `Program.cs`:

```csharp
// Registras el mapping interfaz → implementación
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
```

Cuando el controller se crea y pide un `IProductoRepository` en el constructor, el contenedor:

1. Ve que necesita un `IProductoRepository`
2. Busca qué implementación está registrada — `ProductoRepository`
3. Construye `ProductoRepository` con sus propias dependencias resueltas — en este caso `AppDbContext`
4. Se lo pasa al controller

Todo automático. Sin `new`. Sin wiring manual.

---

## `IServiceCollection` — el registro

`builder.Services` es de tipo `IServiceCollection`. Es la colección donde registras todo.

Tres métodos principales:

```csharp
// AddScoped — una instancia por request HTTP
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();

// AddSingleton — una instancia para toda la vida de la app
builder.Services.AddSingleton<IEmailSettings, EmailSettings>();

// AddTransient — una instancia nueva cada vez que se pide
builder.Services.AddTransient<IEmailService, EmailService>();
```

Estos tres métodos son los **lifetimes** — el ciclo de vida de cada servicio. Y este es el punto donde la mayoría comete errores.

---

## Lifetimes — el ciclo de vida de cada servicio

### `Scoped` — una instancia por request

```csharp
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
builder.Services.AddScoped<AppDbContext>();
```

Se crea una instancia cuando llega el request HTTP. La misma instancia se comparte en todo ese request — en el controller, en el servicio, en el repositorio. Cuando el request termina, se destruye.

Es el lifetime correcto para repositorios y `DbContext`. Por qué — si tuvieras un `DbContext` distinto en el controller y en el repositorio del mismo request, los cambios que hagas en uno no los vería el otro. El Change Tracker de EF Core es por instancia.

```
Request llega
    ↓
DbContext se crea          ─┐
ProductoRepository(context)  ├── misma instancia de DbContext
Controller(repo)            ─┘
    ↓
Request termina → DbContext.Dispose()
```

### `Singleton` — una instancia para toda la app

```csharp
builder.Services.AddSingleton<IEmailSettings, EmailSettings>();
builder.Services.AddSingleton<IMemoryCache, MemoryCache>();
```

Se crea una vez cuando la app arranca. La misma instancia para todos los requests, durante toda la vida de la aplicación.

Úsalo para configuraciones, caches en memoria, servicios sin estado que son caros de construir.

:::danger Thread safety en Singleton
Si tu Singleton mantiene estado mutable — una lista, un diccionario, un contador — puede tener condiciones de carrera porque múltiples requests lo acceden al mismo tiempo. O usas colecciones thread-safe (`ConcurrentDictionary`) o tu Singleton es completamente inmutable.
:::

### `Transient` — una instancia nueva cada vez

```csharp
builder.Services.AddTransient<IEmailService, EmailService>();
```

Cada vez que algo pide `IEmailService`, el contenedor crea una instancia nueva. Si el controller y un servicio del mismo request piden `IEmailService`, cada uno recibe su propia instancia.

Úsalo para servicios ligeros sin estado — el overhead de crear una instancia nueva cada vez es mínimo, y no tienes que preocuparte por compartir estado entre llamadas.

---

## El bug más común — Captive Dependency

Este bug tiene nombre. Se llama **Captive Dependency** — dependencia cautiva.

Pasa cuando un servicio de vida larga captura un servicio de vida corta:

```csharp
// ❌ Bug clásico
builder.Services.AddSingleton<IProductoService, ProductoService>();
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();

public class ProductoService(IProductoRepository repo) // ← Singleton captura un Scoped
```

`ProductoService` es `Singleton` — vive toda la vida de la app. `IProductoRepository` es `Scoped` — debería morir al terminar el request.

Pero como el `Singleton` lo capturó en su constructor, el repositorio vive para siempre — con el `DbContext` del primer request que llegó. Desde el segundo request en adelante, estás usando un `DbContext` muerto.

.NET detecta esto en desarrollo y lanza una excepción en runtime:

```
InvalidOperationException: Cannot consume scoped service 'IProductoRepository'
from singleton 'IProductoService'.
```

La regla es simple. Un servicio solo puede depender de servicios de igual o mayor duración:

| Lifetime | Puede depender de |
|---|---|
| `Singleton` | Solo `Singleton` |
| `Scoped` | `Singleton`, `Scoped` |
| `Transient` | Cualquiera |

---

## Registrar tipos genéricos — el Repository genérico

Para el `GenericRepository<T>` el registro es especial — usas el tipo abierto:

```csharp
// Registro de tipo genérico abierto
builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
```

`typeof(IGenericRepository<>)` — el `<>` vacío indica que es un tipo genérico abierto. .NET construye la versión correcta en runtime:

```csharp
// .NET resuelve automáticamente
public class ProductosController(IGenericRepository<Producto> repo)   // → GenericRepository<Producto>
public class CategoriasController(IGenericRepository<Categoria> repo) // → GenericRepository<Categoria>
```

Un solo registro. Todas las entidades cubiertas.

---

## El `IServiceCollection` organizado — Extension Methods

Cuando tienes muchos registros, `Program.cs` se vuelve enorme. La solución es mover los registros a extension methods:

```csharp
// ApplicationServicesExtensions.cs
public static class ApplicationServicesExtensions
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services,
        IConfiguration config)
    {
        // DbContext
        services.AddDbContext<AppDbContext>(opt =>
        {
            opt.UseSqlServer(config.GetConnectionString("DefaultConnection"));
        });

        // AutoMapper
        services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());

        // Repositorios y Unit of Work
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));

        // Servicios de dominio
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IPhotoService, PhotoService>();
        services.AddTransient<IEmailService, EmailService>();

        return services;
    }
}
```

Y en `Program.cs`:

```csharp
// Una línea en lugar de 30
builder.Services.AddApplicationServices(builder.Configuration);
```

### Por qué funciona así

`this IServiceCollection services` — el `this` hace que sea un extension method. Lo llamas directamente sobre `builder.Services` como si fuera un método propio de `IServiceCollection`.

Retornar `IServiceCollection` permite encadenar llamadas:

```csharp
builder.Services
    .AddApplicationServices(builder.Configuration)
    .AddIdentityServices(builder.Configuration);
```

---

## Cómo DI conecta con lo que ya tienes

Con los patrones de la Fase 2 registrados, el contenedor construye todo automáticamente:

```csharp
public static IServiceCollection AddApplicationServices(
    this IServiceCollection services,
    IConfiguration config)
{
    // 1. DbContext — AddDbContext lo registra como Scoped automáticamente
    services.AddDbContext<AppDbContext>(opt =>
        opt.UseSqlServer(config.GetConnectionString("DefaultConnection")));

    // 2. Unit of Work — Scoped, envuelve al DbContext
    services.AddScoped<IUnitOfWork, UnitOfWork>();

    // 3. Generic Repository — Scoped, tipo abierto
    services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));

    // 4. Repositorios específicos para entidades con queries complejas
    services.AddScoped<IArticuloRepository, ArticuloRepository>();
    services.AddScoped<IOrderRepository, OrderRepository>();

    return services;
}
```

El flujo cuando llega un request al controller:

```
Request HTTP llega
    ↓
.NET crea el scope del request
    ↓
AppDbContext se construye           ← Scoped, una instancia
    ↓
UnitOfWork(context) se construye   ← Scoped, recibe el mismo context
    ↓
Controller(unitOfWork) se construye ← recibe el UnitOfWork ya construido
    ↓
Controller ejecuta
    ↓
Request termina → scope destruido → DbContext.Dispose()
```

`AppDbContext` y `UnitOfWork` comparten la misma instancia durante todo el request. Eso garantiza que cuando llamas `unitOfWork.Complete()`, el `SaveChangesAsync()` ve todos los cambios de todos los repositorios.

*Ese es el contrato que hace que Unit of Work funcione. Sin DI configurado correctamente, Unit of Work no sirve de nada.*

---

## Constructor injection vs Property injection

Hay dos formas de recibir dependencias:

```csharp
// Constructor injection — la forma correcta
public class ProductosController(IProductoRepository repo) : ControllerBase
{
    // repo disponible en todos los métodos
}

// Property injection — evítala
public class ProductosController : ControllerBase
{
    [FromServices]
    public IProductoRepository Repo { get; set; }
}
```

Constructor injection gana por una razón fundamental — hace las dependencias **obligatorias**. Si no pasas `IProductoRepository`, el objeto no se puede construir. Es imposible tener un controller sin su repositorio.

Con property injection la dependencia es opcional por naturaleza. El objeto se construye sin ella y explota en runtime cuando la usa.

Obligatorio en tiempo de compilación siempre gana sobre opcional en tiempo de ejecución.

Siempre.

---

## Primary constructors — C# 12

C# 12 introdujo primary constructors — una forma más concisa:

```csharp
// Antes de C# 12
public class ProductosController : ControllerBase
{
    private readonly IProductoRepository _repo;
    private readonly IMapper _mapper;

    public ProductosController(IProductoRepository repo, IMapper mapper)
    {
        _repo = repo;
        _mapper = mapper;
    }
}

// Con C# 12 — primary constructor
public class ProductosController(
    IProductoRepository repo,
    IMapper mapper
) : ControllerBase
{
    // repo y mapper disponibles directamente sin declarar campos
}
```

Menos código. Misma funcionalidad. El contenedor de DI los inyecta igual — no cambia nada en cómo registras los servicios.

:::info .NET 8+ recomienda primary constructors
A partir de .NET 8 los templates oficiales usan primary constructors. Si ves código más viejo con el patrón de campo privado `readonly`, ambos son válidos — es solo una diferencia de sintaxis.
:::

---

## El resumen

| Concepto | Qué es | Cuándo usarlo |
|---|---|---|
| `AddScoped` | Una instancia por request | Repositorios, DbContext, servicios de dominio |
| `AddSingleton` | Una instancia para toda la app | Config, cache, servicios sin estado |
| `AddTransient` | Nueva instancia cada vez | Servicios ligeros, email, notificaciones |
| Extension method | Agrupar registros | Siempre — mantiene `Program.cs` limpio |
| Tipo abierto `<>` | Registrar genéricos | `GenericRepository`, cualquier clase genérica |
| Captive dependency | Singleton captura Scoped | Bug — .NET lo detecta y lanza excepción |

DI no es magia.

Es un diccionario glorificado que sabe construir objetos y gestionar su ciclo de vida.

Una vez que lo entiendes así, el resto — Repository, Unit of Work, Specification — es solo decidir qué lifetime tiene cada pieza y por qué.

---

**Siguiente:** [Patrón Repository →](./repository)