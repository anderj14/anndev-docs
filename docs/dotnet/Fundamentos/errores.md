---
sidebar_position: 5
title: Manejo de errores
description: ApiResponse consistente, middleware de excepciones global, y cómo separar errores técnicos de errores de negocio.
---

# Manejo de errores

Hay dos formas de manejar errores en una API.

La primera: cada controller tiene su propio try/catch, devuelve mensajes distintos, y el cliente nunca sabe qué esperar.

La segunda: un solo lugar maneja todos los errores, devuelve siempre la misma estructura, y el cliente puede confiar en lo que recibe.

*Una de las dos te va a despertar a las 3am.*

---

## El problema — sin estructura no hay contrato

Sin un manejo centralizado, tu API responde así:

```json
// Endpoint A falla
{ "message": "Not found" }

// Endpoint B falla
{ "error": "Usuario no existe", "code": 404 }

// Endpoint C falla
"Internal server error"

// Endpoint D falla
{ "title": "One or more validation errors occurred", "errors": { ... } }
```

Cuatro endpoints. Cuatro formatos distintos. El frontend tiene que manejar cuatro casos distintos para el mismo tipo de error.

*Eso no es una API. Eso es una sorpresa cada vez que algo falla.*

---

## La solución — `ApiResponse`

Define una estructura única para todas las respuestas de error:

```csharp
public class ApiResponse
{
    public int StatusCode { get; set; }
    public string Message { get; set; }

    public ApiResponse(int statusCode, string? message = null)
    {
        StatusCode = statusCode;
        Message = message ?? GetDefaultMessage(statusCode);
    }

    private static string GetDefaultMessage(int statusCode) => statusCode switch
    {
        400 => "Bad request",
        401 => "You are not authorized",
        403 => "Forbidden",
        404 => "Resource not found",
        500 => "Internal server error",
        _   => "Unknown error"
    };
}
```

### Línea por línea

```csharp
public int StatusCode { get; set; }
public string Message { get; set; }
```

Dos propiedades. Solo dos. `StatusCode` repite el código HTTP en el body — útil para clientes que a veces no pueden leer el status code HTTP directamente, como ciertos proxies o clientes móviles. `Message` es el texto legible para el desarrollador que consume la API.

```csharp
public ApiResponse(int statusCode, string? message = null)
```

El parámetro `message` es opcional — tiene valor por defecto `null`. Si no pasas mensaje, el constructor genera uno automáticamente. Si lo pasas, usa el tuyo. Eso te deja hacer tanto `new ApiResponse(404)` como `new ApiResponse(404, "Producto no encontrado")`.

```csharp
Message = message ?? GetDefaultMessage(statusCode);
```

El operador `??` — null-coalescing. Si `message` es `null`, usa `GetDefaultMessage(statusCode)`. Si no es `null`, usa `message`. Una sola línea que reemplaza un `if/else` completo.

```csharp
private static string GetDefaultMessage(int statusCode) => statusCode switch
{
    400 => "Bad request",
    401 => "You are not authorized",
    403 => "Forbidden",
    404 => "Resource not found",
    500 => "Internal server error",
    _   => "Unknown error"
};
```

`switch expression` de C# 8+ — más limpio que un `switch` tradicional. Cada caso es `valor => resultado`. El `_` es el caso por defecto — si el status code no matchea ninguno, devuelve `"Unknown error"`.

`private static` — no necesita una instancia de `ApiResponse` para llamarse, y no es parte del contrato público de la clase. Solo la usa el constructor internamente.

El resultado final:

```json
{
  "statusCode": 404,
  "message": "Resource not found"
}
```

---

## `ApiValidationErrorResponse` — errores de validación

Los errores de validación son distintos. No es un solo error — pueden ser varios al mismo tiempo, uno por campo.

```csharp
public class ApiValidationErrorResponse : ApiResponse
{
    public IEnumerable<string> Errors { get; set; }

    public ApiValidationErrorResponse() : base(400)
    {
        Errors = new List<string>();
    }
}
```

### Línea por línea

```csharp
public class ApiValidationErrorResponse : ApiResponse
```

Hereda de `ApiResponse`. Ya tiene `StatusCode` y `Message` — no los repites. Solo agregas lo que es específico de validación.

```csharp
public IEnumerable<string> Errors { get; set; }
```

`IEnumerable<string>` en lugar de `List<string>` — porque el que consume esta clase solo necesita iterar los errores, no agregar ni quitar. Es una decisión de diseño: expones solo las operaciones que tiene sentido exponer.

```csharp
public ApiValidationErrorResponse() : base(400)
```

El constructor llama al constructor padre con `400` — siempre es un Bad Request. No necesitas pasarlo tú cada vez que creas uno.

