---
sidebar_position: 4
title: DTOs y Mappers
description: Qué son los DTOs, por qué existen, y dos formas de mapear — manual con métodos estáticos y automático con AutoMapper.
---

# DTOs y Mappers

Tu entidad sabe demasiado.

Tiene campos internos. Tiene relaciones con otras entidades. Tiene propiedades que nunca deberían salir en un JSON — `PasswordHash`, `TenantId`, columnas legacy con nombres que no dicen nada.

Si devuelves la entidad directo al cliente, estás exponiendo todo eso.

El DTO es el contrato. Defines exactamente qué sale, en qué forma, y con qué nombre.

---

## Qué es un DTO

**DTO** — Data Transfer Object. Un objeto que existe solo para mover datos entre capas.

No tiene lógica. No tiene comportamiento. Solo propiedades.

Tomemos un ejemplo simple — un `Producto`:

```csharp
// La entidad — lo que vive en la DB
public class Producto : BaseEntity
{
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public decimal Precio { get; set; }
    public int Stock { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; } = DateTime.UtcNow;
    public int CategoriaId { get; set; }
    public Categoria? Categoria { get; set; }   // ← relación con otra entidad
}
```

Si devuelves esto directo, el cliente recibe `CategoriaId` — un número sin contexto — y la `Categoria` completa con todas sus propiedades internas. Más de lo que necesita.

El DTO define exactamente qué sale:

```csharp
// DTO de detalle — para GET /api/productos/{id}
public record ProductoDto(
    int Id,
    string Nombre,
    string? Descripcion,
    decimal Precio,
    int Stock,
    bool Activo,
    DateTime CreadoEn,
    string? CategoriaNombre   // ← el nombre, no el ID ni el objeto completo
);

// DTO de lista — para GET /api/productos
public record ProductoSummaryDto(
    int Id,
    string Nombre,
    decimal Precio,
    int Stock,
    bool Activo,
    string? CategoriaNombre
);
```

El cliente no sabe que existe `CategoriaId`. No sabe que existe `CreadoEn` en la entidad como campo interno. Solo ve lo que decidiste mostrarle.

---

## Records vs clases para DTOs

En C# 9+ los `record` son la forma ideal para DTOs:

```csharp
// Con record — inmutable, constructor automático, igualdad por valor
public record ClientResponse(
    Guid Id,
    string Name,
    string Email
);

// Con clase — más verboso, mutable por defecto
public class ClientResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}
```

Los `record` ganan en DTOs por tres razones. Son inmutables por defecto — nadie puede modificar la respuesta después de crearla. El constructor se genera automáticamente — no tienes que escribir `public ClientResponse(Guid id, string name...)`. Y la igualdad funciona por valor — dos `ClientResponse` con los mismos datos son iguales.

---

## Dos enfoques de mapeo

Aquí es donde el capítulo se pone interesante.

Hay dos formas de convertir una entidad a un DTO. Las dos funcionan. Cada una tiene su lugar.

---

## Enfoque 1 — Mapper estático manual

Este enfoque viene de una app real de facturación. Mappers estáticos — clases con métodos que hacen la conversión explícitamente, línea por línea:

```csharp
public static class ClientMapper
{
    public static ClientResponse ToResponse(Client c, string? categoryName = null) => new(
        c.Id,
        c.ClientNumber,
        c.Name,
        c.OwnerName,
        c.EIN,
        c.BusinessCategoryId,
        categoryName,
        c.Email,
        c.Phone,
        c.State,
        c.ZipCode,
        c.RepresentativeName,
        c.RepresentativePhone,
        c.RepresentativeEmail,
        c.Type,
        c.IsActive,
        c.CreatedAt,
        c.Addresses.Select(AddressMapper.ToResponse).ToList()
    );

    public static ClientSummaryResponse ToSummary(Client c, string? categoryName = null) => new(
        c.Id,
        c.ClientNumber,
        c.Name,
        c.OwnerName,
        c.EIN,
        c.BusinessCategoryId,
        categoryName,
        c.Email,
        c.Phone,
        c.State,
        c.ZipCode,
        c.RepresentativeName,
        c.RepresentativePhone,
        c.RepresentativeEmail,
        c.Type,
        c.IsActive
    );
}
```

