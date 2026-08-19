---
sidebar_position: 1
title: Strategy Pattern
description: Reglas de negocio intercambiables sin if/else gigantes y con ejemplos chistosos.
---

# Strategy Pattern

Escúchame bien.

Hay algo que ves en el 99% del código legacy en el mundo.

Un método así:

```csharp
public decimal CalcularDescuento(string tipoCliente, decimal monto)
{
    if (tipoCliente == "VIP")
        return monto * 0.20m;
    else if (tipoCliente == "Premium")
        return monto * 0.15m;
    else if (tipoCliente == "Regular")
        return monto * 0.05m;
    else if (tipoCliente == "BlackMarket")
        return monto * 0.50m;
    else if (tipoCliente == "Influencer")
        return monto * 0.00m; // Free, para que publique
    else if (tipoCliente == "Yo")
        return monto * 1.50m; // Descuento negativo lol
    else
        return 0;
}
```

*Luego llega tu jefe.*

"Andder, necesitamos un nuevo tipo: **GovernmentEmployee**."

Abres el archivo. Agregas un `else if` más.

Luego llega otro: "**Startup**."

Otro `else if`.

Seis meses después el método tiene 40 líneas. Es un if/else que se reproduce como ameba.

Y lo peor: no puedes testear cada rama sin repetir strings mágicos.

*Eso no es código. Eso es deuda técnica en forma de if.*

---

## El problema — lo que te enseñaron en la universidad (y por qué está mal)

Permíteme hacer una pausa aquí.

En la universidad probablemente te hicieron esto:

```csharp
public decimal CalcularPrecioFinal(string tipo, decimal monto, bool tieneCupon, 
                                    bool esNuevoCliente, bool esWeekend, 
                                    string pais, int cantidadCompras)
{
    if (tipo != null)
    {
        if (tipo == "VIP")
        {
            if (tieneCupon)
            {
                if (esNuevoCliente)
                {
                    if (esWeekend)
                    {
                        if (pais == "AR")
                        {
                            if (cantidadCompras > 10)
                            {
                                return monto * 0.10m; // 7 llaves anidadas
                            }
                            else
                            {
                                return monto * 0.08m;
                            }
                        }
                        else
                        {
                            return monto * 0.05m;
                        }
                    }
                    else
                    {
                        return monto * 0.03m;
                    }
                }
                else
                {
                    return monto * 0.02m;
                }
            }
            else
            {
                return monto * 0.01m;
            }
        }
        else if (tipo == "Premium")
        {
            // ... otros 50 niveles de if
        }
    }
    else
    {
        return monto; // Sin descuento si es null
    }
}
```

*Mira eso.*

Siete Llaves Anidadas.

Tu profesor: "Esto es lógica de programación, Andder."

Tú: "Esto es un infierno."

**El problema es real:**

1. **No puedes testear cada rama** — necesitarías 128 combinaciones de parámetros (2^7)
2. **Un cambio explota todo** — editas un if y otros cinco se rompen
3. **Los juniors lloran** — al mes dejan de intentar entender
4. **Es imposible mantener** — en el año 2 nadie sabe qué hace

Eso que te hicieron escribir en la universidad es lo que Strategy Pattern resuelve.

*Literalmente.*

La universidad te enseñó el PROBLEMA. Aquí te enseñamos la SOLUCIÓN 😊.

---

## El problema — visualicemos esto

Imagina que cada tipo de cliente es un **algoritmo distinto** para calcular descuento.

- VIP: 20%
- Premium: 15%
- Regular: 5%
- Influencer: "No, tú anuncias, YO NO PAGO" (0%)
- Yo: "Paga doble por molestar" (150%)

El if/else mete todos los algoritmos en **un solo método**. Cuando llega uno nuevo, abres ese método y editas.

*Violación del principio Open/Closed.* El principio dice: abierto para **extensión**, cerrado para **modificación**. El if/else es exactamente al revés — abierto para modificación (editas el método cada vez) y cerrado para extensión (no puedes agregar un caso sin tocar lo que ya existe).

---

## La solución — Strategy Pattern

