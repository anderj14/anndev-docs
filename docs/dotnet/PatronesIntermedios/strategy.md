---
sidebar_position: 1
title: Strategy Pattern
description: Reglas de negocio intercambiables sin if/else gigantes — la tarifa de una reservación que cambia según el cliente.
---

# Strategy Pattern

Tienes una regla de negocio que cambia según el contexto.

En **Rent Car**, el precio de una reservación depende del tipo de cliente:

- Un cliente regular paga la tarifa estándar.
- Un cliente frecuente tiene 15% de descuento.
- Una empresa tiene una tarifa corporativa por contrato.
- En temporada alta, todo sube 20%.

El primer impulso es escribir esto:

```csharp
public decimal CalcularPrecio(Reservacion r)
{
    var basePorDia = r.Vehiculo.TarifaDiaria;
    var dias = (r.FechaFin - r.FechaInicio).Days;

    decimal precio;

    if (r.Cliente.EsClienteFrecuente)
        precio = basePorDia * dias * 0.85m;
    else if (r.Cliente.EsCorporativo)
        precio = r.Cliente.TarifaCorporativa * dias;
    else
        precio = basePorDia * dias;

    if (r.FechaInicio.Month == 7 || r.FechaInicio.Month == 12)
        precio *= 1.20m;

    return precio;
}
```

Funciona. Y esconde una bomba de tiempo.

---

## El problema — la regla que crece

Ese `if/else` parece inofensivo porque hoy son cuatro casos.

El mes que viene llega un contrato nuevo con otra empresa. Agregas un `else if`.

Luego el seguro tiene su propia lógica de descuento. Otro `else if`.

Luego un cupón. Luego "depende del vehículo". Luego "si el cliente es VIP y paga con tarjeta de empresa".

En seis meses, `CalcularPrecio` es 400 líneas, no lo entiende nadie, y cada cambio nuevo rompe un caso que no tenías en mente.

**El Strategy Pattern resuelve esto con una idea simple: cada variante de la regla es una clase separada que implementa la misma interfaz. El código que usa la regla no sabe cuál variante es — solo sabe que hay una.**

---

## La idea central

Separas dos cosas que estaban mezcladas:

1. **Qué** se calcula — el precio de la reservación.
2. **Cómo** se calcula — la tarifa según el tipo de cliente.

El `Qué` no cambia. El `Cómo` es una familia de estrategias intercambiables.

```
ReservacionesController
    ↓ elige la estrategia según el cliente
TarifaEstándar | TarifaFrecuente | TarifaCorporativa | TarifaTemporadaAlta
    ↑ todas implementan IPrecioStrategy
```

El controller le pregunta al cliente qué estrategia usar, la recibe, y la llama. No sabe — ni le importa — cómo calcula el precio cada una.

---

## La interfaz

```csharp
public interface IPrecioStrategy
{
    decimal CalcularPrecio(Reservacion reservacion);
}
```

Eso es todo. Un solo método.

Las estrategias concretas:

```csharp
public class TarifaEstandarStrategy : IPrecioStrategy
{
    public decimal CalcularPrecio(Reservacion r)
    {
        var dias = (r.FechaFin - r.FechaInicio).Days;
        return r.Vehiculo.TarifaDiaria * dias;
    }
}

public class TarifaClienteFrecuenteStrategy : IPrecioStrategy
{
    private const decimal Descuento = 0.15m;

    public decimal CalcularPrecio(Reservacion r)
    {
        var dias = (r.FechaFin - r.FechaInicio).Days;
        return r.Vehiculo.TarifaDiaria * dias * (1 - Descuento);
    }
}

public class TarifaCorporativaStrategy : IPrecioStrategy
{
    public decimal CalcularPrecio(Reservacion r)
    {
        var dias = (r.FechaFin - r.FechaInicio).Days;
        return r.Cliente.TarifaCorporativa * dias;
    }
}
```

Cada regla vive en su propia clase. Aislada. Con un nombre que dice qué hace. Sin tocar a las demás.

Agregar una tarifa nueva no modifica nada de lo que ya existe — solo agrega una clase nueva.

*Eso es el principio O de SOLID — Open/Closed. Abierto a extensión, cerrado a modificación.*

---

## Quién decide la estrategia

Alguien tiene que elegir qué estrategia usar. Ese "alguien" se llama **contexto**.

En Rent Car, la decisión depende del cliente — es una regla de negocio que vive en el dominio:

```csharp
public static class PrecioStrategyFactory
{
    public static IPrecioStrategy Crear(Cliente cliente)
    {
        if (cliente.EsCorporativo)
            return new TarifaCorporativaStrategy();

        if (cliente.EsClienteFrecuente)
            return new TarifaClienteFrecuenteStrategy();

        return new TarifaEstandarStrategy();
    }
}
```

Y el controller queda limpio:

```csharp
[HttpPost]
public async Task<ActionResult<decimal>> Cotizar(Reservacion reservacion)
{
    var estrategia = PrecioStrategyFactory.Crear(reservacion.Cliente);
    var precio = estrategia.CalcularPrecio(reservacion);
    return Ok(new { precio });
}
```

El `if/else` existe — pero ahora está **en un solo lugar**, y lo que decide es **qué** estrategia usar, no **cómo** calcular el precio. Cuando llega un contrato nuevo, tocas el factory — no el cálculo.

---

## Strategy vs. los if/else que conoces

