export function formatExpiry(expires: number): string {
  return new Date(expires).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function parseAskArgs(args: string[]): { model?: string; prompt: string } {
  const rest = [...args];
  let model: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== "--model") {
      continue;
    }

    model = rest[index + 1];
    rest.splice(index, 2);
    break;
  }
  return {
    model,
    prompt: rest.join(" ").trim(),
  };
}

export function parseServeArgs(args: string[]): { host?: string; port?: number } {
  const rest = [...args];
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--host") {
      host = rest[index + 1];
      rest.splice(index, 2);
      index -= 1;
      continue;
    }

    if (rest[index] === "--port") {
      const value = Number.parseInt(rest[index + 1] ?? "", 10);
      if (Number.isFinite(value)) {
        port = value;
      }
      rest.splice(index, 2);
      index -= 1;
    }
  }

  return { host, port };
}
