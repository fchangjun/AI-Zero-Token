export function externalHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function openExternalHttpUrl(value: unknown, open: (url: string) => Promise<unknown>): Promise<boolean> {
  const url = externalHttpUrl(value);
  if (!url) return false;
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}
