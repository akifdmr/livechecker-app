// ============================================================
// NDJSON STREAM READER
// ============================================================
export async function readNdjson(
  response: Response,
  onEvent: (data: any) => void
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch (e) {
        console.warn('Parse error:', e);
      }
    }
  }

  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer));
    } catch (e) {}
  }
}
