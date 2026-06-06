---
sidebar_position: 5
title: Specification Pattern
description: Queries reutilizables, paginación limpia, y cómo evitar que el repositorio genérico explote cuando las queries se complican.
---

# Specification Pattern

El repositorio genérico funciona perfecto para operaciones simples.

`GetByIdAsync`. `ListAllAsync`. `Add`. `Delete`.

El problema aparece el día que necesitas esto:

```csharp
// ¿Dónde pones esta query?
var reservaciones = await _context.Reservaciones
    .Include(r => r.Vehiculo)
    .Include(r => r.Cliente)
    .Where(r => r.Estado == estado)
    .Where(r => r.FechaInicio >= fechaInicio)
    .OrderByDescending(r => r.FechaInicio)
    .Skip((pageIndex - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync();
```

Tienes tres opciones. Las tres son malas.

**Opción 1** — meterla en el controller. El controller ahora sabe de EF Core. Perdiste la abstracción.

**Opción 2** — meterla en el repositorio genérico como método específico. Agregas `GetReservacionesByEstadoAsync`. Luego otro filtro. Luego otro. El repositorio genérico deja de ser genérico.

**Opción 3** — Specification Pattern. La query vive en su propia clase. El repositorio solo sabe cómo aplicarla.

*La opción 3 es la única que escala.*

---

## La idea central

Una especificación es un objeto que **describe** una query sin **ejecutarla**.

Tiene el criterio de filtro. Los includes. El ordenamiento. La paginación. Todo junto en una clase.

El repositorio recibe la especificación y la aplica. No sabe qué filtros tiene. Solo sabe cómo ejecutarla.

```
Controller
    ↓ crea ReservacionConDetallesSpec(id)
    ↓ pasa al repositorio
Repository
    ↓ aplica la especificación sobre IQueryable<T>
    ↓ EF Core genera el SQL
Base de datos
```

El controller describe **qué** quiere. El repositorio sabe **cómo** obtenerlo.

---

## La interfaz base

```csharp
public interface ISpecification<T>
{
    Expression<Func<T, bool>>? Criteria { get; }
    List<Expression<Func<T, object>>> Includes { get; }
    List<string> IncludeStrings { get; }
    Expression<Func<T, object>>? OrderBy { get; }
    Expression<Func<T, object>>? OrderByDescending { get; }
    int Take { get; }
    int Skip { get; }
    bool IsPagingEnabled { get; }
}
```

### Propiedad por propiedad

```csharp
Expression<Func<T, bool>>? Criteria { get; }
```

El `WHERE` de la query. `Expression<Func<T, bool>>` es la representación del árbol de una función booleana — EF Core la puede traducir a SQL. Si es `null`, no hay filtro — se traen todos los registros.

Por qué `Expression<Func<T, bool>>` y no simplemente `Func<T, bool>`:

```csharp
// Func<T, bool> — función en memoria. EF Core NO puede traducirla a SQL
Func<Producto, bool> filtro = p => p.Precio > 100;

// Expression<Func<T, bool>> — árbol de expresión. EF Core SÍ puede traducirla a SQL
Expression<Func<Producto, bool>> expresion = p => p.Precio > 100;
// → SQL: WHERE Precio > 100
```

`Func` ejecuta en memoria — primero trae todos los registros, luego filtra. `Expression` ejecuta en la DB — filtra antes de traer nada. La diferencia en performance puede ser enorme.

```csharp
List<Expression<Func<T, object>>> Includes { get; }
```

Los `Include` de EF Core — las relaciones que quieres cargar con la entidad. Una lista porque pueden ser múltiples.

```csharp
List<string> IncludeStrings { get; }
```

Includes en formato string — para includes anidados como `"Vehiculo.Marca"` o `"Cliente.Direcciones"`. Complementa la lista tipada para casos donde la cadena de includes es dinámica.

```csharp
Expression<Func<T, object>>? OrderBy { get; }
Expression<Func<T, object>>? OrderByDescending { get; }
```

El `ORDER BY` — uno para ascendente, otro para descendente. Solo uno debería estar activo a la vez.