En lugar de un método gordo, creas una **interfaz**:

```csharp
public interface IDiscountStrategy
{
    decimal Calculate(decimal amount);
}
```

Luego cada algoritmo es su propia clase:

```csharp
public class VIPDiscountStrategy : IDiscountStrategy
{
    public decimal Calculate(decimal amount) => amount * 0.20m;
}

public class RegularDiscountStrategy : IDiscountStrategy
{
    public decimal Calculate(decimal amount) => amount * 0.05m;
}

public class InfluencerDiscountStrategy : IDiscountStrategy
{
    // El descuento es... publicidad gratis 😂
    public decimal Calculate(decimal amount) => 0m;
}
```

Y el método ahora es una línea:

```csharp
public decimal CalcularDescuento(IDiscountStrategy strategy, decimal monto)
{
    return strategy.Calculate(monto);
}
```

*Casi parece fácil ahora, ¿eh?*

---

## Línea por línea — por qué funciona esto

```csharp
public interface IDiscountStrategy
{
    decimal Calculate(decimal amount);
}
```

Contrato. Dice: "Cualquier estrategia de descuento tiene que saber calcular."

```csharp
public class VIPDiscountStrategy : IDiscountStrategy
{
    public decimal Calculate(decimal amount) => amount * 0.20m;
}
```

Una clase. Una responsabilidad. *Calcula descuento VIP*.

Si mañana cambias la fórmula de VIP de 20% a 25%, editas **esta clase**. Solo esta. No tocas nada más.

```csharp
public decimal CalcularDescuento(IDiscountStrategy strategy, decimal monto)
{
    return strategy.Calculate(monto);
}
```

El método no sabe QUÉ estrategia recibe. Solo sabe que tiene `.Calculate()`.

VIP, Premium, Regular, Influencer — todas implementan la misma interfaz. El método no sabe — ni le importa — cuál está usando.

*Eso. Es. Polimorfismo.*

---

## Ejemplo real — chistoso pero útil

Imagina que tienes una tienda online. Los clientes pagan de distinta forma:

```csharp
// ❌ Sin Strategy
public decimal ProcessPayment(string paymentType, decimal amount)
{
    if (paymentType == "CreditCard")
    {
        // Validar tarjeta
        // Cobrar comisión 2.9%
        // Conectar a Stripe
        // Reintentar 3 veces si falla
        // ... 30 líneas
    }
    else if (paymentType == "Crypto")
    {
        // Validar wallet
        // Esperar 10 minutos a que confirme blockchain
        // Rezar porque no se caiga
        // ... 20 líneas
    }
    else if (paymentType == "TransferenciaBancaria")
    {
        // Generar número de referencia
        // Enviar email
        // Esperar hasta mañana
        // Esperar hasta pasado mañana
        // Rezar porque no lo haya mandado mal
        // ... 15 líneas
    }
}
```

65 líneas de pesadilla en un método.

*Con Strategy:*

```csharp
public interface IPaymentStrategy
{
    Task<bool> ProcessAsync(decimal amount);
    decimal GetFee();
}

public class CreditCardPaymentStrategy : IPaymentStrategy
{
    public async Task<bool> ProcessAsync(decimal amount)
    {
        // Lógica de tarjeta
        return await _stripeService.ChargeAsync(amount);
    }

    public decimal GetFee() => 0.029m;
}

public class CryptoPaymentStrategy : IPaymentStrategy
{
    public async Task<bool> ProcessAsync(decimal amount)
    {
        // Lógica de blockchain
        return await _web3Service.SendAsync(amount);
    }

    public decimal GetFee() => 0m; // No fees, libertad financiera 🚀
}

public class BankTransferStrategy : IPaymentStrategy
{
    public async Task<bool> ProcessAsync(decimal amount)
    {
        // Generar referencia, enviar email, rezar
        _logger.LogWarning("Usuario va a mandar plata mal. Ahora es su culpa.");
        return true; // Técnicamente es procesado (el banco lo decide)
    }

    public decimal GetFee() => 0m;
}

public async Task<decimal> ProcessPayment(IPaymentStrategy strategy, decimal amount)
{
    var fee = strategy.GetFee();
    await strategy.ProcessAsync(amount + fee);
    return fee;
}
```

