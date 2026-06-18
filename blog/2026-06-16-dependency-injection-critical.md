---
slug: dependency-injection-critical
title: Por qué la Inyección de Dependencias es crítica (y no solo por los tests)
authors: [andder]
tags: [dotnet, architecture, di]
---

Cada vez que veo código donde el controller instancia un `DbContext` con `new`, siento el mismo escalofrío. No es solo que el código no sea testeable — es que el ciclo de vida de los objetos está fuera de control.

La Inyección de Dependencias no es una moda ni una complicación innecesaria. Es la diferencia entre una app que puedes mantener y una que terminas reescribiendo.

<!-- truncate -->

### El problema real no es el testeo

Sí, DI hace que el código sea testeable. Pero el beneficio más importante va por otro lado: el control del ciclo de vida.

```csharp
// Sin DI — cada request crea su propio DbContext sin control
public class ProductosController : ControllerBase
{
    public async Task<ActionResult<Producto>> GetProducto(int id)
    {
        using var context = new AppDbContext();
        return Ok(await context.Productos.FindAsync(id));
    }
}
```

Si tienes 5 endpoints que usan `DbContext` en el mismo request, cada uno crea su propia instancia. Cada una con su propio Change Tracker. Los cambios que haces en un endpoint no los ve el otro. Y cuando olvidas el `using`, las conexiones se acumulan hasta que la base de datos dice basta.

### El contenedor de DI resuelve eso

Con DI registras el ciclo de vida una vez:

```csharp
builder.Services.AddScoped<AppDbContext>();
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
```

`Scoped` significa una instancia por request. Todos los servicios del mismo request comparten el mismo `DbContext`. Un solo Change Tracker. Una sola transacción. Consistencia garantizada.

### El error más común: Captive Dependency

He visto este bug en producción más veces de las que me gustaría admitir:

```csharp
builder.Services.AddSingleton<IProductoService, ProductoService>();
builder.Services.AddScoped<IProductoRepository, ProductoRepository>();
```

El Singleton captura al Scoped. El repositorio vive para siempre — con el `DbContext` del primer request. Del segundo request en adelante, estás escribiendo datos sobre un contexto muerto. .NET detecta esto en desarrollo, pero en producción a veces pasa desapercibido hasta que alguien nota que los datos no se guardan.

### La regla simple

Un servicio solo puede depender de servicios de igual o mayor duración. Singleton depende de Singleton. Scoped depende de Singleton o Scoped. Transient puede depender de cualquiera.

En [Anndev Docs](https://anderj14.github.io/anndev-docs/) dedico un capítulo completo a DI con ejemplos de código real, incluyendo cómo organizar los registros con extension methods, cómo evitar captive dependencies, y cómo primary constructors de C# 12 hacen todo más limpio.