```csharp
int Take { get; }
int Skip { get; }
bool IsPagingEnabled { get; }
```

La paginación. `Take` es cuántos registros tomar. `Skip` es cuántos saltar. `IsPagingEnabled` controla si se aplica paginación — para cuando necesitas la especificación solo para contar, sin paginar.

---

## La clase base

En lugar de implementar todos esos miembros en cada especificación, creas una clase base que maneja todo:

```csharp
public abstract class BaseSpecification<T> : ISpecification<T>
{
    public Expression<Func<T, bool>>? Criteria { get; private set; }
    public List<Expression<Func<T, object>>> Includes { get; } = new();
    public List<string> IncludeStrings { get; } = new();
    public Expression<Func<T, object>>? OrderBy { get; private set; }
    public Expression<Func<T, object>>? OrderByDescending { get; private set; }
    public int Take { get; private set; }
    public int Skip { get; private set; }
    public bool IsPagingEnabled { get; private set; }

    protected BaseSpecification() { }

    protected BaseSpecification(Expression<Func<T, bool>> criteria)
    {
        Criteria = criteria;
    }

    protected void AddInclude(Expression<Func<T, object>> include)
    {
        Includes.Add(include);
    }

    protected void AddInclude(string include)
    {
        IncludeStrings.Add(include);
    }

    protected void AddOrderBy(Expression<Func<T, object>> orderBy)
    {
        OrderBy = orderBy;
    }

    protected void AddOrderByDescending(Expression<Func<T, object>> orderByDesc)
    {
        OrderByDescending = orderByDesc;
    }

    protected void ApplyPaging(int skip, int take)
    {
        Skip = skip;
        Take = take;
        IsPagingEnabled = true;
    }
}
```

### Decisiones de diseño

```csharp
public List<Expression<Func<T, object>>> Includes { get; } = new();
```

`= new()` — inicialización inline. La lista siempre existe, nunca es `null`. El código que itera los includes no necesita verificar null.

```csharp
protected void AddInclude(Expression<Func<T, object>> include)
{
    Includes.Add(include);
}
```

`protected` — solo las clases que heredan pueden agregar includes. Desde afuera la especificación es de solo lectura. El `SpecificationEvaluator` lee las listas pero nunca las modifica.

```csharp
protected BaseSpecification(Expression<Func<T, bool>> criteria)
{
    Criteria = criteria;
}
```

Constructor con criterio — la forma más común de crear una especificación. Pasas el filtro en el constructor y el resto lo configuras en el constructor de la clase hija con los métodos `protected`.

```csharp
protected BaseSpecification() { }
```

Constructor vacío — para especificaciones sin filtro. Cuando quieres traer todo pero con includes y ordenamiento específicos.

---

## El evaluador — donde la especificación se convierte en SQL

```csharp
public static class SpecificationEvaluator<T> where T : BaseEntity
{
    public static IQueryable<T> GetQuery(
        IQueryable<T> inputQuery,
        ISpecification<T> spec)
    {
        var query = inputQuery;

        if (spec.Criteria != null)
            query = query.Where(spec.Criteria);

        query = spec.Includes.Aggregate(query,
            (current, include) => current.Include(include));

        query = spec.IncludeStrings.Aggregate(query,
            (current, include) => current.Include(include));

        if (spec.OrderBy != null)
            query = query.OrderBy(spec.OrderBy);

        if (spec.OrderByDescending != null)
            query = query.OrderByDescending(spec.OrderByDescending);

        if (spec.IsPagingEnabled)
            query = query.Skip(spec.Skip).Take(spec.Take);

        return query;
    }
}
```

### Línea por línea

```csharp
public static class SpecificationEvaluator<T> where T : BaseEntity
```

`static` — no necesitas instanciarlo. `where T : BaseEntity` — el mismo constraint del repositorio genérico. Solo funciona con entidades que heredan de `BaseEntity`.

```csharp
var query = inputQuery;
```

Empieza con el `IQueryable<T>` que le pasa el repositorio — `_context.Set<T>().AsQueryable()`. Todo lo que haces a partir de aquí es componer sobre ese queryable. Nada se ejecuta todavía.