Nótese el patrón. El mismo mapper tiene dos métodos:

`ToResponse` — el DTO completo con todas las relaciones. Lo usas cuando necesitas el detalle de un solo recurso.

`ToSummary` — versión reducida. Lo usas en listados donde no necesitas todo — solo los campos esenciales para mostrar en una tabla o tarjeta.

Dos DTOs para la misma entidad. Uno para lista, otro para detalle. Eso es intencional.

Los mappers se componen entre sí — `ClientMapper` llama a `AddressMapper`:

```csharp
c.Addresses.Select(AddressMapper.ToResponse).ToList()
```

Y cuando el campo es un Value Object como `Money`, tiene su propio mapper:

```csharp
public static class MoneyMapper
{
    public static MoneyResponse ToResponse(Money money) => new(money.Amount, money.Currency);

    public static Money ToDomain(MoneyRequest request) =>
        Money.Create(request.Amount, request.Currency);
}
```

`ToResponse` convierte de dominio a DTO. `ToDomain` convierte de DTO a dominio — para cuando recibes datos del cliente y los necesitas en tu modelo de negocio.

### Cómo se usa en el controller

```csharp
[HttpGet("{id:guid}")]
public async Task<ActionResult<ClientResponse>> GetById(Guid id)
{
    var spec = new ClientWithAddressesSpecification(id);
    var client = await _uow.Repository<Client>().GetEntityWithSpec(spec)
        ?? throw new NotFoundException(nameof(Client), id);

    return Ok(ClientMapper.ToResponse(client));  // ← una línea
}
```

Y en el listado, donde además necesitas el nombre de la categoría — que viene de otra entidad:

```csharp
[HttpGet]
public async Task<ActionResult<PaginatedResponse<ClientSummaryResponse>>> GetAll(
    [FromQuery] ClientSpecParams specParams)
{
    var clients = await _uow.Repository<Client>().ListAsync(spec);
    var total = await _uow.Repository<Client>().CountAsync(countSpec);

    // Cargar categorías en un diccionario para evitar N+1
    var categoryIds = clients
        .Where(c => c.BusinessCategoryId.HasValue)
        .Select(c => c.BusinessCategoryId!.Value)
        .Distinct().ToList();

    var categories = categoryIds.Any()
        ? (await _uow.Repository<BusinessCategory>().ListAllAsync())
            .Where(c => categoryIds.Contains(c.Id))
            .ToDictionary(c => c.Id, c => c.Name)
        : new Dictionary<Guid, string>();

    // El mapper recibe el nombre de la categoría como parámetro extra
    var data = clients.Select(c =>
        ClientMapper.ToSummary(c, c.BusinessCategoryId.HasValue
            ? categories.GetValueOrDefault(c.BusinessCategoryId.Value)
            : null)).ToList();

    return Ok(PaginatedResponse<ClientSummaryResponse>.Create(
        data, total, specParams.PageIndex, specParams.PageSize));
}
```

El `Dictionary` de categorías es importante. En lugar de hacer una query por cada cliente para obtener el nombre de su categoría — lo que se llama problema N+1 — traes todas las categorías de una sola vez y las indexas por ID. Una query. No N.

:::tip Cuándo usar mapper estático
- Cuando el mapeo necesita lógica extra — parámetros adicionales, datos de otras entidades, cálculos
- Cuando quieres control total sobre qué se mapea y cuándo
- Cuando el equipo prefiere ver el mapeo explícito sin magia
:::

Para `Producto`, el mapper estático se vería así:

```csharp
public static class ProductoMapper
{
    public static ProductoDto ToResponse(Producto p, string? categoriaNombre = null) => new(
        p.Id,
        p.Nombre,
        p.Descripcion,
        p.Precio,
        p.Stock,
        p.Activo,
        p.CreadoEn,
        categoriaNombre
    );

    public static ProductoSummaryDto ToSummary(Producto p, string? categoriaNombre = null) => new(
        p.Id,
        p.Nombre,
        p.Precio,
        p.Stock,
        p.Activo,
        categoriaNombre
    );
}
```

Y en el controller:

```csharp
[HttpGet("{id:int}")]
public async Task<ActionResult<ProductoDto>> GetProducto(int id)
{
    var spec = new ProductoWithCategoriaSpecification(id);
    var producto = await repo.GetEntityWithSpec(spec);
    if (producto == null) return NotFound();

    return Ok(ProductoMapper.ToResponse(producto, producto.Categoria?.Nombre));
}
```

---

## Enfoque 2 — AutoMapper

AutoMapper automatiza el mapeo por convención — si la propiedad de la entidad y la del DTO tienen el mismo nombre, las mapea automáticamente.

### Instalación

```bash
dotnet add package AutoMapper
dotnet add package AutoMapper.Extensions.Microsoft.DependencyInjection
```

### El perfil de mapeo

```csharp
public class MappingProfiles : Profile
{
    public MappingProfiles()
    {
        // Mapeo simple — nombres iguales, mapeo automático
        CreateMap<Producto, ProductoDto>();

        // Mapeo con transformación de campo
        CreateMap<Reservacion, ReservacionDto>()
            .ForMember(dest => dest.EstadoNombre,
                       opt => opt.MapFrom(src => src.Estado.ToString()));

        // Mapeo inverso — del DTO a la entidad
        CreateMap<CreateProductoDto, Producto>();

        // Mapeo con campo ignorado
        CreateMap<Usuario, UsuarioDto>()
            .ForMember(dest => dest.PasswordHash, opt => opt.Ignore());
    }
}
```

### Registro en DI

```csharp
// Program.cs
builder.Services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
```

`AppDomain.CurrentDomain.GetAssemblies()` le dice a AutoMapper que busque todos los perfiles en todos los assemblies del proyecto. Solo lo configuras una vez.

