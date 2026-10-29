import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import { api } from '../api';
import { useAuthStore } from '../stores/authStore';

type Conversation = { user_id: number; username: string; last_message?: string; last_message_at?: string; unread_count?: number };
type Message = { id: number; user_id: number; sender_id: number; sender_role: string; sender_username?: string; body: string; created_at: string };

export default function MessagesPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(isAdmin ? null : Number(user?.id));
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const refreshConversations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/messages/conversations');
      const items: Conversation[] = data.conversations || [];
      setConversations(items);
      setSelectedId((current) => current ?? items[0]?.user_id ?? null);
    } catch (e: any) { setError(e.response?.data?.error || 'Konuşmalar alınamadı'); }
  }, [isAdmin]);

  const refreshMessages = useCallback(async (userId: number) => {
    try {
      const { data } = await api.get('/messages', { params: { userId } });
      setMessages(data.messages || []);
    } catch (e: any) { setError(e.response?.data?.error || 'Mesajlar alınamadı'); }
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);
  useEffect(() => { if (selectedId) refreshMessages(selectedId); else setMessages([]); }, [selectedId, refreshMessages]);

  useEffect(() => {
    let disposed = false;
    const hubUrl = import.meta.env.VITE_SIGNALR_URL || 'http://localhost:5001/hubs/messages';
    const hub = new HubConnectionBuilder().withUrl(hubUrl, {
      accessTokenFactory: () => useAuthStore.getState().token || '',
    }).withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
    hub.on('ReceiveMessage', (incoming: Message) => {
      if (disposed) return;
      const threadId = Number(incoming.user_id);
      if (threadId === selectedIdRef.current) setMessages((items) => items.some((item) => item.id === incoming.id) ? items : [...items, incoming]);
      if (isAdmin) refreshConversations();
    });
    hub.onreconnecting(() => setConnected(false));
    hub.onreconnected(() => setConnected(true));
    hub.start().then(() => { if (!disposed) { setConnection(hub); setConnected(true); } })
      .catch(() => { if (!disposed) { setError('Mesaj bağlantısı kurulamadı. SignalR servisini kontrol edin.'); setConnected(false); } });
    return () => { disposed = true; setConnection(null); setConnected(false); void hub.stop(); };
  }, [isAdmin, refreshConversations]);

  const selected = useMemo(() => conversations.find((item) => item.user_id === selectedId), [conversations, selectedId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!connection || !selectedId || !draft.trim()) return;
    setError('');
    try {
      await connection.invoke('SendMessage', isAdmin ? selectedId : null, draft.trim());
      setDraft('');
    } catch (e: any) { setError(e.message || 'Mesaj gönderilemedi'); }
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Admin ile mesajlaşma</h1><p className="mt-1 text-sm text-gray-400">Mesajlar güvenli oturum üzerinden gerçek zamanlı iletilir.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs ${connected ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>{connected ? 'SignalR bağlı' : 'Bağlanıyor…'}</span>
    </header>
    {error && <div role="alert" className="rounded border border-red-400/30 bg-red-500/10 p-3 text-sm">{error}</div>}
    <div className="grid min-h-[65vh] overflow-hidden rounded-xl border border-white/10 md:grid-cols-[280px_1fr]">
      {isAdmin && <aside className="border-b border-white/10 bg-white/[0.02] p-3 md:border-b-0 md:border-r">
        <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-gray-500">Kullanıcı konuşmaları</h2>
        <div className="space-y-1">{conversations.map((item) => <button key={item.user_id} onClick={() => setSelectedId(item.user_id)} className={`w-full rounded-lg p-3 text-left ${selectedId === item.user_id ? 'bg-accent/15' : 'hover:bg-white/5'}`}>
          <div className="flex justify-between gap-2 text-sm"><strong>{item.username}</strong>{Number(item.unread_count) > 0 && <span className="rounded-full bg-accent px-2 text-xs text-black">{item.unread_count}</span>}</div>
          <div className="mt-1 truncate text-xs text-gray-500">{item.last_message || 'Konuşma'}</div>
        </button>)}</div>
        {!conversations.length && <p className="p-2 text-xs text-gray-500">Henüz konuşma yok.</p>}
      </aside>}
      <section className="flex min-h-[65vh] min-w-0 flex-col">
        <div className="border-b border-white/10 p-4 text-sm font-semibold">{isAdmin ? selected?.username || 'Kullanıcı seçin' : 'Destek ekibi'}</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => {
          const mine = Number(message.sender_id) === Number(user?.id);
          return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? 'bg-accent/20' : 'bg-white/[0.06]'}`}>
            <div className="mb-1 text-[10px] text-gray-500">{message.sender_username || (message.sender_role === 'admin' ? 'Admin' : 'Kullanıcı')} · {new Date(message.created_at).toLocaleString('tr-TR')}</div>
            <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
          </div></div>;
        })}{!messages.length && <p className="py-8 text-center text-sm text-gray-500">Henüz mesaj yok. Mesajınızı yazarak konuşmayı başlatın.</p>}</div>
        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!connected || (isAdmin && !selectedId)} placeholder="Mesajınızı yazın…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm disabled:opacity-50" />
          <button disabled={!connected || !selectedId || !draft.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-black disabled:opacity-50">Gönder</button>
        </form>
      </section>
    </div>
  </div>;
}