```csharp
if (spec.Criteria != null)
    query = query.Where(spec.Criteria);
```

Aplica el filtro si existe. EF Core traduce el `Expression<Func<T, bool>>` a una cláusula `WHERE` en SQL.

```csharp
query = spec.Includes.Aggregate(query,
    (current, include) => current.Include(include));
```

`Aggregate` — reduce una colección a un solo valor aplicando una función acumuladora. Aquí aplica cada `Include` de la lista uno sobre el resultado del anterior.

En otras palabras — si tienes tres includes:

```
query = query.Include(Vehiculo)
query = query.Include(Cliente)
query = query.Include(Seguro)
```

`Aggregate` hace eso en una línea, sin importar cuántos includes tenga la lista.

```csharp
query = spec.IncludeStrings.Aggregate(query,
    (current, include) => current.Include(include));
```

Lo mismo pero para includes en formato string — `"Vehiculo.Marca"`. EF Core soporta includes anidados como strings cuando el tipo de la propiedad no es directamente accesible en tiempo de compilación.

```csharp
if (spec.OrderBy != null)
    query = query.OrderBy(spec.OrderBy);

if (spec.OrderByDescending != null)
    query = query.OrderByDescending(spec.OrderByDescending);
```

Solo uno de los dos debería ser distinto de null. Si los dos están configurados, `OrderBy` gana — porque va primero. En práctica, tu especificación debería configurar uno o el otro, no los dos.

```csharp
if (spec.IsPagingEnabled)
    query = query.Skip(spec.Skip).Take(spec.Take);
```

La paginación va **al final**. Siempre. Si pones `Skip/Take` antes del `Where` o del `OrderBy`, SQL puede producir resultados incorrectos — estarías saltando y tomando antes de filtrar.

```csharp
return query;
```

Devuelve el `IQueryable<T>` compuesto — todavía no ejecutado. La ejecución ocurre cuando el repositorio llama `.ToListAsync()` o `.FirstOrDefaultAsync()` sobre el resultado.

---

## Conectar el evaluador al repositorio genérico

```csharp
public class GenericRepository<T> : IGenericRepository<T> where T : BaseEntity
{
    private readonly AppDbContext _context;

    public GenericRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<T?> GetEntityWithSpec(ISpecification<T> spec)
    {
        return await ApplySpecification(spec).FirstOrDefaultAsync();
    }

    public async Task<IReadOnlyList<T>> ListAsync(ISpecification<T> spec)
    {
        return await ApplySpecification(spec).ToListAsync();
    }

    public async Task<int> CountAsync(ISpecification<T> spec)
    {
        return await ApplySpecification(spec).CountAsync();
    }

    private IQueryable<T> ApplySpecification(ISpecification<T> spec)
    {
        return SpecificationEvaluator<T>.GetQuery(
            _context.Set<T>().AsQueryable(),
            spec
        );
    }
}
```

`ApplySpecification` es el puente. Toma el `DbSet<T>` como punto de partida y le pasa la especificación al evaluador. El resultado es un `IQueryable<T>` listo para ejecutar.

El repositorio no sabe nada de la especificación. No sabe si filtra por fecha, por estado, o por nombre de cliente. Solo sabe cómo aplicarla.

---

## Una especificación real — código de Rent Car

```csharp
public class ReservacionConDetallesSpecification : BaseSpecification<Reservacion>
{
    // Para traer una reservación por ID con todos sus detalles
    public ReservacionConDetallesSpecification(int id)
        : base(r => r.Id == id)
    {
        AddInclude(r => r.VehiculoItemReservacion);
        AddInclude(r => r.SeguroItemReservacion);
        AddInclude(r => r.Cliente);
    }

    // Para listar reservaciones con filtros y paginación
    public ReservacionConDetallesSpecification(ReservacionSpecParams specParams)
        : base(r =>
            (string.IsNullOrEmpty(specParams.Estado) ||
                r.ReservacionStatus.ToString() == specParams.Estado) &&
            (!specParams.FechaInicio.HasValue ||
                r.FechaInicio >= specParams.FechaInicio) &&
            (!specParams.FechaFin.HasValue ||
                r.FechaFin <= specParams.FechaFin)
        )
    {
        AddInclude(r => r.VehiculoItemReservacion);
        AddInclude(r => r.Cliente);
        AddOrderByDescending(r => r.FechaInicio);
        ApplyPaging(
            (specParams.PageIndex - 1) * specParams.PageSize,
            specParams.PageSize
        );
    }
}
```

