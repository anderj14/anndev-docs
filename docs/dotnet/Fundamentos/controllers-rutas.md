---
sidebar_position: 2
title: Controllers y rutas
description: HTTP verbs, endpoints, parámetros y cómo devolver respuestas correctamente.
---

# Controllers y rutas

Ya sabes cómo funciona el pipeline.

Ahora vamos a la parte donde tu código vive — el controller.

---

## Qué es un controller

Un controller es una clase que recibe requests HTTP y devuelve respuestas.

Nada más.

No habla con la DB directamente. No tiene lógica de negocio. Solo recibe, delega, y responde.

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductosController : ControllerBase
{
    // tus endpoints van aquí
}
```

Dos atributos que siempre van juntos:

`[ApiController]` — activa comportamientos automáticos. Validación de modelos, respuestas `400` automáticas si el body no es válido, binding de parámetros sin tener que escribirlo tú.

`[Route("api/[controller]")]` — define la ruta base. El `[controller]` se reemplaza por el nombre de la clase sin el sufijo `Controller`. `ProductosController` → `api/productos`.

`ControllerBase` — la clase base para APIs. No confundir con `Controller` — ese es para MVC con vistas Razor. Si haces una Web API, siempre `ControllerBase`.

---

## Inyectando dependencias en el controller

El controller recibe lo que necesita por el constructor. Con primary constructors de C# 12:

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductosController(
    IProductoRepository repo,
    IMapper mapper,
    ILogger<ProductosController> logger
) : ControllerBase
{
    // repo, mapper y logger disponibles en todos los métodos
}
```

No instancias nada tú mismo. .NET se encarga de construir todo y pasártelo.

---

## Los verbos HTTP y sus atributos

Cada verbo HTTP tiene su atributo en .NET:

| Verbo | Atributo | Cuándo usarlo |
|---|---|---|
| `GET` | `[HttpGet]` | Leer datos — nunca modifica nada |
| `POST` | `[HttpPost]` | Crear un recurso nuevo |
| `PUT` | `[HttpPut]` | Actualizar un recurso completo |
| `PATCH` | `[HttpPatch]` | Actualizar campos específicos |
| `DELETE` | `[HttpDelete]` | Eliminar un recurso |

---

## GET — leer datos

### Traer todos

```csharp
[HttpGet]
public async Task<ActionResult<IReadOnlyList<ProductoDto>>> GetProductos()
{
    var productos = await repo.GetAllAsync();
    return Ok(mapper.Map<IReadOnlyList<ProductoDto>>(productos));
}
```

Ruta: `GET /api/productos`

### Traer uno por ID

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<ProductoDto>> GetProducto(int id)
{
    var producto = await repo.GetByIdAsync(id);

    if (producto == null)
        return NotFound();

    return Ok(mapper.Map<ProductoDto>(producto));
}
```

Ruta: `GET /api/productos/5`

El `:int` en la ruta es un **constraint** — le dice al routing que solo acepte números enteros. Si alguien manda `GET /api/productos/abc`, el routing ni siquiera ejecuta tu método. Devuelve `404` automáticamente.

---

## POST — crear un recurso

Aquí hay dos formas de responder. Las dos son válidas. Elige con criterio.

### Forma 1 — `Ok()` con 200

```csharp
[HttpPost]
public async Task<ActionResult<ProductoDto>> CreateProducto(CreateProductoDto dto)
{
    var producto = await repo.CreateAsync(dto);

    if (producto == null)
        return BadRequest();

    return Ok(mapper.Map<ProductoDto>(producto));
}
```

Respuesta:
```
HTTP/1.1 200 OK

{ "id": 5, "nombre": "Laptop", "precio": 999.99 }
```

Simple. El cliente recibe el objeto. Funciona.

Pero técnicamente está incorrecto — `200 OK` significa "la operación se completó", no "se creó algo nuevo". Es como decirle a alguien "todo bien" cuando lo que pasó fue que nació un bebé.

### Forma 2 — `CreatedAtAction()` con 201 ✓

```csharp
[HttpPost]
public async Task<ActionResult<ProductoDto>> CreateProducto(CreateProductoDto dto)
{
    var producto = await repo.CreateAsync(dto);

    if (producto == null)
        return BadRequest();

    var result = mapper.Map<ProductoDto>(producto);

    return CreatedAtAction(
        nameof(GetProducto),      // nombre del método GET por ID
        new { id = result.Id },   // parámetros de esa ruta
        result                    // el objeto creado
    );
}
```

Respuesta:
```
HTTP/1.1 201 Created
Location: https://tuapp.com/api/productos/5

