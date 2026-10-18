import { describe, expect, test } from "bun:test";
import { fetchMacRelease, RELEASE_API_URL, type UpdateFetch } from "../src/desktop/update-release.ts";
import { releaseHighlights } from "../src/desktop/update-release-history.ts";
import { DesktopUpdater } from "../src/desktop/updater.ts";

const api = "https://api.github.com/repos/fchangjun/AI-Zero-Token/releases";
function release(version: string, body = `### Feature in ${version}\n\nDetails.`) {
  return { tag_name: `v${version}`, draft: false, prerelease: false, body, published_at: "2026-10-13T00:00:00Z", assets: [{
    name: `AI.Zero.Token-${version}-mac-arm64.dmg`, state: "uploaded", size: 10,
    digest: `sha256:${"a".repeat(64)}`,
    browser_download_url: `https://github.com/fchangjun/AI-Zero-Token/releases/download/v${version}/AI.Zero.Token-${version}-mac-arm64.dmg`,
  }] };
}
const signal = () => new AbortController().signal;

describe("incremental release history", () => {
  test("2.0.16 → 2.0.20 includes exactly four stable releases, newest first", async () => {
    const visited: string[] = [];
    const fetcher: UpdateFetch = async (url, init) => {
      visited.push(url);
      expect(init?.credentials).toBe("omit"); expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json(url === RELEASE_API_URL ? release("2.0.20") : [
        release("2.0.18"), release("2.0.16"), release("2.0.17"), release("2.0.19"), release("2.0.21"),
        release("2.0.20", "stale list copy"), { ...release("2.0.19"), tag_name: "2.0.19" },
        { ...release("2.0.18"), draft: true }, { ...release("2.0.19"), prerelease: true },
        release("2.0.20-beta.1"), release("../../evil"), null,
      ]);
    };
    const result = await fetchMacRelease(fetcher, "2.0.16", "arm64", signal());
    expect(result?.history?.map(item => item.version)).toEqual(["2.0.20", "2.0.19", "2.0.18", "2.0.17"]);
    expect(result?.historyComplete).toBe(true);
    expect(result?.history?.[0].highlights).toEqual(["Feature in 2.0.20"]);
    expect(result?.downloadUrl).toContain("/v2.0.20/");
    expect(visited).toEqual([RELEASE_API_URL, `${api}?per_page=30&page=1`]);
  });

  test("paginates despite an old republished version and never follows an arbitrary Link URL", async () => {
    const visited: string[] = [];
    const result = await fetchMacRelease(async url => {
      visited.push(url);
      if (url === RELEASE_API_URL) return Response.json(release("2.1.0"));
      if (url.endsWith("page=1")) return Response.json([release("2.0.9"), release("1.0.0")], { headers: { link: '<https://evil.example/private>; rel="next"' } });
      return Response.json([release("2.0.10"), release("2.0.11")]);
    }, "2.0.8", "arm64", signal());
    expect(result?.history?.map(item => item.version)).toEqual(["2.1.0", "2.0.11", "2.0.10", "2.0.9"]);
    expect(result?.historyComplete).toBe(true);
    expect(visited.at(-1)).toBe(`${api}?per_page=30&page=2`);
  });

  test("retains available notes and the validated download when a history page fails", async () => {
    const result = await fetchMacRelease(async url => {
      if (url === RELEASE_API_URL) return Response.json(release("2.0.20"));
      if (url.endsWith("page=1")) return Response.json([release("2.0.19")], { headers: { link: '<next>; rel="next"' } });
      return new Response("Rate limited", { status: 403 });
    }, "2.0.16", "arm64", signal());
    expect(result?.history?.map(item => item.version)).toEqual(["2.0.20", "2.0.19"]);
    expect(result?.historyComplete).toBe(false);
    expect(result?.sha256).toBe("a".repeat(64));
    expect(result?.downloadUrl).toContain("/v2.0.20/");
  });

  test("bounds paging and marks an unfinished range as partial", async () => {
    let pages = 0;
    const result = await fetchMacRelease(async url => {
      if (url === RELEASE_API_URL) return Response.json(release("2.0.20"));
      pages++;
      return Response.json([release("2.0.19")], { headers: { link: '<next>; rel="next"' } });
    }, "2.0.16", "arm64", signal());
    expect(pages).toBe(5); expect(result?.historyComplete).toBe(false);
    expect(result?.history).toHaveLength(2);
  });

  test("empty or invalid history cannot remove the latest version or fabricate summaries", async () => {
    for (const history of [null, { message: "not a list" }, "oversized"]) {
      const result = await fetchMacRelease(async url => url === RELEASE_API_URL
        ? Response.json(release("2.0.20", ""))
        : history === "oversized" ? new Response("x".repeat(2 * 1024 ** 2 + 1)) : Response.json(history), "2.0.16", "arm64", signal());
      expect(result?.historyComplete).toBe(false);
      expect(result?.history).toHaveLength(1);
      expect(result?.history?.[0].highlights).toEqual([]);
    }
    const result = await fetchMacRelease(async url => Response.json(url === RELEASE_API_URL ? release("2.0.20") : [
      { ...release("2.0.17", ""), published_at: "invalid", html_url: "https://evil.example" },
    ]), "2.0.16", "arm64", signal());
    expect(result?.history?.[1]).toMatchObject({ highlights: [], publishedAt: undefined, releaseUrl: `${"https://github.com/fchangjun/AI-Zero-Token/releases"}/tag/v2.0.17` });
  });

  test("a single patch and an up-to-date install need no history request", async () => {
    for (const current of ["2.0.19", "2.0.20"]) {
      let requests = 0;
      const result = await fetchMacRelease(async () => { requests++; return Response.json(release("2.0.20")); }, current, "arm64", signal());
      expect(requests).toBe(1);
      if (current === "2.0.19") { expect(result?.history).toHaveLength(1); expect(result?.historyComplete).toBe(true); }
      else expect(result).toBeNull();
    }
  });

  test("a failed refresh retains complete history only for the same target version", async () => {
    let version = "2.0.20";
    let failHistory = false;
    const updater = new DesktopUpdater({
      currentVersion: "2.0.16", arch: "arm64", supported: true,
      fetcher: async url => url === RELEASE_API_URL ? Response.json(release(version, failHistory ? "### Updated feature title" : undefined))
        : failHistory ? new Response(null, { status: 503 }) : Response.json([release("2.0.17"), release("2.0.18"), release("2.0.19")]),
      installer: { async preflight() {}, async createJob() { throw new Error("unexpected download"); }, async prepare() {}, async cleanup() {}, async handOff() {} },
      onState() {}, onAvailable() {}, quit() {},
    });
    await updater.check(); expect(updater.getState().releaseHistory).toHaveLength(4);
    failHistory = true;
    await updater.check(); expect(updater.getState()).toMatchObject({ phase: "available", releaseHistoryComplete: true });
    expect(updater.getState().releaseHistory).toHaveLength(4);
    expect(updater.getState().releaseHistory?.[0].highlights).toEqual(["Updated feature title"]);
    version = "2.0.21";
    await updater.check(); expect(updater.getState()).toMatchObject({ phase: "available", releaseHistoryComplete: false });
    expect(updater.getState().releaseHistory?.map(item => item.version)).toEqual(["2.0.21"]);
    await updater.stop();
  });
});