| | `if/else` inline | Strategy Pattern |
|---|---|---|
| Dónde vive la regla | Dentro del método | En su propia clase |
| Agregar una variante | Modificas el método | Agregas una clase |
| Riesgo de romper otra variante | Alto — todo en el mismo bloque | Nulo — las clases no se tocan |
| Testear una variante | Difícil — hay que llegar hasta el branch | Fácil — test directo a la clase |
| Reutilizar en otro endpoint | Copiar y pegar | Usar la misma estrategia |

---

## El caso de la Distribuidora de Alimentos — estrategias sin interfaz

No siempre necesitas el patrón completo.

La **Distribuidora de Alimentos** calcula el flete de cada compra según el transportista. Son reglas que no se repiten en otros lugares del sistema — el cálculo vive solo en el módulo de compras.

```csharp
public enum Transportista
{
    Trac,       // región norte
    Castores,   // región centro
    Local       // ciudad
}

public class ComprasRepository
{
    public decimal CalcularFlete(Transportista transportista, decimal pesoKg)
    {
        return transportista switch
        {
            Transportista.Trac     => pesoKg * 2.5m,
            Transportista.Castores => pesoKg * 1.8m + 50m,
            Transportista.Local    => 100m,
            _ => throw new ArgumentOutOfRangeException(nameof(transportista))
        };
    }
}
```

Aquí un `switch` sobre el transportista es suficiente. La regla es corta, no cambia frecuentemente, y no necesitas testear cada variante de forma aislada.

Cuando las reglas son simples y pocas, el `switch` es más código del que necesita el problema.

*Strategy Pattern resuelve el problema de reglas que crecen. Si tu regla no crece, no lo fuerces.*

---

## Una variante más interesante — estrategias que se componen

La temporada alta complica el ejemplo de la tarifa: no es una tarifa distinta, es un **recargo** que se aplica sobre cualquier tarifa.

```csharp
public class TarifaTemporadaAltaDecorator : IPrecioStrategy
{
    private readonly IPrecioStrategy _base;
    private const decimal Recargo = 0.20m;

    public TarifaTemporadaAltaDecorator(IPrecioStrategy base)
    {
        _base = base;
    }

    public decimal CalcularPrecio(Reservacion r)
    {
        if (EsTemporadaAlta(r.FechaInicio))
            return _base.CalcularPrecio(r) * (1 + Recargo);

        return _base.CalcularPrecio(r);
    }
}
```

Una estrategia que envuelve otra estrategia. El cliente frecuente en julio no es un caso nuevo — es `TarifaClienteFrecuenteStrategy` envuelta en `TarifaTemporadaAltaDecorator`.

*Nota: esto se llama Decorator Pattern, y lo vamos a ver en detalle en el siguiente capítulo.*

---

## Registrarlas en DI

```csharp
// Program.cs
builder.Services.AddScoped<IPrecioStrategy, TarifaEstandarStrategy>();
builder.Services.AddScoped<IPrecioStrategy, TarifaClienteFrecuenteStrategy>();
builder.Services.AddScoped<IPrecioStrategy, TarifaCorporativaStrategy>();
```

Todas con la misma interfaz — .NET las resuelve como `IEnumerable<IPrecioStrategy>`:

```csharp
public class CotizadorService(IEnumerable<IPrecioStrategy> estrategias)
{
    public IPrecioStrategy Obtener(Cliente cliente)
    {
        return estrategias.First(e => e.PerteneceA(cliente));
    }
}
```

En vez de un factory manual, el contenedor de DI te da todas las estrategias registradas y el servicio elige. Mismo resultado, menos infraestructura.

---

## Cuándo usar Strategy Pattern

Úsalo cuando:

- Tienes varias variantes de la misma regla de negocio.
- Las variantes cambian en runtime (según el cliente, el vehículo, el tipo de orden).
- Las variantes van a crecer con el tiempo.
- Cada variante tiene suficiente lógica como para merecer su propia clase.

No lo uses cuando:

- Hay dos o tres variantes simples que nunca cambian.
- La regla es un cálculo corto sin lógica extra.
- Necesitas leer el comportamiento de un solo vistazo en un solo lugar.

El patrón agrega indirección. Esa indirección se paga con claridad — cuando el número de variantes justifica el costo.

---

## El resumen

| Concepto | Qué hace |
|---|---|
| `IPrecioStrategy` | Contrato — todas las variantes implementan el mismo método |
| `TarifaEstandarStrategy` | Regla base — tarifa diaria del vehículo |
| `TarifaClienteFrecuenteStrategy` | Regla con descuento |
| `TarifaCorporativaStrategy` | Regla con tarifa por contrato |
| `PrecioStrategyFactory` | Decide qué variante usar según el contexto |
| Strategy que envuelve Strategy | Compone reglas sin crear casos nuevos (Decorator) |

El `if/else` no desaparece — se concentra en un solo lugar y deja de decidir **cómo** para pasar a decidir **qué**.

Cada regla de negocio nueva es una clase nueva. Los tests son directos. El código que usa la regla no se toca nunca.

La única razón por la que el `if/else` gigante era tolerable es que nunca había llegado el día en que la regla creció. Ese día siempre llega.

El siguiente capítulo — Decorator Pattern — es la evolución natural de la idea que viste al final de esta página: estrategias que se envuelven unas a otras sin cambiar lo que ya funciona.