Seis líneas el método. Seis.

Cada estrategia vive donde debe vivir. ¿Agregas PayPal? Nueva clase. ¿Cambias la comisión de Stripe? Editas `CreditCardPaymentStrategy`. Punto.

---

## En MediFlow — ejemplo real de arquitectura

En una agenda médica tienes distintas **reglas para disponibilidad**:

```csharp
public interface IAvailabilityStrategy
{
    bool IsAvailable(Doctor doctor, DateTime slotTime);
}
```

Un doctor normal solo trabaja de lunes a viernes, de 9 a 17:

```csharp
public class RegularDoctorAvailabilityStrategy : IAvailabilityStrategy
{
    public bool IsAvailable(Doctor doctor, DateTime slotTime)
    {
        var dayOfWeek = slotTime.DayOfWeek;
        var hour = slotTime.Hour;

        // Lunes a viernes, 9 a 17
        if (dayOfWeek == DayOfWeek.Saturday || dayOfWeek == DayOfWeek.Sunday)
            return false; // Fin de semana está en la playa

        if (hour < 9 || hour >= 17)
            return false; // Fuera de horario laboral

        // Verificar que no tiene cita en ese slot
        return !doctor.HasConflict(slotTime);
    }
}
```

Un doctor de guardia trabaja 24/7 porque la medicina no duerme (pero él tampoco, pobrecito):

```csharp
public class OnCallDoctorAvailabilityStrategy : IAvailabilityStrategy
{
    public bool IsAvailable(Doctor doctor, DateTime slotTime)
    {
        // Disponible siempre. Siempre. Siempre.
        // (Excepto cuando se toma un café. Merecido.)
        return !doctor.HasConflict(slotTime);
    }
}
```

Un doctor que trabaja solo mañanas porque le encanta dormir:

```csharp
public class MorningOnlyDoctorAvailabilityStrategy : IAvailabilityStrategy
{
    public bool IsAvailable(Doctor doctor, DateTime slotTime)
    {
        var hour = slotTime.Hour;

        if (hour < 6 || hour >= 12)
            return false; // Está durmiendo, déjalo en paz

        return !doctor.HasConflict(slotTime);
    }
}
```

En el controller:

```csharp
[HttpGet("doctors/{doctorId}/availability")]
public async Task<ActionResult<List<DateTime>>> GetAvailability(
    int doctorId,
    [FromQuery] DateTime from,
    [FromQuery] DateTime to)
{
    var doctor = await _unitOfWork.Repository<Doctor>()
        .GetEntityWithSpec(new DoctorByIdSpec(doctorId));

    if (doctor == null)
        throw new NotFoundException(nameof(Doctor), doctorId);

    // El doctor sabe qué estrategia usar
    var strategy = doctor.GetAvailabilityStrategy();

    var availableSlots = new List<DateTime>();
    var current = from;

    while (current <= to)
    {
        if (strategy.IsAvailable(doctor, current))
            availableSlots.Add(current);

        current = current.AddMinutes(30); // Slots de 30 minutos
    }

    return Ok(availableSlots);
}
```

*Nota:* El controller no sabe si el doctor es Regular, OnCall o MorningOnly. Solo llama `strategy.IsAvailable()`. Es el doctor — vía `GetAvailabilityStrategy()` — quien decide qué estrategia le corresponde.

---

## Lo que la universidad NO te enseñó

*Una confesión incómoda:*

Probablemente en tu carrera te dijeron que escribieras código así y te lo llamaron "programación estructurada".

**Mentira.**

Eso no es programación estructurada. Eso es programación traumatizada.

### Por qué los profes enseñaban esto

No es su culpa. Bueno, un poco sí.

En los 80s-90s, cuando muchos profes aprendieron, no había patrones de diseño documentados. "Gang of Four" salió en 1994. Internet era un lugar donde bajabas archivos .zip con un módem de 56k (según me dijeron).

Entonces lo único que sabían era **if/else**.