{ "id": 5, "nombre": "Laptop", "precio": 999.99 }
```

Tres cosas en una respuesta:
- Status `201 Created` — correcto semánticamente
- Header `Location` con la URL donde vive el recurso nuevo
- El objeto creado en el body

`CreatedAtAction` necesita saber a qué endpoint apuntar para el `Location`. Por eso le pasas `nameof(GetProducto)` — el nombre del método que hace el `GET` por ID.

:::tip ¿Cuál elegir?
Usa `CreatedAtAction` si tu equipo sigue REST de forma estricta o si el frontend o mobile necesita el header `Location` para navegar al recurso creado.

Usa `Ok` si estás en un proyecto donde la simplicidad importa más que el purismo HTTP y todo el equipo lo entiende así.

Lo importante es que sea consistente. Siempre `201` o siempre `200`. Mezclar los dos en el mismo proyecto es el verdadero problema.
:::

---

## PUT — actualizar

```csharp
[HttpPut("{id:int}")]
public async Task<ActionResult<ProductoDto>> UpdateProducto(int id, UpdateProductoDto dto)
{
    var producto = await repo.GetByIdAsync(id);

    if (producto == null)
        return NotFound();

    mapper.Map(dto, producto);
    repo.Update(producto);
    await repo.SaveChangesAsync();

    return Ok(mapper.Map<ProductoDto>(producto));
}
```

Ruta: `PUT /api/productos/5`

`PUT` reemplaza el recurso completo. Si mandas solo `nombre` y el producto tenía `precio`, el precio se va a perder si no lo mandas también. Para actualizar campos específicos existe `PATCH` — pero para la mayoría de los casos `PUT` es suficiente.

---

## DELETE — eliminar

```csharp
[HttpDelete("{id:int}")]
public async Task<IActionResult> DeleteProducto(int id)
{
    var producto = await repo.GetByIdAsync(id);

    if (producto == null)
        return NotFound();

    repo.Delete(producto);
    await repo.SaveChangesAsync();

    return NoContent();
}
```

Ruta: `DELETE /api/productos/5`

`NoContent()` devuelve `204` — operación exitosa, sin body. Es la respuesta correcta para un delete. No hay nada que devolver — el recurso ya no existe.

Nótese que el tipo de retorno es `IActionResult` en lugar de `ActionResult<T>`. Cuando no devuelves un objeto — solo un status code — `IActionResult` es la forma correcta.

---

## Tipos de parámetros

### Desde la URL — `[FromRoute]`

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<ProductoDto>> GetProducto(int id) // ← viene del URL
```

.NET los extrae automáticamente del URL. No necesitas el atributo `[FromRoute]` explícitamente — es el comportamiento por defecto cuando el nombre del parámetro coincide con el de la ruta.

### Desde el query string — `[FromQuery]`

```csharp
// GET /api/productos?pageIndex=1&pageSize=10&search=laptop
[HttpGet]
public async Task<ActionResult> GetProductos([FromQuery] ProductoParams parametros)
```

```csharp
public class ProductoParams
{
    public int PageIndex { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Search { get; set; }
    public string? Sort { get; set; }
}
```

Agrupa todos los query params en una clase. Mucho más limpio que tener cinco parámetros sueltos en la firma del método.

### Desde el body — `[FromBody]`

```csharp
[HttpPost]
public async Task<ActionResult<ProductoDto>> CreateProducto(CreateProductoDto dto) // ← viene del body JSON
```

Con `[ApiController]`, el `[FromBody]` es automático para `POST` y `PUT`. No necesitas escribirlo explícitamente.

---

## El DTO — no expongas tu entidad directo

Nunca devuelvas la entidad de tu DB directamente al cliente.

```csharp
// ❌ Esto expone toda la entidad — incluyendo campos que no deberían salir
return Ok(producto);

// ✓ Esto devuelve solo lo que el cliente necesita
return Ok(mapper.Map<ProductoDto>(producto));
```

El DTO es un contrato. Defines exactamente qué campos salen y en qué forma. Si mañana agregas una columna `PasswordHash` a tu entidad `Usuario`, el DTO garantiza que eso nunca salga en el JSON.

Los DTOs van en el capítulo de [DTOs y AutoMapper](./dtos).

---

## El controller completo

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductosController(
    IProductoRepository repo,
    IMapper mapper
) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProductoDto>>> GetProductos()
    {
        var productos = await repo.GetAllAsync();
        return Ok(mapper.Map<IReadOnlyList<ProductoDto>>(productos));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductoDto>> GetProducto(int id)
    {
        var producto = await repo.GetByIdAsync(id);
        if (producto == null) return NotFound();
        return Ok(mapper.Map<ProductoDto>(producto));
    }

    [HttpPost]
    public async Task<ActionResult<ProductoDto>> CreateProducto(CreateProductoDto dto)
    {
        var producto = await repo.CreateAsync(dto);
        if (producto == null) return BadRequest();

        var result = mapper.Map<ProductoDto>(producto);
        return CreatedAtAction(nameof(GetProducto), new { id = result.Id }, result);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProductoDto>> UpdateProducto(int id, UpdateProductoDto dto)
    {
        var producto = await repo.GetByIdAsync(id);
        if (producto == null) return NotFound();

        mapper.Map(dto, producto);
        repo.Update(producto);
        await repo.SaveChangesAsync();

        return Ok(mapper.Map<ProductoDto>(producto));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteProducto(int id)
    {
        var producto = await repo.GetByIdAsync(id);
        if (producto == null) return NotFound();

        repo.Delete(producto);
        await repo.SaveChangesAsync();

        return NoContent();
    }
}
```

Eso es un CRUD completo.

Limpio. Sin lógica de negocio. Sin EF Core. Solo HTTP.

*Exactamente como debería verse un controller.*

---

**Siguiente:** [Middleware →](./middleware)