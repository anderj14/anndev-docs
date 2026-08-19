---
sidebar_position: 2
title: Decorator Pattern
description: Envuelve objetos para agregar comportamiento sin modificar el original — logging, caché, validación.
---

# Decorator Pattern

Imagina que tienes un servicio que funciona perfecto.

```csharp
public class OrderService
{
    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        var order = new Order { /* ... */ };
        await _unitOfWork.Repository<Order>().Add(order);
        await _unitOfWork.Complete();
        return order;
    }
}
```

Limpio. Responsable. Una cosa bien hecha.

Luego llega tu jefe:

"Necesitamos **logging** de cada orden que se crea."

Abres el archivo. Agregas `_logger.LogInformation()`.

Luego: "Necesitamos **caché** para no recalcular."

Editas el método. Agregas caché.

Luego: "Necesitamos **validaciones** más estrictas."

Editas de nuevo. El método crece. Y crece. Y crece.

Una semana después tienes esto:

```csharp
public async Task<Order> CreateOrder(CreateOrderDto dto)
{
    // Logging
    _logger.LogInformation("Creating order...");

    // Validación
    if (dto.Amount <= 0)
        throw new ValidationException("Amount must be positive");
    
    if (!await _customerService.IsValid(dto.CustomerId))
        throw new ValidationException("Invalid customer");

    // Caché
    var cacheKey = $"order_{dto.CustomerId}";
    if (_cache.TryGetValue(cacheKey, out var cached))
        return cached;

    // El código original
    var order = new Order { /* ... */ };
    await _unitOfWork.Repository<Order>().Add(order);
    await _unitOfWork.Complete();

    // Más logging
    _logger.LogInformation($"Order created: {order.Id}");

    // Caché
    _cache.Set(cacheKey, order);

    return order;
}
```

**40 líneas.** Solo 10 son el negocio real.

*Eso no es un servicio. Eso es un sándwich de responsabilidades.*

---

## La idea central — decorar sin modificar

En lugar de editar el servicio original, **lo envuelves**:

```csharp
public interface IOrderService
{
    Task<Order> CreateOrder(CreateOrderDto dto);
}

// El original — intacto
public class OrderService : IOrderService
{
    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        var order = new Order { /* ... */ };
        await _unitOfWork.Repository<Order>().Add(order);
        await _unitOfWork.Complete();
        return order;
    }
}

// Decorador 1 — agrega logging
public class LoggingOrderServiceDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ILogger<LoggingOrderServiceDecorator> _logger;

    public LoggingOrderServiceDecorator(IOrderService inner, ILogger<LoggingOrderServiceDecorator> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        _logger.LogInformation("Creating order...");
        var result = await _inner.CreateOrder(dto);
        _logger.LogInformation($"Order created: {result.Id}");
        return result;
    }
}

// Decorador 2 — agrega validación
public class ValidationOrderServiceDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ICustomerService _customerService;

    public ValidationOrderServiceDecorator(IOrderService inner, ICustomerService customerService)
    {
        _inner = inner;
        _customerService = customerService;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        if (dto.Amount <= 0)
            throw new ValidationException("Amount must be positive");
        
        if (!await _customerService.IsValid(dto.CustomerId))
            throw new ValidationException("Invalid customer");

        return await _inner.CreateOrder(dto);
    }
}

// Decorador 3 — agrega caché
public class CachingOrderServiceDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ICacheService _cache;

    public CachingOrderServiceDecorator(IOrderService inner, ICacheService cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        var cacheKey = $"order_{dto.CustomerId}";
        
        if (_cache.TryGetValue(cacheKey, out var cached))
            return cached;

        var result = await _inner.CreateOrder(dto);
        _cache.Set(cacheKey, result);
        return result;
    }
}
```

Y en el DI:

```csharp
// Apilamos los decoradores como un sándwich
var service = new OrderService(unitOfWork);
service = new ValidationOrderServiceDecorator(service, customerService);
service = new LoggingOrderServiceDecorator(service, logger);
service = new CachingOrderServiceDecorator(service, cache);

// O en Program.cs:
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<IOrderService>(provider =>
{
    var service = provider.GetRequiredService<OrderService>();
    var service1 = new ValidationOrderServiceDecorator(
        service,
        provider.GetRequiredService<ICustomerService>());
    var service2 = new LoggingOrderServiceDecorator(
        service1,
        provider.GetRequiredService<ILogger<LoggingOrderServiceDecorator>>());
    var service3 = new CachingOrderServiceDecorator(
        service2,
        provider.GetRequiredService<ICacheService>());
    return service3;
});
```

Ahora el flujo es:

```
CachingOrderServiceDecorator
    ↓ (si no está en caché)
LoggingOrderServiceDecorator
    ↓
ValidationOrderServiceDecorator
    ↓
OrderService (el original, intacto)
```

*Cada decorador hace UNA cosa. El original hace su trabajo. Todos por separado.*

---

## Línea por línea — cómo funciona

```csharp
public class LoggingOrderServiceDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ILogger<LoggingOrderServiceDecorator> _logger;

    public LoggingOrderServiceDecorator(IOrderService inner, ILogger<LoggingOrderServiceDecorator> logger)
    {
        _inner = inner;
        _logger = logger;
    }
```

`_inner` es el servicio que estás decorando. Puede ser el original O otro decorador. El decorador no sabe ni le importa.

```csharp
    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        _logger.LogInformation("Creating order...");
        var result = await _inner.CreateOrder(dto);
        _logger.LogInformation($"Order created: {result.Id}");
        return result;
    }
}
```

Antes de llamar al `_inner`, haces algo (logging). Después de que termina, haces algo más (más logging). El original en el medio, intacto.

**Eso es Decorator.**

---

## Ejemplo real — Pizzería

Para entender mejor, imagina una pizzería:

```csharp
public interface IPizza
{
    decimal GetCost();
    string GetDescription();
}

// La pizza original
public class SimplePizza : IPizza
{
    public decimal GetCost() => 5.00m;
    public string GetDescription() => "Simple pizza";
}
```

Un cliente quiere agregar queso:

```csharp
// ❌ Sin Decorator — editas la clase original
public class SimplePizza : IPizza
{
    public decimal GetCost() => 5.00m + 1.50m; // Queso sumado aquí
    public string GetDescription() => "Simple pizza with cheese";
}

// Problema: ¿Y si quiere queso + peperoni + champiñones?
// ¿Creas SimplePizzaWithCheeseAndPeperoniAndMushrooms?
```

```csharp
// ✅ Con Decorator
public class CheeseDecorator : IPizza
{
    private readonly IPizza _pizza;

    public CheeseDecorator(IPizza pizza)
    {
        _pizza = pizza;
    }

    public decimal GetCost() => _pizza.GetCost() + 1.50m;
    public string GetDescription() => _pizza.GetDescription() + " + cheese";
}

public class PeperoniDecorator : IPizza
{
    private readonly IPizza _pizza;

    public PeperoniDecorator(IPizza pizza)
    {
        _pizza = pizza;
    }

    public decimal GetCost() => _pizza.GetCost() + 2.00m;
    public string GetDescription() => _pizza.GetDescription() + " + peperoni";
}

public class MushroomsDecorator : IPizza
{
    private readonly IPizza _pizza;

    public MushroomsDecorator(IPizza pizza)
    {
        _pizza = pizza;
    }

    public decimal GetCost() => _pizza.GetCost() + 1.20m;
    public string GetDescription() => _pizza.GetDescription() + " + mushrooms";
}

// Uso:
var pizza = new SimplePizza();
pizza = new CheeseDecorator(pizza);
pizza = new PeperoniDecorator(pizza);
pizza = new MushroomsDecorator(pizza);

Console.WriteLine(pizza.GetDescription()); // Simple pizza + cheese + peperoni + mushrooms
Console.WriteLine(pizza.GetCost()); // 5.00 + 1.50 + 2.00 + 1.20 = 9.70
```

*Combinaciones infinitas. Clases finitas.*

---

## En MediFlow — notificaciones en cascada

