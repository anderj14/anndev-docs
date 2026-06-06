---
sidebar_position: 3
title: Unit of Work
description: Todas las operaciones se guardan juntas o no se guarda ninguna.
---

# Unit of Work

Tienes el repositorio funcionando.

Puedes guardar un `Producto`. Un `Cliente`. Una `Orden`.

Todo bien.

Ahora imagina esto.

---

## El problema que resuelve

En la app **Rent Car**, confirmar una reservación hace dos cosas:

1. Cambia el estado de la reservación a `Confirmada`
2. Marca el vehículo como `Reservado`

Son dos entidades. Dos operaciones. Y tienen que pasar juntas.

```csharp
// Con repositorios independientes
await reservacionRepo.Update(reservacion);
await reservacionRepo.SaveChangesAsync();  // ← esto sí se guardó

await vehiculoRepo.Update(vehiculo);
await vehiculoRepo.SaveChangesAsync();     // ← esto falló por cualquier razón
```

La reservación quedó confirmada.

El vehículo sigue marcado como disponible.

La DB quedó en un estado inconsistente — y alguien más puede reservar el mismo vehículo en ese momento.

*Eso es exactamente el tipo de bug que encuentras en producción a las 3am de un viernes.*

Unit of Work resuelve esto con una idea simple: **todas las operaciones se guardan juntas o no se guarda ninguna.**

---

## La interfaz

```csharp
public interface IUnitOfWork : IDisposable
{
    IGenericRepository<TEntity> Repository<TEntity>() where TEntity : BaseEntity;
    Task<int> Complete();
}
```

Dos responsabilidades. Nada más.

`Repository<TEntity>()` — punto de acceso a cualquier repositorio. En lugar de inyectar `IGenericRepository<Reservacion>` y `IGenericRepository<Vehiculo>` por separado, tienes un solo `IUnitOfWork` que te da acceso a todos.

`Complete()` — el único `SaveChangesAsync()` de toda la operación. Un solo viaje a la DB para todo.

---

## La implementación

```csharp
public class UnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _context;
    private Dictionary<string, object> _repositories = new();

    public UnitOfWork(AppDbContext context)
    {
        _context = context;
    }

    public IGenericRepository<TEntity> Repository<TEntity>() where TEntity : BaseEntity
    {
        var type = typeof(TEntity).Name;

        if (!_repositories.ContainsKey(type))
        {
            var repositoryInstance = new GenericRepository<TEntity>(_context);
            _repositories.Add(type, repositoryInstance);
        }

        return (IGenericRepository<TEntity>)_repositories[type];
    }

    public async Task<int> Complete()
    {
        return await _context.SaveChangesAsync();
    }

    public void Dispose()
    {
        _context.Dispose();
    }
}
```

:::info Hashtable vs Dictionary
El código original de la app Rent Car usaba `Hashtable`. Lo reemplazamos por `Dictionary<string, object>` por una razón concreta: `Hashtable` no es type-safe. Puedes meter cualquier cosa y el compilador no se queja. `Dictionary<string, object>` tampoco es perfecto, pero al menos la llave es `string` explícito y es la convención moderna en C#.
:::

---

## Cómo funciona el cache interno

```csharp
if (!_repositories.ContainsKey(type))
{
    var repositoryInstance = new GenericRepository<TEntity>(_context);
    _repositories.Add(type, repositoryInstance);
}
```

La primera vez que pides `Repository<Reservacion>()` lo crea y lo guarda en el diccionario.

La segunda vez lo devuelve del cache — no crea una instancia nueva.

Esto importa. Todos los repositorios comparten el mismo `_context`. Eso garantiza que cuando llamas `Complete()`, el `SaveChangesAsync()` ve **todos** los cambios que hiciste en cualquier repositorio durante ese request.

```
Repository<Reservacion>()  ─┐
                             ├── mismo _context ── Complete() ── un solo SaveChanges
Repository<Vehiculo>()     ─┘
```

---

## Una ventaja que se siente desde el primer día

Sin `Unit of Work`, el constructor del controller crece cada vez que necesitas hablar con una entidad nueva:

```csharp
// Sin Unit of Work — un parámetro por cada entidad
public class ReservationsController(
    IGenericRepository<Reservacion> reservacionRepo,
    IGenericRepository<Vehiculo> vehiculoRepo,
    IGenericRepository<Cliente> clienteRepo,
    IGenericRepository<Factura> facturaRepo,
    IMapper mapper,
    ILogger<ReservationsController> logger
) : BaseApiController
```

Cada entidad nueva = un parámetro nuevo = registrarlo en ID = verificar lifetimes.

En un controller que maneja un dominio complejo eso se sale de control rápido.

Con `Unit of Work`:

```csharp
// Con Unit of Work — un solo parámetro para todas las entidades
public class ReservationsController(
    IUnitOfWork unitOfWork,
    IMapper mapper,
    ILogger<ReservationsController> logger
) : BaseApiController
```

Y dentro del controller accedes a cualquier entidad sin tocar la firma:

```csharp
var reservacion = await unitOfWork.Repository<Reservacion>().GetByIdAsync(id);
var vehiculo    = await unitOfWork.Repository<Vehiculo>().GetByIdAsync(vehiculoId);
var cliente     = await unitOfWork.Repository<Cliente>().GetByIdAsync(clienteId);
```

Agregas una entidad nueva al flujo y el contrato con DI no se toca.

Siempre. Siempre. Siempre.

---

## En el controller — código real de Rent Car

```csharp
[HttpDelete("{id:int}")]
public async Task<IActionResult> DeleteReservation(int id)
{
    var spec = new ReservationWithDetailsSpecification(id);
    var reservacion = await unitOfWork.Repository<Reservacion>()
        .GetEntityWithSpec(spec);

    var vehiculo = await unitOfWork.Repository<Vehiculo>()
        .GetByIdAsync(reservacion.VehicleItemReservation.VehicleId);

    // Dos operaciones sobre dos entidades distintas
    vehiculo.Status = VehicleStatus.Available;
    unitOfWork.Repository<Vehiculo>().Update(vehiculo);
    unitOfWork.Repository<Reservacion>().Delete(reservacion);

    // Un solo SaveChanges para las dos
    if (await unitOfWork.Complete() <= 0)
        return StatusCode(500, new ApiResponse(500, "Error saving changes"));

    return NoContent();
}
```

Si `Complete()` falla, ninguna de las dos operaciones se guarda.

El vehículo no queda disponible con la reservación todavía existiendo.

La DB permanece consistente.

---

## Registrarlo en ID

```csharp
// Program.cs
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
```

`Scoped` — una instancia por request. Mismo lifetime que el `DbContext`. Eso es intencional.

El `UnitOfWork` envuelve al `DbContext`. Tienen que vivir exactamente el mismo tiempo.

---

## Cuándo NO lo necesitas

La **Distribuidora de Alimentos** no usa `Unit of Work`. Y no está mal.

```csharp
// ComprasRepository — SaveChanges directo
await _context.SaveChangesAsync();

// OrderRepository — SaveChanges directo
return await _context.SaveChangesAsync() > 0;
```

La razón es la DB legacy — sin relaciones formales entre tablas, las operaciones que cruzan entidades son raras. Cada repositorio maneja su propio dominio de forma bastante independiente.

Donde sí hay operaciones que cruzan entidades — como `RecibirAsync` en `ComprasRepository`, que actualiza el header, los detalles y crea documentos de inventario al mismo tiempo — todo ocurre dentro del mismo repositorio usando el mismo `_context`. Un solo `SaveChangesAsync()` al final cubre todo.

*Unit of Work resuelve un problema específico. Si ese problema no existe en tu app, no lo fuerces.*

---

## El resumen

| | Con Unit of Work | Sin Unit of Work |
|---|---|---|
| `SaveChanges` | Una vez al final | Por cada repositorio |
| Consistencia | Garantizada — todo o nada | Manual — depende del desarrollador |
| Transacciones | Automáticas | Hay que manejarlas explícitamente |
| Cuándo usarlo | Múltiples repos coordinados | Operaciones independientes por entidad |

---

Con Repository simple, Repository genérico y Unit of Work tienes la base.

Lo que falta es el momento donde el repositorio genérico empieza a sudar — cuando las queries se complican con filtros, ordenamiento y paginación.

Ese es el [Specification Pattern](./specification).