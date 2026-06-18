---
sidebar_position: 6
title: Entity Framework Core
description: DbContext, migraciones, relaciones y configuración — explicado paso a paso desde cero.
---

# Entity Framework Core

EF Core es el ORM de .NET.

ORM — Object Relational Mapper. Traduce entre el mundo de los objetos en C# y el mundo de las tablas en SQL.

Sin EF Core escribes SQL a mano. Mapeas los resultados a objetos a mano. Manejas las conexiones a mano.

Con EF Core escribes C#. EF Core genera el SQL.

*No es magia. Es una capa de abstracción muy bien hecha.*

---

## Instalación

```bash
# EF Core con SQL Server
dotnet add package Microsoft.EntityFrameworkCore.SqlServer

# EF Core con MySQL
dotnet add package Pomelo.EntityFrameworkCore.MySql

# EF Core con PostgreSQL
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL

# Herramientas de CLI para migraciones
dotnet add package Microsoft.EntityFrameworkCore.Tools
dotnet tool install --global dotnet-ef
```

Elige el paquete del proveedor según tu base de datos. Las herramientas de CLI van aparte — son las que te dan el comando `dotnet ef` para crear migraciones.

---

## El `DbContext` — el corazón de EF Core

El `DbContext` es la puerta de entrada a la base de datos. Representa una sesión con la DB — puedes hacer queries, guardar cambios, y EF Core gestiona la conexión por ti.

```csharp
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Producto> Productos { get; set; }
    public DbSet<Categoria> Categorias { get; set; }
    public DbSet<Orden> Ordenes { get; set; }
    public DbSet<Cliente> Clientes { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
```

### Línea por línea

```csharp
public class AppDbContext : DbContext
```

Hereda de `DbContext` — la clase base de EF Core. Todo lo que necesitas para interactuar con la DB viene de ahí.

```csharp
public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
```

El constructor recibe `DbContextOptions<AppDbContext>` — la configuración de la conexión, el proveedor (SQL Server, MySQL, etc.), y opciones adicionales. Lo inyectas desde DI — no lo construyes tú.

```csharp
public DbSet<Producto> Productos { get; set; }
```

`DbSet<T>` representa una tabla en la DB. `Productos` es la tabla de productos. Con este `DbSet` puedes hacer queries — `_context.Productos.Where(...)`, `_context.Productos.FindAsync(id)`, etc.