Una cita se crea. Necesita notificaciones a doctor y paciente.

Pero luego:
- El doctor quiere SMS además de email
- El paciente quiere un calendario integrado
- La clínica quiere log de cada notificación

Sin Decorator:

```csharp
public async Task ScheduleAppointment(Appointment appointment)
{
    await _unitOfWork.Repository<Appointment>().Add(appointment);
    await _unitOfWork.Complete();

    // Email al doctor
    await _emailService.SendAsync(appointment.Doctor.Email, "Cita agendada");

    // SMS al paciente (solo si tiene teléfono)
    if (!string.IsNullOrEmpty(appointment.Patient.PhoneNumber))
        await _smsService.SendAsync(appointment.Patient.PhoneNumber, "Cita agendada");

    // Calendario del paciente (si lo configuró)
    if (appointment.Patient.CalendarIntegration)
        await _calendarService.AddEventAsync(appointment.Patient.CalendarToken, appointment);

    // Log de notificaciones
    _logger.LogInformation($"Notifications sent for appointment {appointment.Id}");

    return appointment;
}
```

**Con Decorator:**

```csharp
public interface IAppointmentService
{
    Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto);
}

// El original
public class AppointmentService : IAppointmentService
{
    public async Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto)
    {
        var appointment = new Appointment { /* ... */ };
        await _unitOfWork.Repository<Appointment>().Add(appointment);
        await _unitOfWork.Complete();
        return appointment;
    }
}

// Decorador de notificación por email
public class EmailNotificationDecorator : IAppointmentService
{
    private readonly IAppointmentService _inner;
    private readonly IEmailService _emailService;

    public EmailNotificationDecorator(IAppointmentService inner, IEmailService emailService)
    {
        _inner = inner;
        _emailService = emailService;
    }

    public async Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto)
    {
        var appointment = await _inner.ScheduleAppointment(dto);
        
        await _emailService.SendAsync(
            appointment.Doctor.Email,
            $"Nueva cita con {appointment.Patient.FullName}"
        );

        return appointment;
    }
}

// Decorador de SMS
public class SMSNotificationDecorator : IAppointmentService
{
    private readonly IAppointmentService _inner;
    private readonly ISmsService _smsService;

    public SMSNotificationDecorator(IAppointmentService inner, ISmsService smsService)
    {
        _inner = inner;
        _smsService = smsService;
    }

    public async Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto)
    {
        var appointment = await _inner.ScheduleAppointment(dto);
        
        if (!string.IsNullOrEmpty(appointment.Patient.PhoneNumber))
        {
            await _smsService.SendAsync(
                appointment.Patient.PhoneNumber,
                $"Cita agendada para {appointment.StartDateTime:dd/MM/yyyy HH:mm}"
            );
        }

        return appointment;
    }
}

// Decorador de calendario
public class CalendarIntegrationDecorator : IAppointmentService
{
    private readonly IAppointmentService _inner;
    private readonly ICalendarService _calendarService;

    public CalendarIntegrationDecorator(IAppointmentService inner, ICalendarService calendarService)
    {
        _inner = inner;
        _calendarService = calendarService;
    }

    public async Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto)
    {
        var appointment = await _inner.ScheduleAppointment(dto);
        
        if (appointment.Patient.CalendarIntegration)
        {
            await _calendarService.AddEventAsync(
                appointment.Patient.CalendarToken,
                appointment
            );
        }

        return appointment;
    }
}

// Decorador de logging
public class LoggingDecorator : IAppointmentService
{
    private readonly IAppointmentService _inner;
    private readonly ILogger<LoggingDecorator> _logger;

    public LoggingDecorator(IAppointmentService inner, ILogger<LoggingDecorator> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<Appointment> ScheduleAppointment(CreateAppointmentDto dto)
    {
        _logger.LogInformation("Scheduling appointment...");
        var appointment = await _inner.ScheduleAppointment(dto);
        _logger.LogInformation($"Appointment scheduled: {appointment.Id}");
        return appointment;
    }
}

// En Program.cs
builder.Services.AddScoped<AppointmentService>();
builder.Services.AddScoped<IAppointmentService>(provider =>
{
    var service = provider.GetRequiredService<AppointmentService>();
    var decorated = new LoggingDecorator(
        new CalendarIntegrationDecorator(
            new SMSNotificationDecorator(
                new EmailNotificationDecorator(service, provider.GetRequiredService<IEmailService>()),
                provider.GetRequiredService<ISmsService>()
            ),
            provider.GetRequiredService<ICalendarService>()
        ),
        provider.GetRequiredService<ILogger<LoggingDecorator>>()
    );
    return decorated;
});
```