```csharp
Errors = new List<string>();
```

Inicializa la lista vacía. Si no lo haces, `Errors` es `null` y al iterar explota. Siempre inicializa colecciones en el constructor.

El resultado:

```json
{
  "statusCode": 400,
  "message": "Bad request",
  "errors": [
    "El nombre es requerido",
    "El precio debe ser mayor a 0",
    "El stock no puede ser negativo"
  ]
}
```

---

## Configurar validación automática en `Program.cs`

Con `[ApiController]`, .NET valida los DTOs automáticamente. Si el body no es válido, devuelve `400` antes de que tu código corra.

El problema: el formato por defecto de ese `400` es el de ASP.NET Core — diferente al tuyo. Lo reemplazas así:

```csharp
builder.Services.Configure<ApiBehaviorOptions>(opts =>
{
    opts.InvalidModelStateResponseFactory = actionContext =>
    {
        var errors = actionContext.ModelState
            .Where(e => e.Value!.Errors.Count > 0)
            .SelectMany(x => x.Value!.Errors)
            .Select(x => x.ErrorMessage)
            .ToArray();

        var errorResponse = new ApiValidationErrorResponse
        {
            Errors = errors
        };

        return new BadRequestObjectResult(errorResponse);
    };
});
```

### Línea por línea

```csharp
builder.Services.Configure<ApiBehaviorOptions>(opts =>
```

`Configure<T>` configura opciones de un servicio ya registrado. `ApiBehaviorOptions` controla cómo se comporta `[ApiController]` — incluyendo qué hace cuando la validación falla.

```csharp
opts.InvalidModelStateResponseFactory = actionContext =>
```

`InvalidModelStateResponseFactory` es una función — recibe el `ActionContext` y devuelve un `IActionResult`. La estás reemplazando por la tuya. ASP.NET Core la llama automáticamente cuando la validación falla.

```csharp
var errors = actionContext.ModelState
    .Where(e => e.Value!.Errors.Count > 0)
```

`ModelState` es un diccionario — cada campo del DTO es una entrada. `.Where(e => e.Value!.Errors.Count > 0)` filtra solo los campos que tienen errores. El `!` después de `Value` es el null-forgiving operator — le dices al compilador que confíes en que `Value` no es null en este contexto.

```csharp
    .SelectMany(x => x.Value!.Errors)
```

`SelectMany` aplana una colección de colecciones. Cada campo puede tener múltiples errores — `SelectMany` los junta todos en una sola lista plana en lugar de una lista de listas.

```csharp
    .Select(x => x.ErrorMessage)
    .ToArray();
```

Extrae solo el texto del error de cada `ModelError`. `.ToArray()` materializa la query LINQ — hasta este punto todo era lazy, aquí se ejecuta.

```csharp
return new BadRequestObjectResult(errorResponse);
```

`BadRequestObjectResult` envuelve el objeto en una respuesta HTTP `400`. ASP.NET Core lo serializa a JSON y lo manda al cliente.

---

## El middleware de excepciones — la red de seguridad

El `ApiResponse` es para errores que esperas. El middleware es para los que no esperas.

```csharp
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ExceptionMiddleware(
        RequestDelegate next,
        ILogger<ExceptionMiddleware> logger,
        IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ex.Message);
            context.Response.ContentType = "application/json";

            context.Response.StatusCode = ex switch
            {
                NotFoundException           => StatusCodes.Status404NotFound,
                UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
                ConflictException           => StatusCodes.Status409Conflict,
                ValidationException         => StatusCodes.Status400BadRequest,
                _                           => StatusCodes.Status500InternalServerError
            };

            var response = _env.IsDevelopment()
                ? new ApiExceptionResponse(context.Response.StatusCode, ex.Message, ex.StackTrace)
                : new ApiResponse(context.Response.StatusCode, ex.Message);

            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
        }
    }
}
```

### Línea por línea

```csharp
private readonly RequestDelegate _next;
```

`RequestDelegate` es un delegate — una función que recibe un `HttpContext` y devuelve un `Task`. En el contexto del middleware, `_next` representa el siguiente middleware en el pipeline. Llamar `_next(context)` es literalmente "pasa el request al siguiente".

```csharp
private readonly IHostEnvironment _env;
```

`IHostEnvironment` te dice en qué ambiente estás corriendo — `Development`, `Production`, `Staging`. Lo usas para decidir cuánto detalle mostrar en los errores.

```csharp
public async Task InvokeAsync(HttpContext context)
```

`InvokeAsync` es el nombre que ASP.NET Core busca en un middleware. No implementas ninguna interfaz — es convención por nombre. Si lo llamas diferente, el middleware no funciona.

```csharp
try
{
    await _next(context);
}
```

