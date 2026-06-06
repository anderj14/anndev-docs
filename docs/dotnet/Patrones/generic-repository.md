---
sidebar_position: 2
title: Repository Genérico
description: Un solo repositorio para todas tus entidades.
---

# Repository Genérico

## Por qué aparece

Tienes `IProductoRepository`. Funciona bien. Luego necesitas `ICategoriaRepository`. Lo creas. Luego `IClienteRepository`. Luego `IOrdenRepository`.

Te das cuenta de que estás escribiendo lo mismo una y otra vez:

```csharp
Task<T?> GetByIdAsync(int id);
Task<List<T>> GetAllAsync();
void Add(T entity);
void Delete(T entity);
Task<int> SaveChangesAsync();
```

La única diferencia es el tipo. Eso es exactamente el problema que resuelve un repositorio genérico.

---

## La entidad base — el contrato mínimo

Para que el repositorio genérico funcione, todas tus entidades necesitan compartir algo en común. En este caso, el `Id`:

```csharp
public abstract class BaseEntity
{
    public int Id { get; set; }
}
```

Todas las entidades heredan de ella:

```csharp
public class Producto : BaseEntity
{
    public string Nombre { get; set; }
    public decimal Precio { get; set; }
}

public class Categoria : BaseEntity
{
    public string Nombre { get; set; }
}
```

---

## Diseccionando `GenericRepository<T>` — método por método

### La firma de la clase

```csharp
public class GenericRepository<T> : IGenericRepository<T> where T : BaseEntity
```

Tres cosas en una línea:

`T` es el tipo genérico — el placeholder que se reemplaza en runtime. Cuando escribes `IGenericRepository<Producto>`, `T` se convierte en `Producto` en toda la clase.

`: IGenericRepository<T>` — implementa la interfaz. El compilador va a exigir que todos los métodos del contrato estén implementados.

`where T : BaseEntity` — el constraint. Sin esto, el compilador no sabe que `T` tiene un `Id`, y métodos como `FindAsync(id)` no compilarían. También evita que alguien accidentalmente haga `IGenericRepository<string>`.

---

### El constructor — Inyección de Dependencias

```csharp
private readonly AppDbContext _context;

public GenericRepository(AppDbContext context)
{
    _context = context;
}
```

El `DbContext` llega por ID — no lo instancias tú. Ambos son `Scoped`, lo que significa que comparten la misma instancia durante todo el request. Eso garantiza que si haces dos queries en el mismo request, EF Core usa el mismo contexto y el mismo tracker de cambios.

`readonly` asegura que nadie pueda reasignar `_context` después del constructor. Es una protección pequeña pero comunica intención: este contexto no cambia.

---

### `GetByIdAsync` — búsqueda por clave primaria

```csharp
public async Task<T?> GetByIdAsync(int id)
{
    return await _context.Set<T>().FindAsync(id);
}
```

`_context.Set<T>()` le dice a EF Core: *dame el DbSet de esta entidad*. Es el equivalente de `_context.Productos` pero dinámico — funciona para cualquier entidad que herede de `BaseEntity`.

`FindAsync` tiene un comportamiento especial que lo diferencia de `FirstOrDefaultAsync`: **primero busca en el cache del DbContext** antes de ir a la base de datos. Si ya cargaste ese `Producto` con id `5` en el mismo request, no hace una segunda query. Para búsquedas por PK, siempre prefiere `FindAsync`.

El `T?` con el signo de pregunta indica que puede regresar `null` si no existe — es nullable reference type de C# 8+. Obliga al que llama a manejar el caso nulo.

---

### `ListAllAsync` — traer todo

```csharp
public async Task<IReadOnlyList<T>> ListAllAsync()
{
    return await _context.Set<T>().ToListAsync();
}
```

Trae todos los registros de la tabla. El tipo de retorno es `IReadOnlyList<T>` en lugar de `List<T>` — comunica que quien recibe esta lista no debería modificarla. Es una decisión de diseño, no técnica.

:::warning Cuidado en producción
Este método casi nunca se usa solo — sin filtros ni paginación, en una tabla con 100,000 registros vas a tener un problema de performance. Está bien para catálogos pequeños. Para todo lo demás necesitas el [Specification Pattern](./specification).
:::

---

### `GetByConditionAsync` — búsqueda con filtro

```csharp
public async Task<T?> GetByConditionAsync(Expression<Func<T, bool>> predicate)
{
    return await _context.Set<T>().FirstOrDefaultAsync(predicate);
}
```

`Expression<Func<T, bool>>` es la parte que confunde a la mayoría. Vamos por partes:

`Func<T, bool>` sería una función normal en memoria — toma un `T` y regresa `true` o `false`. Pero EF Core no puede traducir una función en memoria a SQL.

`Expression<Func<T, bool>>` es la representación del árbol de esa función — EF Core la puede inspeccionar y convertir a SQL. La diferencia es sutil pero crítica:

```csharp
// Esto EF Core lo traduce a: WHERE Email = 'x@x.com'
await repo.GetByConditionAsync(p => p.Email == "x@x.com");

// SQL generado:
// SELECT TOP(1) * FROM Productos WHERE Email = 'x@x.com'
```

`FirstOrDefaultAsync` regresa el primer resultado o `null`. Si esperas que el filtro siempre encuentre algo, existe `FirstAsync` que lanza excepción si no hay resultado — pero en la mayoría de los casos quieres manejar el `null` tú mismo.

---

### `Add` — agregar entidad

```csharp
public void Add(T entity)
{
    _context.Set<T>().Add(entity);
}
```

Nótese que es `void`, no `async`. `Add` no va a la base de datos — solo le dice al **Change Tracker** de EF Core: *esta entidad está en estado `Added`*. La query `INSERT` no ocurre hasta que alguien llame `SaveChangesAsync()`.

Esto es intencional. Puedes hacer varios `Add`, varios `Update`, varios `Delete` en el mismo request, y al final hacer **un solo viaje a la base de datos**. Eso es eficiencia — y es exactamente lo que Unit of Work coordina.

---

### `Update` — modificar entidad

```csharp
public void Update(T entity)
{
    _context.Set<T>().Attach(entity);
    _context.Entry(entity).State = EntityState.Modified;
}
```

Este método tiene dos líneas porque resuelve un caso específico: **la entidad no está siendo trackeada por EF Core**.

Si cargaste la entidad en el mismo request con `GetByIdAsync`, EF Core ya la está trackeando y detecta los cambios automáticamente — técnicamente no necesitarías llamar `Update`. Pero si la entidad llegó desde fuera — un DTO que mapeaste a entidad, por ejemplo — EF Core no sabe que existe.

`Attach` la registra en el tracker sin ir a la base de datos. `EntityState.Modified` le dice que todos sus campos cambiaron. Cuando llegue el `SaveChangesAsync`, EF Core genera un `UPDATE` con todas las columnas.

---

### `Delete` — eliminar entidad

```csharp
public void Delete(T entity)
{
    _context.Set<T>().Remove(entity);
}
```

Igual que `Add` — solo marca la entidad como `Deleted` en el Change Tracker. El `DELETE` SQL ocurre cuando se llama `SaveChangesAsync()`.

:::info Necesitas el objeto, no el id
No puedes hacer `Delete(5)` con solo el id — necesitas el objeto. Por eso el flujo típico es:

```csharp
var producto = await repo.GetByIdAsync(id);
if (producto == null) return NotFound();
repo.Delete(producto);
await _context.SaveChangesAsync();
```
:::

---

## El patrón completo en un flujo real

```csharp
// Crear
var producto = new Producto { Nombre = "Laptop", Precio = 999.99m };
repo.Add(producto);
await _context.SaveChangesAsync(); // INSERT

// Leer
var producto = await repo.GetByIdAsync(1);
var laptops = await repo.GetByConditionAsync(p => p.Nombre.Contains("Laptop"));

// Actualizar
producto.Precio = 899.99m;
repo.Update(producto);
await _context.SaveChangesAsync(); // UPDATE

// Eliminar
repo.Delete(producto);
await _context.SaveChangesAsync(); // DELETE
```

---

## Lo que el Change Tracker hace por ti

```
repo.Add(p)     → Estado: Added
repo.Update(p)  → Estado: Modified
repo.Delete(p)  → Estado: Deleted
                          ↓
              SaveChangesAsync()
                          ↓
              EF Core genera el SQL
              y ejecuta todo junto
```

El repositorio no habla con la base de datos directamente en `Add`, `Update` o `Delete`. Solo registra intenciones. `SaveChangesAsync` es quien ejecuta. Eso permite agrupar múltiples operaciones en una sola transacción — que es exactamente el siguiente tema.

---

## Registrarlo en ID

```csharp
// Program.cs
builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
```

La sintaxis `typeof(IGenericRepository<>)` registra el tipo abierto — .NET construye la versión correcta en runtime según lo que pidas:

```csharp
// .NET resuelve GenericRepository<Producto> automáticamente
public class ProductosController(IGenericRepository<Producto> repo)

// Y también GenericRepository<Categoria>
public class CategoriasController(IGenericRepository<Categoria> repo)
```

Un solo registro para todas tus entidades.

---

## El límite del repositorio genérico

Funciona perfecto para operaciones simples. El problema aparece cuando necesitas queries específicas — includes, filtros compuestos, paginación. Ahí el genérico llega a su techo.

El siguiente capítulo cubre cómo [Unit of Work](./unit-of-work) coordina múltiples repositorios en una sola transacción, y después vemos el [Specification Pattern](./specification) para queries complejas sin contaminar el repositorio.