### Por qué dos constructores en la misma clase

Un constructor para buscar por ID — filtro simple, todos los includes, sin paginación.

Un constructor para listar con filtros — criterio compuesto, algunos includes, ordenamiento y paginación.

Ambos trabajan sobre la misma entidad `Reservacion`. Ambos usan los mismos includes base. En lugar de dos clases, una sola con dos formas de construirse.

### El criterio compuesto

```csharp
: base(r =>
    (string.IsNullOrEmpty(specParams.Estado) ||
        r.ReservacionStatus.ToString() == specParams.Estado) &&
    (!specParams.FechaInicio.HasValue ||
        r.FechaInicio >= specParams.FechaInicio)
)
```

El patrón `(condicion_opcional || condicion_real)` es clave. Si `specParams.Estado` es null o vacío, el primer término es `true` y el `||` hace que toda esa parte sea `true` — el filtro no aplica. Si tiene valor, el primer término es `false` y se evalúa el segundo — el filtro aplica.

Esto permite que los filtros sean opcionales sin escribir múltiples especificaciones.

---

## La especificación de conteo — por qué necesitas dos

Para paginar necesitas dos cosas: los datos de la página y el total de registros.

```csharp
[HttpGet]
public async Task<ActionResult<Pagination<ReservacionDto>>> GetReservaciones(
    [FromQuery] ReservacionSpecParams specParams)
{
    var spec      = new ReservacionConDetallesSpecification(specParams);
    var countSpec = new ReservacionParaConteoSpecification(specParams);

    var totalItems = await unitOfWork.Repository<Reservacion>().CountAsync(countSpec);
    var reservaciones = await unitOfWork.Repository<Reservacion>().ListAsync(spec);

    var data = mapper.Map<IReadOnlyList<ReservacionDto>>(reservaciones);

    return Ok(new Pagination<ReservacionDto>(
        specParams.PageIndex,
        specParams.PageSize,
        totalItems,
        data));
}
```

¿Por qué no usar la misma especificación para contar?

Si usas `spec` para contar, EF Core ejecuta los `Include` y la paginación antes de contar — trabajo innecesario. `CountAsync` solo necesita el `WHERE`, no las relaciones ni el `SKIP/TAKE`.

```csharp
public class ReservacionParaConteoSpecification : BaseSpecification<Reservacion>
{
    public ReservacionParaConteoSpecification(ReservacionSpecParams specParams)
        : base(r =>
            (string.IsNullOrEmpty(specParams.Estado) ||
                r.ReservacionStatus.ToString() == specParams.Estado) &&
            (!specParams.FechaInicio.HasValue ||
                r.FechaInicio >= specParams.FechaInicio)
        )
    {
        // Sin includes. Sin paginación. Solo el criterio.
    }
}
```

El mismo filtro que la especificación principal. Sin nada más. Una query limpia para `COUNT(*)`.

---

## El objeto de paginación

```csharp
public class Pagination<T>
{
    public int PageIndex { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public IReadOnlyList<T> Data { get; set; }

    public Pagination(int pageIndex, int pageSize, int totalCount, IReadOnlyList<T> data)
    {
        PageIndex = pageIndex;
        PageSize = pageSize;
        TotalCount = totalCount;
        Data = data;
    }
}
```

`TotalPages` se calcula — no se almacena. `Math.Ceiling` redondea hacia arriba — si tienes 25 registros y páginas de 10, son 3 páginas, no 2.5.

El cliente recibe:

```json
{
  "pageIndex": 1,
  "pageSize": 10,
  "totalCount": 25,
  "totalPages": 3,
  "data": [ ... ]
}
```

---

## Los params de la especificación