Pasa el request al siguiente middleware y espera a que todo el pipeline termine. Si cualquier cosa lanza una excepción en cualquier punto del pipeline — en otro middleware, en el controller, en un servicio — cae aquí.

```csharp
_logger.LogError(ex, ex.Message);
```

Logea con nivel `Error` — incluye la excepción completa con stack trace en el sistema de logging. El primer parámetro es la excepción, el segundo es el mensaje. Si no logas aquí, el error desaparece en silencio.

```csharp
context.Response.ContentType = "application/json";
```

Antes de escribir cualquier cosa en la response, estableces el `Content-Type`. Si no lo haces, el cliente recibe JSON pero el header dice `text/plain` — y algunos clientes se confunden.

```csharp
context.Response.StatusCode = ex switch
{
    NotFoundException           => StatusCodes.Status404NotFound,
    UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
    ConflictException           => StatusCodes.Status409Conflict,
    ValidationException         => StatusCodes.Status400BadRequest,
    _                           => StatusCodes.Status500InternalServerError
};
```

Pattern matching sobre el tipo de excepción. C# compara el tipo real de `ex` con cada caso. `NotFoundException` matchea → `404`. Cualquier excepción no reconocida → `500`.

`StatusCodes.Status404NotFound` es una constante de ASP.NET Core que vale `404`. Podrías escribir `404` directamente, pero la constante es más legible y evita errores de tipeo.

```csharp
var response = _env.IsDevelopment()
    ? new ApiExceptionResponse(context.Response.StatusCode, ex.Message, ex.StackTrace)
    : new ApiResponse(context.Response.StatusCode, ex.Message);
```

Operador ternario. En `Development` crea `ApiExceptionResponse` con el stack trace incluido. Si no, crea `ApiResponse` simple sin stack trace.

`ex.StackTrace` es la cadena con todos los frames de la call stack en el momento del error. En desarrollo es invaluable. En producción es un riesgo de seguridad — le dice al mundo cómo está construida tu app internamente.

```csharp
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};

await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
```

Serializas el objeto a JSON manualmente con `CamelCase` explícito. En un middleware no tienes acceso a la configuración de serialización de los controllers — tienes que configurarla tú mismo. Sin esto el JSON sale con `StatusCode` en PascalCase en lugar de `statusCode`.

---

## `ApiExceptionResponse` — el detalle para desarrollo

```csharp
public class ApiExceptionResponse : ApiResponse
{
    public string? Details { get; set; }

    public ApiExceptionResponse(int statusCode, string? message = null, string? details = null)
        : base(statusCode, message)
    {
        Details = details;
    }
}
```

`string? Details` — nullable. En producción se serializa el objeto base `ApiResponse` sin este campo. En desarrollo existe y trae el stack trace.

En desarrollo el cliente recibe:

```json
{
  "statusCode": 500,
  "message": "Object reference not set to an instance of an object",
  "details": "   at ProductosController.GetProducto(Int32 id) in..."
}
```

En producción:

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## Excepciones de dominio

```csharp
public class NotFoundException : Exception
{
    public NotFoundException(string name, object key)
        : base($"{name} with id '{key}' was not found")
    {
    }

    public NotFoundException(string message) : base(message)
    {
    }
}
```

### Línea por línea

```csharp
public class NotFoundException : Exception
```

Hereda de `Exception`. Eso es todo lo que necesitas para crear una excepción custom en .NET. No implementas ninguna interfaz.

```csharp
public NotFoundException(string name, object key)
    : base($"{name} with id '{key}' was not found")
```

Constructor con dos parámetros — el nombre de la entidad y su ID. Genera el mensaje automáticamente. `object key` en lugar de `int key` porque el ID puede ser `int`, `Guid`, `string` — cualquier tipo.

```csharp
public NotFoundException(string message) : base(message)
```

Segundo constructor — para cuando quieres un mensaje personalizado. Dos constructores, dos casos de uso. Esto se llama **constructor overloading**.

```csharp
// Con formato automático
throw new NotFoundException(nameof(Producto), id);
// → "Producto with id '5' was not found"

// Con mensaje custom
throw new NotFoundException("El producto no está disponible en tu región");
```

`nameof(Producto)` devuelve el string `"Producto"` en tiempo de compilación. Si renombras la clase, el mensaje se actualiza automáticamente.

---

