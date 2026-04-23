type AskArgs = {
  model?: string;
  prompt: string;
  payloadFile?: string;
  dumpRawFile?: string;
  writeArtifactsDir?: string;
  printRaw: boolean;
  allowUnknownModel: boolean;
};

export function formatExpiry(expires: number): string {
  return new Date(expires).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function parseAskArgs(args: string[]): AskArgs {
  const rest = [...args];
  let model: string | undefined;
  let payloadFile: string | undefined;
  let dumpRawFile: string | undefined;
  let writeArtifactsDir: string | undefined;
  let printRaw = false;
  let allowUnknownModel = false;

  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--model") {
      model = rest[index + 1];
      rest.splice(index, 2);
      index -= 1;
      continue;
    }

    if (rest[index] === "--payload-file") {
      payloadFile = rest[index + 1];
      rest.splice(index, 2);
      index -= 1;
      continue;
    }

    if (rest[index] === "--dump-raw") {
      dumpRawFile = rest[index + 1];
      rest.splice(index, 2);
      index -= 1;
      continue;
    }

    if (rest[index] === "--write-artifacts-dir") {
      writeArtifactsDir = rest[index + 1];
      rest.splice(index, 2);
      index -= 1;
      continue;
    }

    if (rest[index] === "--print-raw") {
      printRaw = true;
      rest.splice(index, 1);
      index -= 1;
      continue;
    }

    if (rest[index] === "--allow-unknown-model") {
      allowUnknownModel = true;
      rest.splice(index, 1);
      index -= 1;
    }
  }

  return {
    model,
    payloadFile,
    dumpRawFile,
    writeArtifactsDir,
    printRaw,
    allowUnknownModel,
    prompt: rest.join(" ").trim(),
  };
}

export function parseServeArgs(args: string[]): {
  host?: string;
  port?: number;
  openBrowser?: boolean;
} {
  const rest = [...args];
  let host: string | undefined;
  let port: number | undefined;
  let openBrowser: boolean | undefined;

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
      continue;
    }

    if (rest[index] === "--open") {
      openBrowser = true;
      rest.splice(index, 1);
      index -= 1;
      continue;
    }

    if (rest[index] === "--no-open") {
      openBrowser = false;
      rest.splice(index, 1);
      index -= 1;
    }
  }

  return { host, port, openBrowser };
}