```csharp
public class ReservacionSpecParams
{
    private const int MaxPageSize = 50;

    public int PageIndex { get; set; } = 1;

    private int _pageSize = 10;
    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value > MaxPageSize ? MaxPageSize : value;
    }

    public string? Estado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public string? Sort { get; set; }
}
```

`MaxPageSize` evita que alguien pida 10,000 registros en una sola query. El setter de `PageSize` lo limita silenciosamente — si piden 200 y el máximo es 50, reciben 50.

`PageIndex` empieza en `1` — base 1, no base 0. Es la convención más común para APIs. El cálculo del `Skip` lo convierte: `(PageIndex - 1) * PageSize`.

En el controller viene del query string:

```
GET /api/reservaciones?pageIndex=2&pageSize=10&estado=Confirmada&fechaInicio=2024-01-01
```

`[FromQuery]` lo mapea automáticamente:

```csharp
[HttpGet]
public async Task<ActionResult<Pagination<ReservacionDto>>> GetReservaciones(
    [FromQuery] ReservacionSpecParams specParams)
```

---

## El flujo completo

```
GET /api/reservaciones?pageIndex=1&pageSize=10&estado=Confirmada
    ↓
Controller crea ReservacionConDetallesSpecification(specParams)
    → Criteria: r.Estado == "Confirmada"
    → Includes: Vehiculo, Cliente
    → OrderBy: FechaInicio DESC
    → Skip: 0, Take: 10
    ↓
Controller crea ReservacionParaConteoSpecification(specParams)
    → Criteria: r.Estado == "Confirmada"
    → Sin includes, sin paginación
    ↓
unitOfWork.Repository<Reservacion>().CountAsync(countSpec)
    → SELECT COUNT(*) FROM Reservaciones WHERE Estado = 'Confirmada'
    → totalItems = 47
    ↓
unitOfWork.Repository<Reservacion>().ListAsync(spec)
    → SELECT TOP 10 r.*, v.*, c.*
      FROM Reservaciones r
      LEFT JOIN Vehiculos v ON ...
      LEFT JOIN Clientes c ON ...
      WHERE r.Estado = 'Confirmada'
      ORDER BY r.FechaInicio DESC
      OFFSET 0 ROWS
    ↓
Pagination<ReservacionDto> con pageIndex=1, pageSize=10, totalCount=47, totalPages=5
```

Dos queries. Limpias. Sin lógica de paginación en el controller.

---

## Cuándo el Specification Pattern no es la respuesta

La Distribuidora de Alimentos no lo usa en algunos repositorios — y con razón.

```csharp
// ComprasRepository — query que cruza tablas sin FK
public async Task<Pagination<CompraHeaderDto>> GetAllAsync(ComprasSpecParams p)
{
    // 5 queries separadas, ensamblado en memoria, lógica de negocio dentro
}
```

Cuando la query cruza tablas sin relación formal, necesita parámetros de negocio que no encajan en una expresión genérica, o ensambla en memoria — una especificación genérica no puede expresar eso. El repositorio específico es la respuesta correcta.

La especificación es una herramienta. No una religión.

*Úsala cuando la query puede describirse como un filtro tipado sobre una entidad. Cuando no puede, el repositorio específico gana.*

---

## El resumen

| Concepto | Qué hace |
|---|---|
| `ISpecification<T>` | Define el contrato — criterio, includes, orden, paginación |
| `BaseSpecification<T>` | Implementación base con métodos `protected` para configurar |
| `SpecificationEvaluator<T>` | Traduce la especificación a `IQueryable<T>` |
| `GetEntityWithSpec` | Trae uno con especificación |
| `ListAsync` | Trae lista con especificación |
| `CountAsync` | Cuenta con especificación — sin includes ni paginación |
| Dos constructores | Un mismo objeto, dos casos de uso distintos |
| Spec de conteo separada | Evita ejecutar includes y paginación en un `COUNT(*)` |

El controller describe qué quiere. El repositorio sabe cómo obtenerlo. La especificación es el idioma entre los dos.

---

**Siguiente:** [Entity Framework Core →](./ef-core)