No necesitas declarar un `DbSet` para cada entidad — EF Core puede descubrir entidades a través de las relaciones. Pero declarar los `DbSet` explícitamente hace el código más legible y te da acceso directo desde el contexto.

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
}
```

`OnModelCreating` es donde configuras el modelo — relaciones, índices, restricciones, nombres de tablas. Se llama una vez cuando EF Core construye el modelo en memoria.

`ApplyConfigurationsFromAssembly` busca todas las clases que implementan `IEntityTypeConfiguration<T>` en el assembly y las aplica automáticamente. Eso mantiene el `DbContext` limpio — en lugar de poner toda la configuración ahí, la separas en archivos propios.

---

## Registrar el `DbContext` en DI

```csharp
// Program.cs
builder.Services.AddDbContext<AppDbContext>(opt =>
{
    opt.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
});
```

`AddDbContext` registra el contexto como `Scoped` automáticamente — una instancia por request. No necesitas escribir `AddScoped` tú mismo.

El connection string vive en `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=MiApp;Trusted_Connection=True;"
  }
}
```

Para MySQL:

```csharp
opt.UseMySQL(builder.Configuration.GetConnectionString("DefaultConnection"));
```

Para PostgreSQL:

```csharp
opt.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
```

---

## Las entidades — cómo se mapean a tablas

Por convención, EF Core mapea automáticamente:

```csharp
public class Producto
{
    public int Id { get; set; }           // PK — por convención si se llama Id
    public string Nombre { get; set; }    // columna Nombre
    public decimal Precio { get; set; }   // columna Precio
    public int CategoriaId { get; set; }  // FK hacia Categoria
    public Categoria Categoria { get; set; } // navigation property
}
```

Sin configuración extra, EF Core:
- Usa `Id` como clave primaria
- Mapea `Nombre` a la columna `Nombre`
- Detecta `CategoriaId` como foreign key de `Categoria`
- Crea la tabla `Productos` (plural del nombre de la clase)

Convención sobre configuración. Si sigues las convenciones, no necesitas decirle nada.

---

## Configuración de entidades — `IEntityTypeConfiguration<T>`

Cuando las convenciones no son suficientes — nombres de tabla diferentes, columnas con restricciones, índices, etc. — usas configuración explícita:

```csharp
public class ProductoConfiguration : IEntityTypeConfiguration<Producto>
{
    public void Configure(EntityTypeBuilder<Producto> builder)
    {
        // Nombre de tabla explícito
        builder.ToTable("tb_productos");

        // Clave primaria
        builder.HasKey(p => p.Id);

        // Propiedades
        builder.Property(p => p.Nombre)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(p => p.Precio)
            .HasColumnType("decimal(18,2)");

        // Índice único
        builder.HasIndex(p => p.Nombre)
            .IsUnique();

        // Relación con Categoria
        builder.HasOne(p => p.Categoria)
            .WithMany(c => c.Productos)
            .HasForeignKey(p => p.CategoriaId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
```

### Línea por línea

```csharp
builder.ToTable("tb_productos");
```

Nombre de tabla explícito. Útil cuando trabajas con una DB existente donde los nombres de tablas no siguen la convención de EF Core — como en la Distribuidora de Alimentos con `tb_invarticulos`, `tb_matrizpreciov`, etc.

```csharp
builder.Property(p => p.Nombre)
    .IsRequired()
    .HasMaxLength(100);
```

`IsRequired()` — la columna no puede ser `NULL` en la DB. `HasMaxLength(100)` — `VARCHAR(100)` en SQL. EF Core traduce estas configuraciones al DDL correcto según el proveedor.

```csharp
builder.Property(p => p.Precio)
    .HasColumnType("decimal(18,2)");
```

Tipo de columna explícito. `decimal(18,2)` — hasta 18 dígitos totales, 2 decimales. Importante para precios — sin esto EF Core puede elegir una precisión que no te conviene.

```csharp
builder.HasIndex(p => p.Nombre)
    .IsUnique();
```

Índice único en la columna `Nombre`. EF Core genera el índice en la migración. Si intentas insertar dos productos con el mismo nombre, la DB lanza una excepción de constraint violation.

```csharp
builder.HasOne(p => p.Categoria)
    .WithMany(c => c.Productos)
    .HasForeignKey(p => p.CategoriaId)
    .OnDelete(DeleteBehavior.Restrict);
```

Relación explícita. `HasOne...WithMany` — un producto tiene una categoría, una categoría tiene muchos productos. `HasForeignKey` — la columna que es FK. `OnDelete(DeleteBehavior.Restrict)` — no puedes eliminar una categoría si tiene productos.

---

## Relaciones — los tres tipos

### Uno a muchos — el más común

```csharp
// Una Categoria tiene muchos Productos
public class Categoria
{
    public int Id { get; set; }
    public string Nombre { get; set; }
    public ICollection<Producto> Productos { get; set; } = new List<Producto>();
}

public class Producto
{
    public int Id { get; set; }
    public string Nombre { get; set; }
    public int CategoriaId { get; set; }    // ← FK
    public Categoria Categoria { get; set; } // ← navigation property
}
```

Configuración:

```csharp
builder.HasOne(p => p.Categoria)       // Producto tiene una Categoria
    .WithMany(c => c.Productos)         // Categoria tiene muchos Productos
    .HasForeignKey(p => p.CategoriaId)  // la FK está en Producto
    .OnDelete(DeleteBehavior.Restrict); // no borrar Categoria si tiene Productos
```

`ICollection<Producto>` en `Categoria` es la **navigation property** del lado de la colección. `= new List<Producto>()` la inicializa — sin esto, `categoria.Productos` es `null` y al iterar explota.

### Uno a uno

```csharp
// Un Cliente tiene un Perfil
public class Cliente
{
    public int Id { get; set; }
    public string Nombre { get; set; }
    public Perfil? Perfil { get; set; }
}

public class Perfil
{
    public int Id { get; set; }
    public int ClienteId { get; set; }  // ← FK
    public string? AvatarUrl { get; set; }
    public Cliente Cliente { get; set; }
}
```

Configuración:

```csharp
builder.HasOne(p => p.Cliente)
    .WithOne(c => c.Perfil)
    .HasForeignKey<Perfil>(p => p.ClienteId);
```

`WithOne` en lugar de `WithMany`. `HasForeignKey<Perfil>` especifica explícitamente en qué entidad vive la FK — en relaciones uno a uno EF Core a veces no lo puede inferir solo.

### Muchos a muchos

```csharp
// Un Producto puede estar en muchas Ordenes
// Una Orden puede tener muchos Productos
public class Producto
{
    public int Id { get; set; }
    public string Nombre { get; set; }
    public ICollection<OrdenProducto> OrdenesProductos { get; set; } = new List<OrdenProducto>();
}

public class Orden
{
    public int Id { get; set; }
    public DateTime Fecha { get; set; }
    public ICollection<OrdenProducto> OrdenesProductos { get; set; } = new List<OrdenProducto>();
}

// Tabla intermedia con datos extra (cantidad, precio al momento de la compra)
public class OrdenProducto
{
    public int OrdenId { get; set; }
    public int ProductoId { get; set; }
    public int Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }

    public Orden Orden { get; set; }
    public Producto Producto { get; set; }
}
```

Configuración de la tabla intermedia:

```csharp
public class OrdenProductoConfiguration : IEntityTypeConfiguration<OrdenProducto>
{
    public void Configure(EntityTypeBuilder<OrdenProducto> builder)
    {
        // PK compuesta
        builder.HasKey(op => new { op.OrdenId, op.ProductoId });

        builder.HasOne(op => op.Orden)
            .WithMany(o => o.OrdenesProductos)
            .HasForeignKey(op => op.OrdenId);

        builder.HasOne(op => op.Producto)
            .WithMany(p => p.OrdenesProductos)
            .HasForeignKey(op => op.ProductoId);
    }
}
```

`builder.HasKey(op => new { op.OrdenId, op.ProductoId })` — clave primaria compuesta. No necesitas un `Id` separado cuando la combinación de las dos FKs es única.

:::tip EF Core 5+ tiene muchos a muchos sin tabla explícita
Si la tabla intermedia no tiene datos extra — solo las dos FKs — EF Core puede manejar la relación automáticamente sin declarar `OrdenProducto`. Pero en la práctica casi siempre necesitas al menos `Cantidad` o `PrecioUnitario`, así que la tabla explícita es lo más común.
:::

---

## Migraciones — sincronizar el modelo con la DB

Las migraciones son la forma en que EF Core mantiene la DB sincronizada con tu modelo de C#.

Cada vez que cambias una entidad — agregas una propiedad, cambias una relación, agregas un índice — creas una migración que describe esos cambios en SQL.

### Crear una migración

```bash
dotnet ef migrations add NombreDescriptivo
```

Ejemplos de nombres:

```bash
dotnet ef migrations add InitialCreate
dotnet ef migrations add AddIndexToProductoNombre
dotnet ef migrations add AddPerfilToCliente
dotnet ef migrations add RenameColumnPrecioToPrice
```

El nombre debe describir qué cambia. `Migration1`, `Migration2` son nombres que no le dicen nada a nadie seis meses después.

EF Core genera tres archivos:

```
Migrations/
├── 20240115120000_InitialCreate.cs        ← la migración
├── 20240115120000_InitialCreate.Designer.cs ← metadata
└── AppDbContextModelSnapshot.cs           ← snapshot del modelo actual
```

### La migración generada

```csharp
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Categorias",
            columns: table => new
            {
                Id = table.Column<int>(nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Nombre = table.Column<string>(maxLength: 100, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Categorias", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "Productos",
            columns: table => new
            {
                Id = table.Column<int>(nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Nombre = table.Column<string>(maxLength: 100, nullable: false),
                Precio = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                CategoriaId = table.Column<int>(nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Productos", x => x.Id);
                table.ForeignKey(
                    name: "FK_Productos_Categorias_CategoriaId",
                    column: x => x.CategoriaId,
                    principalTable: "Categorias",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "Productos");
        migrationBuilder.DropTable(name: "Categorias");
    }
}
```

`Up` — lo que se aplica cuando avanzas la migración. `Down` — lo que se aplica cuando la reviertes. EF Core genera ambos automáticamente.

Nunca edites una migración que ya aplicaste en producción. Si cometiste un error, crea una nueva migración que lo corrija.

### Aplicar migraciones

```bash
# Aplica todas las migraciones pendientes
dotnet ef database update

# Aplica hasta una migración específica
dotnet ef database update InitialCreate

# Revierte hasta una migración específica
dotnet ef database update PreviousMigration
```

### Aplicar migraciones al arrancar la app

En desarrollo es conveniente aplicar las migraciones automáticamente al arrancar:

```csharp
// Program.cs
try
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<AppDbContext>();
    await context.Database.MigrateAsync();
}
catch (Exception ex)
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    logger.LogError(ex, "Error aplicando migraciones");
    throw;
}
```

`MigrateAsync()` aplica todas las migraciones pendientes. Si ya están aplicadas, no hace nada. Si la DB no existe, la crea.

:::danger No uses MigrateAsync en producción sin cuidado
En producción las migraciones deberían aplicarse como parte del proceso de deployment — no automáticamente al arrancar. Si dos instancias de tu app arrancan al mismo tiempo, las dos intentan migrar simultáneamente y puede haber conflictos. Usa pipelines de CI/CD para controlar cuándo se aplican.
:::

---

## El Change Tracker — cómo EF Core sabe qué guardar

Cuando cargas una entidad con EF Core, el Change Tracker la registra en memoria:

```csharp
var producto = await _context.Productos.FindAsync(id);
// → El Change Tracker registra producto con estado Unchanged

producto.Precio = 899.99m;
// → El Change Tracker detecta el cambio → estado Modified

await _context.SaveChangesAsync();
// → EF Core genera: UPDATE Productos SET Precio = 899.99 WHERE Id = 5
```

No necesitas llamar `Update` explícitamente si cargaste la entidad en el mismo contexto. El Change Tracker detecta los cambios automáticamente al guardar.

### Los estados del Change Tracker

```csharp
// Detached — EF Core no sabe que existe
var producto = new Producto { Nombre = "Laptop" };

// Added — va a insertarse
_context.Productos.Add(producto);

// Unchanged — cargado, sin cambios
var cargado = await _context.Productos.FindAsync(id);

// Modified — cargado y modificado
cargado.Precio = 999.99m;

// Deleted — va a eliminarse
_context.Productos.Remove(cargado);

// Todos los cambios se aplican juntos
await _context.SaveChangesAsync();
```

### `AsNoTracking()` — cuando no necesitas el tracker

```csharp
// Con tracking — más lento, útil si vas a modificar
var productos = await _context.Productos.ToListAsync();

// Sin tracking — más rápido, solo para lecturas
var productos = await _context.Productos
    .AsNoTracking()
    .ToListAsync();
```

`AsNoTracking()` desactiva el Change Tracker para esa query. EF Core no registra los objetos en memoria — las queries son más rápidas y consumen menos memoria. Úsalo siempre que no vayas a modificar los datos.

En el `GenericRepository<T>` lo viste en `FindAsync`:

```csharp
public async Task<IEnumerable<T>> FindAsync(
    Expression<Func<T, bool>> predicate,
    bool disableTracking = true)
{
    IQueryable<T> query = _context.Set<T>();

    if (disableTracking)
        query = query.AsNoTracking();  // ← desactiva el tracker por defecto

    query = query.Where(predicate);
    return await query.ToListAsync();
}
```

---

## Lazy Loading vs Eager Loading

Dos formas de cargar relaciones. Dos consecuencias muy distintas.

### Eager Loading — carga explícita con `Include`

```csharp
// Carga el Producto Y su Categoria en una sola query
var producto = await _context.Productos
    .Include(p => p.Categoria)
    .FirstOrDefaultAsync(p => p.Id == id);

// SQL generado:
// SELECT p.*, c.*
// FROM Productos p
// LEFT JOIN Categorias c ON p.CategoriaId = c.Id
// WHERE p.Id = 5
```

Una query. Predecible. El control es tuyo — decides qué cargar explícitamente.

Es la forma recomendada. Siempre.

### Lazy Loading — carga automática al acceder

```csharp
// Sin Include — categoria empieza como null
var producto = await _context.Productos.FindAsync(id);

// Al acceder a la propiedad, EF Core hace otra query automáticamente
var nombre = producto.Categoria.Nombre; // ← query aquí
```

Suena conveniente. No lo es.

El problema — si tienes una lista de 100 productos y accedes a `producto.Categoria` en cada uno, EF Core hace 100 queries adicionales. Una por producto. Eso se llama el **problema N+1**.

:::danger Evita Lazy Loading en APIs
Lazy Loading requiere que el `DbContext` esté vivo cuando accedes a la propiedad. En una API el contexto muere al terminar el request — si devuelves la entidad al controller y el serializer intenta acceder a las relaciones, el contexto ya no existe y explota.

Usa Eager Loading con `Include`. Siempre explícito. Siempre predecible.
:::

---

## Seed data — datos iniciales

Para cargar datos iniciales en la DB — catálogos, roles, configuraciones:

```csharp
public class CategoriaConfiguration : IEntityTypeConfiguration<Categoria>
{
    public void Configure(EntityTypeBuilder<Categoria> builder)
    {
        builder.Property(c => c.Nombre)
            .IsRequired()
            .HasMaxLength(100);

        // Seed data — se aplica en las migraciones
        builder.HasData(
            new Categoria { Id = 1, Nombre = "Electrónica" },
            new Categoria { Id = 2, Nombre = "Ropa" },
            new Categoria { Id = 3, Nombre = "Alimentos" }
        );
    }
}
```

`HasData` agrega los registros en la migración. EF Core genera los `INSERT` correspondientes. Los IDs tienen que ser valores fijos — EF Core los necesita para detectar si los datos ya existen o si cambiaron.

---

## El flujo completo — de entidad a DB y de vuelta

```
// 1. Defines la entidad
public class Producto : BaseEntity
{
    public string Nombre { get; set; }
    public decimal Precio { get; set; }
    public int CategoriaId { get; set; }
    public Categoria Categoria { get; set; }
}

// 2. La configuras (opcional si sigues convenciones)
public class ProductoConfiguration : IEntityTypeConfiguration<Producto> { ... }

// 3. La registras en el DbContext
public DbSet<Producto> Productos { get; set; }

// 4. Creas la migración
dotnet ef migrations add AddProducto

// 5. Aplicas la migración
dotnet ef database update

// 6. Usas el repositorio
var producto = await repo.GetByIdAsync(id);
producto.Precio = 899.99m;
repo.Update(producto);
await unitOfWork.Complete();
// → UPDATE Productos SET Precio = 899.99 WHERE Id = 5
```

---

## El resumen

| Concepto | Qué hace |
|---|---|
| `DbContext` | Sesión con la DB — queries y SaveChanges |
| `DbSet<T>` | Representa una tabla |
| `IEntityTypeConfiguration<T>` | Configuración explícita de la entidad |
| `OnModelCreating` | Aplica toda la configuración al modelo |
| `Migration` | Describe cambios del modelo en SQL |
| `dotnet ef migrations add` | Crea una migración |
| `dotnet ef database update` | Aplica migraciones pendientes |
| Change Tracker | Detecta cambios automáticamente |
| `AsNoTracking()` | Queries de solo lectura — más rápidas |
| Eager Loading | `Include()` — carga explícita, siempre predecible |
| Lazy Loading | Carga automática al acceder — evítalo en APIs |

EF Core no elimina la necesidad de entender SQL.

Lo que hace es que no tengas que escribirlo para el 90% de los casos. El otro 10% — queries complejas, optimizaciones, joins sin FK — lo manejas con raw SQL o Dapper cuando EF Core no es suficiente.

*Conoce la herramienta. Y sabe cuándo no usarla.*

---

**Siguiente:** [Strategy Pattern →](./specification.md)