40 años después, siguen enseñando if/else.

Es como si un profesor de guitarra en 2024 insistiera en que **solo las cuerdas de acero son reales** porque así tocaban en 1970.

### La cascada mental

Lo peor es que la cascada de ifs **se mete en tu cabeza**.

Durante años escribiste código así. Tu cerebro aprendió que es "normal", "correcto" y "estructurado".

Luego llegas al mundo real.

Ves Strategy Pattern. Ves Decorator. Ves Factory.

Y tu cerebro dice: **"¿Por qué no usas un if simple?"**

Porque... porque ese if simple se convierte en 40 líneas en seis meses.

---

## Desaprender la cascada

Esto es importante, así que lo digo pausado.

*La cascada de ifs no es mala porque sí.*

*Es mala porque viola dos principios fundamentales:*

**1. Open/Closed Principle**

Abierto para extensión. Cerrado para modificación.

Un if/else gigante es lo opuesto. Cada nuevo caso significa editar el método. Cada edición es un riesgo.

**2. Single Responsibility Principle**

Un método debería hacer una cosa.

Un if/else que decide entre 10 algoritmos hace 10 cosas.

---

## El antes y después — educativo

**Antes (Universidad):**

```java
public class CalculadorDescuentoLaUniveridad {
    public double calcular(String tipoCliente, double monto, int diasRegistro) {
        if ("VIP".equals(tipoCliente)) {
            if (monto > 5000) {
                if (diasRegistro > 365) {
                    return monto * 0.25;
                } else {
                    return monto * 0.20;
                }
            } else {
                return monto * 0.15;
            }
        } else if ("Premium".equals(tipoCliente)) {
            // ...
        }
        // 80 líneas más
    }
}
```

**Después (Mundo real):**

```csharp
public interface IDiscountStrategy
{
    decimal Calculate(decimal amount);
}

public class VIPDiscountStrategy : IDiscountStrategy
{
    public decimal Calculate(decimal amount)
    {
        return amount * 0.20m; // Listo. Una responsabilidad.
    }
}

public class DiscountCalculator(IDiscountStrategy strategy)
{
    public decimal Calculate(decimal amount) => strategy.Calculate(amount);
}
```

*Eso es todo.*

El profe hubiera dicho: "Pero... ¿dónde está la cascada? ¿Dónde está la complejidad?"

Exacto. No la hay, porque no la necesitabas.

El if/else cascada era complejidad **accidental**, no **esencial**.

---

## El patrón formal

```
┌─────────────────────────┐
│   IDiscountStrategy     │
├─────────────────────────┤
│ + Calculate(decimal)    │
└─────────────────────────┘
        △ △ △
        │ │ │
    ┌───┘ │ └───┐
    │     │     │
    V     V     V
┌────────┐ ┌────────┐ ┌────────┐
│  VIP   │ │Premium │ │Regular │
└────────┘ └────────┘ └────────┘
```

- **Cliente** — el código que pide la estrategia y la usa (en el ejemplo, quien llama `CalcularDescuento`)
- **Contexto** — el objeto que mantiene la referencia a la estrategia (`DiscountCalculator`)
- **Estrategia** — la interfaz que define el contrato (`IDiscountStrategy`)
- **Estrategias concretas** — cada algoritmo específico (`VIPDiscountStrategy`, `RegularDiscountStrategy`, etc.)

---

## Strategy vs if/else — la comparación honesta

| Aspecto | if/else | Strategy |
|---------|---------|----------|
| Líneas de código | 60 en un método | 10 en el método, 10 por estrategia |
| Cuándo agregar un tipo nuevo | Editas el método (peligroso) | Nueva clase (seguro) |
| Testing | Necesitas strings mágicos | Inyectas el mock directamente |
| Cambiar regla | Editas en un if gigante | Editas la clase específica |
| Readability | "¿Qué tipo es Regular?" | `new RegularDiscountStrategy()` — evidente |
| Open/Closed | Violado (abierto a edición) | Respetado (abierto a extensión) |

---

## El testing — por qué Strategy gana

