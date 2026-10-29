using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;

public sealed class MessageHub(IHttpClientFactory httpClientFactory, IConfiguration configuration) : Hub
{
    private const string DevelopmentSecret = "local-dev-signalr-internal-secret-change-me";

    public override async Task OnConnectedAsync()
    {
        var id = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var role = Context.User?.FindFirst(ClaimTypes.Role)?.Value;
        if (id is null || role is null) { Context.Abort(); return; }
        await Groups.AddToGroupAsync(Context.ConnectionId, role == "admin" ? "admins" : $"user:{id}");
        await base.OnConnectedAsync();
    }

    public async Task SendMessage(int? recipientUserId, string text)
    {
        var user = Context.User;
        var idValue = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var role = user?.FindFirst(ClaimTypes.Role)?.Value;
        var token = user?.FindFirst("access_token")?.Value;
        var body = (text ?? "").Trim();
        if (!int.TryParse(idValue, out var senderId) || string.IsNullOrWhiteSpace(token) || role is not ("admin" or "user" or "checker" or "viewer" or "operator" or "finance"))
            throw new HubException("Oturum geçersiz. Yeniden giriş yapın.");
        if (body.Length is < 1 or > 2000) throw new HubException("Mesaj 1 ile 2000 karakter arasında olmalı.");

        // Revalidate every send so a blocked account or expired session cannot keep chatting.
        var client = httpClientFactory.CreateClient("node");
        using var authRequest = new HttpRequestMessage(HttpMethod.Get, "/auth/me");
        authRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var authResponse = await client.SendAsync(authRequest, Context.ConnectionAborted);
        if (!authResponse.IsSuccessStatusCode) throw new HubException("Oturum geçersiz veya hesap engellendi.");

        var isAdmin = role == "admin";
        var threadUserId = isAdmin ? recipientUserId : senderId;
        if (threadUserId is null or < 1) throw new HubException("Mesaj alıcısı seçilmeli.");
        var secret = configuration["SIGNALR_INTERNAL_SECRET"] ??
            (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production" ? "" : DevelopmentSecret);
        if (string.IsNullOrWhiteSpace(secret)) throw new HubException("Mesaj servisi yapılandırılmamış.");

        var payload = JsonSerializer.Serialize(new { senderId, senderRole = isAdmin ? "admin" : "user", threadUserId, body });
        using var messageRequest = new HttpRequestMessage(HttpMethod.Post, "/messages/internal") { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        messageRequest.Headers.Add("X-SignalR-Internal-Secret", secret);
        using var messageResponse = await client.SendAsync(messageRequest, Context.ConnectionAborted);
        if (!messageResponse.IsSuccessStatusCode) throw new HubException("Mesaj gönderilemedi.");
        using var result = JsonDocument.Parse(await messageResponse.Content.ReadAsStringAsync(Context.ConnectionAborted));
        var message = result.RootElement.GetProperty("message");

        await Clients.Group(isAdmin ? $"user:{threadUserId}" : "admins").SendAsync("ReceiveMessage", message, Context.ConnectionAborted);
        await Clients.Caller.SendAsync("ReceiveMessage", message, Context.ConnectionAborted);
    }
}
