using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);
var configuredOrigins = (Environment.GetEnvironmentVariable("SIGNALR_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(configuredOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddSignalR();
builder.Services.AddHttpClient("node", client =>
    client.BaseAddress = new Uri(Environment.GetEnvironmentVariable("NODE_API_URL") ?? "http://127.0.0.1:3000"));
builder.Services.AddSingleton<IUserIdProvider, ClaimUserIdProvider>();

var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/hubs/messages"))
    {
        var bearer = context.Request.Headers.Authorization.ToString();
        var token = bearer.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? bearer[7..]
            : context.Request.Query["access_token"].ToString();
        if (!string.IsNullOrWhiteSpace(token))
        {
            try
            {
                var client = context.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("node");
                using var request = new HttpRequestMessage(HttpMethod.Get, "/auth/me");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using var response = await client.SendAsync(request, context.RequestAborted);
                if (response.IsSuccessStatusCode)
                {
                    using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(context.RequestAborted));
                    var user = json.RootElement.GetProperty("user");
                    var id = user.GetProperty("id").ToString();
                    var role = user.GetProperty("role").GetString() ?? "";
                    var username = user.TryGetProperty("username", out var name) ? name.GetString() ?? "" : "";
                    var identity = new ClaimsIdentity(new[] {
                        new Claim(ClaimTypes.NameIdentifier, id),
                        new Claim(ClaimTypes.Role, role),
                        new Claim(ClaimTypes.Name, username),
                        new Claim("access_token", token),
                    }, "NodeSession");
                    context.User = new ClaimsPrincipal(identity);
                }
            }
            catch { /* Invalid or unavailable API sessions fail closed below. */ }
        }
    }
    await next();
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "signalr-message-hub" }));
app.MapHub<MessageHub>("/hubs/messages");
app.Run();

public sealed class ClaimUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
