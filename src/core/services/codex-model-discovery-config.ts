const MARKER = "# AI Zero Token model discovery ";
const TABLE = /^\s*\[\s*(?:features|"features"|'features')\s*\]\s*(?:#.*)?$/;
const KEY = /^\s*(?:api_key_model_discovery|"api_key_model_discovery"|'api_key_model_discovery')\s*=/;
const DOTTED = /^\s*features\.api_key_model_discovery\s*=/;

function locate(lines: string[]) {
  const rootEnd = lines.findIndex((line) => /^\s*\[/.test(line));
  const root = lines.slice(0, rootEnd < 0 ? lines.length : rootEnd);
  if (root.some((line) => /^\s*features\s*=/.test(line))) throw new Error("请先将 Codex 的内联 features 配置改为 [features] 表，再接入模型状态。");
  const dotted = root.findIndex((line) => DOTTED.test(line));
  const table = lines.findIndex((line) => TABLE.test(line));
  let end = table + 1;
  if (table >= 0) while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
  const index = table < 0 ? -1 : lines.findIndex((line, i) => i > table && i < end && KEY.test(line));
  if (dotted >= 0 && table >= 0) throw new Error("Codex 的模型发现配置重复，请先整理 features 配置。");
  return { index: dotted >= 0 ? dotted : index, dotted: dotted >= 0, table, end };
}

export function isModelDiscoveryEnabled(raw: string): boolean {
  try {
    const lines = raw.split(/\r?\n/);
    const { index } = locate(lines);
    return index >= 0 && /=\s*true\s*(?:#.*)?$/.test(lines[index]!);
  } catch { return false; }
}

/** Save the exact prior feature line, independently of the native model snapshot. */
export function enableManagedModelDiscovery(raw: string): string {
  let lines = raw.split(/\r?\n/);
  const oldMarker = lines.find((line) => line.startsWith(MARKER));
  lines = lines.filter((line) => !line.startsWith(MARKER));
  const location = locate(lines);
  const marker = oldMarker ?? MARKER + Buffer.from(JSON.stringify({
    previous: location.index < 0 ? null : lines[location.index],
    createdTable: location.table < 0 && !location.dotted,
  })).toString("base64url");
  const replacement = `${location.dotted ? "features." : ""}api_key_model_discovery = true`;
  if (location.index >= 0) lines[location.index] = replacement;
  else if (location.table >= 0) lines.splice(location.table + 1, 0, replacement);
  else lines.push("", "[features]", replacement);
  lines.unshift(marker);
  return lines.join("\n");
}

export function restoreManagedModelDiscovery(raw: string): string {
  let lines = raw.split(/\r?\n/);
  const marker = lines.find((line) => line.startsWith(MARKER));
  if (!marker) return raw;
  const saved = JSON.parse(Buffer.from(marker.slice(MARKER.length), "base64url").toString()) as { previous: string | null; createdTable: boolean };
  if (saved.previous !== null && typeof saved.previous !== "string") throw new Error("模型发现配置的恢复记录无效。");
  lines = lines.filter((line) => !line.startsWith(MARKER));
  const { index, table, end } = locate(lines);
  // A later user change takes precedence over the saved value.
  if (index >= 0 && /=\s*true\s*(?:#.*)?$/.test(lines[index]!)) {
    if (saved.previous !== null) lines[index] = saved.previous;
    else {
      lines.splice(index, 1);
      if (saved.createdTable && table >= 0 && lines.slice(table + 1, end - 1).every((line) => !line.trim())) lines.splice(table, 1);
    }
  }
  return lines.join("\n");
}