### Uso en el controller

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductosController(
    IGenericRepository<Producto> repo,
    IMapper mapper
) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductoDto>> GetProducto(int id)
    {
        var producto = await repo.GetByIdAsync(id);
        if (producto == null) return NotFound();

        return Ok(mapper.Map<ProductoDto>(producto));  // ← AutoMapper hace el trabajo
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProductoDto>>> GetProductos()
    {
        var productos = await repo.ListAllAsync();
        return Ok(mapper.Map<IReadOnlyList<ProductoDto>>(productos));
    }
}
```

`mapper.Map<ProductoDto>(producto)` — le dices el tipo destino y AutoMapper busca el perfil que sabe cómo hacer esa conversión.

### Mapeo de listas

```csharp
// Mapea una lista entera de una sola vez
var dtos = mapper.Map<IReadOnlyList<ProductoDto>>(productos);
```

AutoMapper maneja colecciones automáticamente. No necesitas un `.Select()` manual.

El perfil completo para `Producto` se ve así:

```csharp
public class MappingProfiles : Profile
{
    public MappingProfiles()
    {
        // Producto → ProductoDto
        // CategoriaNombre no matchea directo — lo mapeamos manualmente
        CreateMap<Producto, ProductoDto>()
            .ForMember(dest => dest.CategoriaNombre,
                       opt => opt.MapFrom(src => src.Categoria != null
                           ? src.Categoria.Nombre
                           : null));

        // Producto → ProductoSummaryDto
        CreateMap<Producto, ProductoSummaryDto>()
            .ForMember(dest => dest.CategoriaNombre,
                       opt => opt.MapFrom(src => src.Categoria != null
                           ? src.Categoria.Nombre
                           : null));

        // CreateProductoDto → Producto
        // Id, Activo y CreadoEn los pone el sistema — los ignoramos
        CreateMap<CreateProductoDto, Producto>()
            .ForMember(dest => dest.Id,        opt => opt.Ignore())
            .ForMember(dest => dest.Activo,    opt => opt.Ignore())
            .ForMember(dest => dest.CreadoEn,  opt => opt.Ignore())
            .ForMember(dest => dest.Categoria, opt => opt.Ignore());

        // UpdateProductoDto → Producto (mapeo sobre entidad existente)
        CreateMap<UpdateProductoDto, Producto>()
            .ForMember(dest => dest.Id,        opt => opt.Ignore())
            .ForMember(dest => dest.CreadoEn,  opt => opt.Ignore())
            .ForMember(dest => dest.Categoria, opt => opt.Ignore());
    }
}
```

`ForMember` + `Ignore()` es importante para los campos que el sistema controla — `Id`, `CreadoEn`, `Activo`. Si no los ignoras, AutoMapper los sobreescribe con los valores del DTO — que pueden ser `null` o `0` — y corrompes la entidad.

:::tip Cuándo usar AutoMapper
- Cuando las entidades y DTOs tienen nombres de campos similares o iguales
- Cuando tienes muchas entidades y no quieres escribir un mapper por cada una
- Cuando el equipo ya lo conoce y está estandarizado en el proyecto
:::

---

## El contraste — cuál elegir

| | Mapper estático | AutoMapper |
|---|---|---|
| Código | Explícito — ves exactamente qué pasa | Implícito — la magia está en el perfil |
| Flexibilidad | Total — puedes hacer cualquier cosa | Alta — con `ForMember` para casos custom |
| Parámetros extra | Fácil — son argumentos del método | Difícil — necesitas `IValueResolver` |
| Rendimiento | Más rápido — sin reflexión | Levemente más lento — usa reflexión |
| Curva de aprendizaje | Cero | Media — hay que entender los perfiles |
| Errores en runtime | No — falla en compilación | Sí — puede fallar en runtime si el perfil está mal |

*AutoMapper falla en runtime. Eso significa que el bug existe desde el deploy y no lo encuentras hasta que alguien hace la request.*

No es un argumento para no usarlo. Es un argumento para siempre llamar `mapper.ConfigurationProvider.AssertConfigurationIsValid()` en los tests.

---

## El patrón que se repite — ToResponse y ToSummary

Sea cual sea el enfoque que elijas, vas a necesitar dos versiones del DTO para casi toda entidad:

```
ClientResponse      ← detalle completo, para GET /api/clients/{id}
ClientSummaryResponse ← versión reducida, para GET /api/clients (lista paginada)
```

Por qué. Porque en una lista de 100 clientes no necesitas las direcciones completas de cada uno, los pagos, las facturas. Solo el nombre, el número, el estado. Devolver el objeto completo en un listado es uno de los problemas de performance más comunes — y más fáciles de evitar.

Dos DTOs. Una entidad. Cada uno para su contexto.

Siempre.

---

## El DTO de creación

Cuando el cliente manda datos para crear algo, también necesita su propio DTO — el de entrada:

```csharp
// DTO de entrada — lo que el cliente manda
public record CreateClientRequest(
    string Name,
    string EIN,
    string OwnerName,
    Guid? BusinessCategoryId,
    string? Email,
    string? Phone,
    string State,
    string ZipCode,
    ClientType Type
);

// DTO de salida — lo que el cliente recibe
public record ClientResponse(
    Guid Id,
    int ClientNumber,
    string Name,
    // ...
);
```

El DTO de entrada no tiene `Id` — ese lo genera el sistema. No tiene `CreatedAt` — eso también lo pone el sistema. No tiene `IsActive` — empieza activo por defecto.

El cliente manda lo que sabe. El sistema pone lo que falta.

---

**Siguiente:** [Manejo de errores →](./errores)