import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReleaseNotes } from "../admin-ui/src/shared/components/ReleaseNotes";

function render(notes: string) { return renderToStaticMarkup(createElement(ReleaseNotes, { notes })); }

describe("desktop release notes", () => {
  test("formats release headings, lists, emphasis, commands and links", () => {
    const html = render("## What's new\r\n\r\n- **Update** from the app\r\n- Keep `settings`\r\n\r\n### Steps\n1. Download\n2. Restart\n\n```sh\nnpm install -g ai-zero-token\n```\n\n[Full release](https://github.com/fchangjun/AI-Zero-Token/releases)");
    expect(html).toContain("<h4>What&#x27;s new</h4>");
    expect(html).toContain("<ul><li><strong>Update</strong> from the app</li><li>Keep <code>settings</code></li></ul>");
    expect(html).toContain("<ol><li>Download</li><li>Restart</li></ol>");
    expect(html).toContain("<pre><code>npm install -g ai-zero-token</code></pre>");
    expect(html).toContain('href="https://github.com/fchangjun/AI-Zero-Token/releases"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
  test("renders remote HTML and unsafe link protocols as inert text", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert) [local](file:///etc/passwd) [data](data:text/html,evil)');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("href=");
    expect(html).toContain("&lt;script&gt;");
  });
  test("keeps blank and incomplete Markdown readable", () => {
    expect(render("   ")).toBe('<div class="desktop-release-notes"></div>');
    expect(render("```text\nunfinished")).toContain("<pre><code>unfinished</code></pre>");
    expect(render("Paragraph\ncontinued\n\n---\n\nLast line")).toContain("<p>Paragraph\ncontinued</p><hr/><p>Last line</p>");
  });
});