Ahora el flujo de una cita es una sola bajada y una sola subida:

```
Request ↓
LoggingDecorator
    ↓ Log "Scheduling..."
CalendarIntegrationDecorator
    ↓ si integration está on, agrega evento
SMSNotificationDecorator
    ↓ si hay phone, envía SMS
EmailNotificationDecorator
    ↓ envía email
AppointmentService (el original)
    ↓ crea la cita
La cita sube ↑ por el mismo camino
LoggingDecorator
    ↓ Log "Appointment scheduled"
Response ↑
```

Cada decorador es **independiente**. Cada uno hace **una cosa**. Si necesitas quitar SMS, solo quitas ese decorador.

---

## Decorator vs Herencia — por qué gana

**Con herencia:**

```csharp
// ❌ Combinatoria explosiva
public class AppointmentService { }
public class AppointmentServiceWithEmail : AppointmentService { }
public class AppointmentServiceWithEmailAndSMS : AppointmentServiceWithEmail { }
public class AppointmentServiceWithEmailAndSMSAndCalendar : AppointmentServiceWithEmailAndSMS { }

// ¿Qué pasa si necesitas Email + Calendar pero SIN SMS?
// Necesitas una clase nueva. Y otra. Y otra.
// Con 5 features, tienes 2^5 = 32 clases.
```

**Con Decorator:**

```csharp
// ✅ Composición limpia
var service = new AppointmentService();
service = new EmailNotificationDecorator(service);
service = new CalendarIntegrationDecorator(service);
// Sin SMS, solo sin agregar ese decorador

// Cualquier combinación con máximo 5 clases
```

| Herencia | Decorator |
|----------|-----------|
| N features = 2^N clases | N features = N clases |
| Cambiar una feature = editar clase base | Cambiar una feature = editar decorador |
| Herencia múltiple (caro) | Composición (barato) |

---

## Casos chistosos de Decorator

**1. Rating Limiter:**

```csharp
public class RateLimitDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ILogger<RateLimitDecorator> _logger;
    private readonly Dictionary<int, int> _requestCounts = new();

    public RateLimitDecorator(IOrderService inner, ILogger<RateLimitDecorator> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        var key = dto.CustomerId;
        
        if (!_requestCounts.TryGetValue(key, out var count))
            count = 0;

        if (count > 10) // Máximo 10 órdenes por minuto
        {
            _logger.LogWarning($"Rate limit exceeded for customer {key}. Dude, chill.");
            throw new RateLimitException("Slow down, buddy");
        }

        _requestCounts[key] = count + 1;
        return await _inner.CreateOrder(dto);
    }
}
```

**2. Retry Decorator:**

```csharp
public class RetryDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly ILogger<RetryDecorator> _logger;
    private const int MaxRetries = 3;

    public RetryDecorator(IOrderService inner, ILogger<RetryDecorator> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        for (int i = 0; i < MaxRetries; i++)
        {
            try
            {
                return await _inner.CreateOrder(dto);
            }
            catch (TransientException ex) when (i < MaxRetries - 1)
            {
                _logger.LogWarning($"Attempt {i + 1} failed, retrying...");
                await Task.Delay(1000 * (int)Math.Pow(2, i)); // Backoff exponencial: 1s, 2s, 4s
            }
        }

        // Si llegamos aquí, falló todas las veces
        throw new ServiceUnavailableException("Service not available after 3 attempts");
    }
}
```

**3. Audit Decorator:**

