export function chunkText(text: string, limit: number): string[] {
  const normalizedLimit = Math.max(limit, 256);
  if (text.length <= normalizedLimit) return [text];

  const chunks: string[] = [];
  let current = '';
  let inFence = false;

  for (const line of text.split('\n')) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > normalizedLimit && current && !inFence) {
      chunks.push(current);
      current = line;
    } else if (candidate.length > normalizedLimit && !current) {
      for (let i = 0; i < line.length; i += normalizedLimit) {
        chunks.push(line.slice(i, i + normalizedLimit));
      }
      current = '';
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}