```csharp
// ❌ Con if/else es testing horrible
[Test]
public void CalcularDescuento_WhenTypeIsVIP_Returns20Percent()
{
    var calculator = new LegacyDiscountCalculator();
    var result = calculator.CalcularDescuento("VIP", 100m);
    Assert.AreEqual(20m, result);
}

// ¿Y si alguien cambia el string "VIP" a "Vip"? El test pasa pero el código explota.
// ¿Y si el if se ejecuta en otro orden? Depende de la magia.
```

```csharp
// ✅ Con Strategy es testing limpio
[Test]
public void CalcularDescuento_WithVIPStrategy_Returns20Percent()
{
    var strategy = new VIPDiscountStrategy();
    var calculator = new DiscountCalculator(strategy);

    var result = calculator.Calculate(100m);

    Assert.AreEqual(20m, result);
}

// Sin strings mágicos. Sin if/else. Solo el algoritmo siendo probado.
```

---

## Registro en DI — cómo inyectar

Tienes dos formas:

**Opción 1 — Inyectar la estrategia directamente:**

```csharp
public class OrderService(IDiscountStrategy discountStrategy)
{
    public decimal ApplyDiscount(decimal amount)
    {
        return amount - discountStrategy.Calculate(amount);
    }
}

// En Program.cs
builder.Services.AddScoped<IDiscountStrategy, VIPDiscountStrategy>();
```

*Problema:* Solo tienes una estrategia registrada. Si necesitas cambiar según el cliente, no funciona.

**Opción 2 — Usar un Factory (la forma pro):**

```csharp
public interface IDiscountStrategyFactory
{
    IDiscountStrategy GetStrategy(Customer customer);
}

public class DiscountStrategyFactory : IDiscountStrategyFactory
{
    public IDiscountStrategy GetStrategy(Customer customer)
    {
        return customer.Type switch
        {
            CustomerType.VIP => new VIPDiscountStrategy(),
            CustomerType.Premium => new PremiumDiscountStrategy(),
            CustomerType.Regular => new RegularDiscountStrategy(),
            CustomerType.Influencer => new InfluencerDiscountStrategy(),
            _ => new RegularDiscountStrategy() // Default safety
        };
    }
}

// El service usa el factory
public class OrderService(IDiscountStrategyFactory factory)
{
    public decimal ApplyDiscount(Customer customer, decimal amount)
    {
        var strategy = factory.GetStrategy(customer);
        return amount - strategy.Calculate(amount);
    }
}

// En Program.cs
builder.Services.AddScoped<IDiscountStrategyFactory, DiscountStrategyFactory>();
```

*Mejor:* El factory aún decide cuál estrategia usar, pero el service ni lo sabe.

---

## Cuándo NO usar Strategy

*En cursiva porque esto es incómodo de admitir:*

*Si tienes UN solo algoritmo, Strategy es over-engineering. Usa un método normal. No todo necesita un patrón.*

Si la estrategia se elige **una sola vez** al desplegar (no cambia según el cliente en cada request), un simple if es más pragmático.

Si la lógica es **tan simple** que cabe en 3 líneas, la complejidad de Strategy probablemente no vale.

---

## Cuándo SÍ usar Strategy

- Múltiples algoritmos para lo mismo
- Los algoritmos cambian **en runtime** (no en deploy)
- Nuevo algoritmo significa nueva clase, no editar el viejo
- Quieres testear cada algoritmo en aislamiento
- El negocio pide "agregar un nuevo tipo de X cada mes"

---

## El resumen honesto

Strategy Pattern es:

**El nombre fancy para "en lugar de un if gigante, tengo una interfaz y cada rama es su propia clase."**

- ¿Más archivos? Sí.
- ¿Más legible? Sí.
- ¿Más testeable? Sí.
- ¿Más fácil de extender? *Mucho* más.

¿Cuesta un poco al inicio? Sí.

¿Vale la pena cuando el código tiene que vivir 2 años? *Absolutamente.*

---

El siguiente capítulo, **Decorator Pattern** es la evolución natural de la idea de las estrategias que se componen: envolver un comportamiento sin cambiar lo que ya funciona.