describe("feature summaries", () => {
  test("uses feature headings and omits installation, nested verification and code blocks", () => {
    const body = '## 本次更新\n一次更新简介。\n### 新增 Codex 重置日历与通知\n功能介绍。\n### 支持设置模型上下文窗口\n功能介绍。\n## 升级方式与注意事项\n- npm install old-version\n### macOS\n旧版本安装命令\n## 验证范围\n### 测试\n258 项测试。\n```sh\n## Fake feature\n```\n## 改进\n- **修复 Codex 第三方服务解除接入失败**：解除接入后恢复原有设置。';
    expect(releaseHighlights(body)).toEqual(["新增 Codex 重置日历与通知", "支持设置模型上下文窗口", "修复 Codex 第三方服务解除接入失败"]);
  });
  test("uses bullet titles in older releases and a plain introduction when no feature list exists", () => {
    expect(releaseHighlights('## 本次升级\n- **支持桌面更新后台下载**：后台下载。技术说明。\n- **新增 Reviewer**：添加批注。\n- 完善使用指南。详细验证报告。\n## 下载与安装\n- old.dmg\n## 使用提醒\n验证：142 项测试。')).toEqual(["支持桌面更新后台下载", "新增 Reviewer", "完善使用指南。"]);
    expect(releaseHighlights('Fixed switching back to native Codex.\n\n## Downloads\n- old.exe')).toEqual(["Fixed switching back to native Codex."]);
    expect(releaseHighlights('## 验证范围\n通过所有测试。')).toEqual([]);
  });
});