```csharp
public class AuditDecorator : IOrderService
{
    private readonly IOrderService _inner;
    private readonly IAuditRepository _auditRepo;
    private readonly ICurrentUser _currentUser;

    public AuditDecorator(IOrderService inner, IAuditRepository auditRepo, ICurrentUser currentUser)
    {
        _inner = inner;
        _auditRepo = auditRepo;
        _currentUser = currentUser;
    }

    public async Task<Order> CreateOrder(CreateOrderDto dto)
    {
        var audit = new AuditLog
        {
            Action = "CreateOrder",
            UserId = _currentUser.Id,
            Timestamp = DateTime.UtcNow,
            Details = JsonSerializer.Serialize(dto)
        };

        await _auditRepo.AddAsync(audit);
        var result = await _inner.CreateOrder(dto);
        audit.Success = true;
        await _auditRepo.UpdateAsync(audit);

        return result;
    }
}
```

---

## El patrón formal

```
┌──────────────────┐
│  IComponent      │
├──────────────────┤
│ + Operation()    │
└──────────────────┘
      △      △
      │      │
  ┌───┘      └────┐
  │               │
  V               V
┌──────────┐  ┌───────────────────┐
│ Original │  │ Decorator         │
│Component │  ├───────────────────┤
└──────────┘  │ - component       │
              │ + Operation()     │
              │   [do something]  │
              │   component.Op()  │
              │   [do something]  │
              └───────────────────┘
```

El decorador implementa la **misma interfaz** que el componente original. Por eso puedes envolver indefinidamente.

---

## Testing — por qué Decorator gana

```csharp
// ✅ Test solo el Decorator, no el AppointmentService
[Test]
public async Task LoggingDecorator_LogsBeforeAndAfter()
{
    // Mock del servicio interno
    var mockService = new Mock<IAppointmentService>();
    mockService.Setup(s => s.ScheduleAppointment(It.IsAny<CreateAppointmentDto>()))
        .ReturnsAsync(new Appointment { Id = 1 });

    var mockLogger = new Mock<ILogger<LoggingDecorator>>();

    var decorator = new LoggingDecorator(mockService.Object, mockLogger.Object);
    
    var dto = new CreateAppointmentDto { /* ... */ };
    var result = await decorator.ScheduleAppointment(dto);

    // Verifica que logging ocurrió
    mockLogger.Verify(
        x => x.Log(
            LogLevel.Information,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((v, t) => v.ToString().Contains("Scheduling appointment")),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception, string>>()
        ),
        Times.Once
    );

    // Verifica que el servicio fue llamado
    mockService.Verify(s => s.ScheduleAppointment(dto), Times.Once);
}
```

Sin Decorator, ese test es un infierno porque mezclas logging + servicio + base de datos.

---

## Cuándo usar Decorator

- ✅ Agregar comportamiento transversal (logging, caché, validación)
- ✅ Envolver servicios externos (como las notificaciones)
- ✅ Composición de comportamientos (pizza + queso + peperoni)
- ✅ Separar responsabilidades (cada decorador es una)
- ✅ Cuando la combinación es dinámica (en runtime decides qué decoradores)

## Cuándo NO usar Decorator

- ❌ Si solo tienes una forma de comportarse (overkill)
- ❌ Si el comportamiento cambia frecuentemente (usa Strategy en su lugar)
- ❌ Si necesitas acceso a variables privadas del original (violación de encapsulación)

---

## El resumen

Decorator es:

**"En lugar de editar el original, lo envuelves. Cada envoltura agrega una responsabilidad. Puedes combinar tantas como quieras."**

- Composición sobre herencia.
- Una cosa por decorador.
- Testeable en aislamiento.
- Open/Closed Principle respetado.

La próxima vez que tengas ganas de editar un método porque "necesita logging" — detente.

Crea un decorador.

Tu yo del futuro te lo va a agradecer.

---

El siguiente capítulo — CQRS + MediatR — es la evolución natural de la idea de separar responsabilidades: en vez de envolver, separas las lecturas de las escrituras en dos caminos distintos.