## El controller limpio — sin try/catch

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<ProductoDto>> GetProducto(int id)
{
    var spec = new ProductoWithCategoriaSpecification(id);
    var producto = await unitOfWork.Repository<Producto>().GetEntityWithSpec(spec);

    if (producto == null)
        throw new NotFoundException(nameof(Producto), id);

    return Ok(mapper.Map<ProductoDto>(producto));
}
```

Sin try/catch. Sin `StatusCode(500)`. El controller describe qué pasó a nivel de dominio — lanza `NotFoundException`. El middleware lo convierte en `404`. El controller no sabe nada de HTTP error codes.

```csharp
[HttpPost]
public async Task<ActionResult<ProductoDto>> CreateProducto(CreateProductoDto dto)
{
    var existe = await unitOfWork.Repository<Producto>()
        .GetByConditionAsync(p => p.Nombre == dto.Nombre);

    if (existe != null)
        throw new ConflictException($"Ya existe un producto con el nombre '{dto.Nombre}'");

    var producto = mapper.Map<Producto>(dto);
    unitOfWork.Repository<Producto>().Add(producto);
    await unitOfWork.Complete();

    var result = mapper.Map<ProductoDto>(producto);
    return CreatedAtAction(nameof(GetProducto), new { id = result.Id }, result);
}
```

```csharp
if (existe != null)
    throw new ConflictException($"Ya existe un producto con el nombre '{dto.Nombre}'");
```

Validas la regla de negocio — nombres únicos. Si ya existe, lanzas `ConflictException`. El middleware la convierte en `409 Conflict`. Sin un solo `return StatusCode(409)` en el controller.

*Así es como debería verse un controller.*

---

## Data Annotations — validaciones en el DTO

```csharp
public record CreateProductoDto(
    [Required(ErrorMessage = "El nombre es requerido")]
    [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres")]
    string Nombre,

    [MaxLength(500)]
    string? Descripcion,

    [Required]
    [Range(0.01, double.MaxValue, ErrorMessage = "El precio debe ser mayor a 0")]
    decimal Precio,

    [Range(0, int.MaxValue, ErrorMessage = "El stock no puede ser negativo")]
    int Stock,

    [Required]
    int CategoriaId
);
```

### Atributo por atributo

`[Required]` — el campo no puede ser `null` ni string vacío. `ErrorMessage` personaliza el mensaje — sin él, .NET genera uno en inglés genérico.

`[MaxLength(100)]` — longitud máxima del string. Valida antes de ir a la DB — si no lo haces aquí, la DB puede lanzar una excepción de truncamiento que es más difícil de manejar limpiamente.

`[Range(0.01, double.MaxValue)]` — el valor tiene que estar entre `min` y `max` inclusive. `double.MaxValue` es prácticamente infinito. El mínimo `0.01` asegura precio positivo y no cero.

`[Range(0, int.MaxValue)]` — el stock puede ser `0` pero no negativo. `int.MaxValue` como tope porque no tiene sentido limitar el stock máximo en la validación.

:::tip FluentValidation como alternativa
Las Data Annotations funcionan para casos simples. Cuando las validaciones se complican — validar contra la DB, reglas condicionales, validaciones cruzadas entre campos — `FluentValidation` es más limpio y testeable. Lo cubrimos en la Fase 3.
:::

---

## El flujo completo de errores

```
Request llega
    ↓
ExceptionMiddleware (envuelve todo)
    ↓
Validación de modelo — si falla → 400 ApiValidationErrorResponse
    ↓
Controller ejecuta
    ├── lanza NotFoundException        → middleware → 404 ApiResponse
    ├── lanza ConflictException        → middleware → 409 ApiResponse
    ├── lanza ValidationException      → middleware → 400 ApiResponse
    ├── lanza cualquier otra Exception → middleware → 500 ApiResponse
    └── todo bien                      → 200/201 con el DTO
```

---

## El resumen

| Tipo de error | Quién lo maneja | Respuesta |
|---|---|---|
| DTO inválido | `InvalidModelStateResponseFactory` | `400 ApiValidationErrorResponse` |
| Recurso no encontrado | `ExceptionMiddleware` + `NotFoundException` | `404 ApiResponse` |
| Conflicto de datos | `ExceptionMiddleware` + `ConflictException` | `409 ApiResponse` |
| Error de negocio | `ExceptionMiddleware` + `ValidationException` | `400 ApiResponse` |
| Error inesperado | `ExceptionMiddleware` | `500 ApiResponse` |

El controller no maneja ninguno de estos casos directamente.

Lanza. El middleware recoge. El cliente recibe siempre el mismo formato.

Eso es una API que respeta a quien la consume.

---

Con esto la **Fase 1 está completa**:

- [Cómo funciona una Web API](./como-funciona-web-api.mdx) ✅
- [Controllers y rutas](./controllers-rutas.md) ✅
- [Middleware](./middleware.mdx) ✅
- [DTOs y Mappers](./dtos-mappers.md) ✅
- [Manejo de errores](./errores.md) ✅

La Fase 2 arranca con el patrón que hace que todo lo anterior escale — **Inyección de Dependencias a fondo**.