import { useMemo, useState } from "react";
import { ArrowRight, Copy, Download, ExternalLink, Server, ShieldCheck } from "lucide-react";
import { downloadTextFile } from "@/shared/api";
import { copyText } from "@/shared/lib/app-utils";
import type { AdminConfig } from "@/shared/types";
import { skillMarkdown } from "@/content/skill-doc";
import "./docs.css";

type DocsTab = "quick-start" | "skill" | "examples";

function SnippetCard({
  title,
  description,
  code,
  onCopy,
}: {
  title: string;
  description: string;
  code: string;
  onCopy: () => void;
}) {
  return (
    <section className="docs-snippet">
      <div className="docs-snippet-head">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <button className="btn-secondary icon-only" type="button" onClick={onCopy} title="复制代码">
          <Copy size={16} />
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </section>
  );
}

export function DocsPage({
  config,
  onRoute,
  copyBaseUrl,
  setStatus,
}: {
  config: AdminConfig | null;
  onRoute: (route: "tester" | "overview") => void;
  copyBaseUrl: () => void;
  setStatus: (value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DocsTab>("quick-start");
  const baseUrl = config?.baseUrl || "http://127.0.0.1:8787/v1";
  const apiKey = "local";
  const startCommand = "azt start";
  const sourceLines = skillMarkdown.split(/\r?\n/).length;

  const docStats = useMemo(() => {
    const lines = skillMarkdown.split(/\r?\n/).length;
    const codeBlocks = (skillMarkdown.match(/```/g)?.length || 0) / 2;
    const headings = skillMarkdown.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line)).length;
    return { lines, codeBlocks, headings };
  }, []);

  const skillHighlights = [
    { label: "用途", value: "本地网关接入说明" },
    { label: "接入参数", value: `baseURL + apiKey = ${baseUrl} / ${apiKey}` },
    { label: "启动命令", value: "azt start / npx ai-zero-token start" },
    { label: "常用接口", value: "/v1/models · /v1/responses · /v1/chat/completions · /v1/images/generations" },
  ];

  const quickStartSnippet = `baseURL = "${baseUrl}"\napiKey = "${apiKey}"`;
  const openAIExample = `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: "${apiKey}",\n  baseURL: "${baseUrl}",\n});`;
  const curlExample = `curl ${baseUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${config?.settings.defaultModel || "gpt-5.4"}",\n    "messages": [{ "role": "user", "content": "Reply with OK only." }]\n  }'`;
  const responsesExample = `curl ${baseUrl}/responses \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${config?.settings.defaultModel || "gpt-5.4"}",\n    "input": "Reply with OK only."\n  }'`;

  async function copyDoc() {
    const ok = await copyText(skillMarkdown);
    setStatus(ok ? "Skill.md 已复制。" : "Skill.md 复制失败。");
  }

  function downloadDoc() {
    downloadTextFile("AI-Zero-Token-Skill.md", skillMarkdown, "text/markdown;charset=utf-8");
    setStatus("Skill.md 已下载。");
  }

  return (
    <section className="docs-page">
      <header className="docs-page-head docs-page-head-actions">
        <div className="docs-page-actions">
          <button className="btn-secondary" type="button" onClick={() => void copyDoc()}>
            <Copy size={16} />
            复制 Skill.md
          </button>
          <button className="btn-secondary" type="button" onClick={downloadDoc}>
            <Download size={16} />
            下载 Skill.md
          </button>
          <button className="btn-primary" type="button" onClick={() => onRoute("tester")}>
            <ExternalLink size={16} />
            打开接口测试
          </button>
        </div>
      </header>

      <section className="docs-summary">
        <div className="docs-summary-item">
          <span>Base URL</span>
          <strong>{baseUrl}</strong>
        </div>
        <div className="docs-summary-item">
          <span>API Key</span>
          <strong>{apiKey}</strong>
        </div>
        <div className="docs-summary-item">
          <span>启动命令</span>
          <strong>{startCommand}</strong>
        </div>
        <div className="docs-summary-item">
          <span>文档规模</span>
          <strong>{docStats.lines} 行 · {docStats.headings} 级标题 · {docStats.codeBlocks} 段代码</strong>
        </div>
      </section>

      <div className="docs-layout">
        <div className="docs-main">
          <nav className="docs-tab-bar" aria-label="Skill 文档视图切换">
            <button className={activeTab === "quick-start" ? "is-active" : ""} type="button" onClick={() => setActiveTab("quick-start")}>
              快速接入
            </button>
            <button className={activeTab === "skill" ? "is-active" : ""} type="button" onClick={() => setActiveTab("skill")}>
              Skill.md
            </button>
            <button className={activeTab === "examples" ? "is-active" : ""} type="button" onClick={() => setActiveTab("examples")}>
              示例代码
            </button>
          </nav>

          {activeTab === "quick-start" ? (
            <div className="docs-panel-grid">
              <section className="docs-panel">
                <div className="docs-panel-head">
                  <div>
                    <h3>三步接入</h3>
                    <p>先启动本地网关，再把 Skill.md 放进你的工具或项目。</p>
                  </div>
                </div>
                <ol className="docs-step-list">
                  <li>
                    <strong>启动网关</strong>
                    <span>执行 <code>{startCommand}</code>，管理页默认在 <code>http://127.0.0.1:8787</code>。</span>
                  </li>
                  <li>
                    <strong>复制接入参数</strong>
                    <span>Base URL 用 <code>{baseUrl}</code>，API Key 用 <code>{apiKey}</code>。</span>
                  </li>
                  <li>
                    <strong>下载 Skill.md</strong>
                    <span>把这份文档保存到你的工作流里，或直接复制给支持 Skill 的工具。</span>
                  </li>
                </ol>
              </section>

              <section className="docs-panel">
                <div className="docs-panel-head">
                  <div>
                    <h3>接入模板</h3>
                    <p>最少只需要这两项。</p>
                  </div>
                </div>
                <div className="docs-mini-grid">
                  <button className="docs-mini-copy" type="button" onClick={copyBaseUrl}>
                    <span>Base URL</span>
                    <strong>{baseUrl}</strong>
                    <Copy size={14} />
                  </button>
                  <button className="docs-mini-copy" type="button" onClick={() => void copyText(apiKey).then((ok) => setStatus(ok ? "API Key 已复制。" : "API Key 复制失败。"))}>
                    <span>API Key</span>
                    <strong>{apiKey}</strong>
                    <Copy size={14} />
                  </button>
                </div>
                <pre className="docs-code-sample">
                  <code>{quickStartSnippet}</code>
                </pre>
              </section>

              <section className="docs-panel docs-panel-wide">
                <div className="docs-panel-head">
                  <div>
                    <h3>常用接口</h3>
                    <p>这个 Skill 文档覆盖了模型、对话和生图三类常见用法。</p>
                  </div>
                </div>
                <div className="docs-endpoint-grid">
                  {["/v1/models", "/v1/chat/completions", "/v1/responses", "/v1/images/generations"].map((path) => (
                    <div className="docs-endpoint" key={path}>
                      <span>{path}</span>
                      <ArrowRight size={14} />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "skill" ? (
            <section className="docs-panel docs-preview-panel">
              <div className="docs-panel-head">
                <div>
                  <h3>Skill.md 摘要</h3>
                  <p>先看关键信息，再按需展开源码。</p>
                </div>
              </div>
              <div className="docs-skill-summary">
                {skillHighlights.map((item) => (
                  <article className="docs-summary-tile" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
              <details className="docs-source-fold">
                <summary>
                  查看源码
                  <span>{sourceLines} 行</span>
                </summary>
                <pre className="docs-source">
                  <code>{skillMarkdown}</code>
                </pre>
              </details>
            </section>
          ) : null}

          {activeTab === "examples" ? (
            <div className="docs-example-grid">
              <SnippetCard
                title="OpenAI SDK"
                description="适合前端和本地脚本。"
                code={openAIExample}
                onCopy={() => void copyText(openAIExample).then((ok) => setStatus(ok ? "OpenAI SDK 示例已复制。" : "复制失败。"))}
              />
              <SnippetCard
                title="curl Chat Completions"
                description="最直接的接口自测方式。"
                code={curlExample}
                onCopy={() => void copyText(curlExample).then((ok) => setStatus(ok ? "Chat Completions 示例已复制。" : "复制失败。"))}
              />
              <SnippetCard
                title="Responses API"
                description="适用于新式文本生成调用。"
                code={responsesExample}
                onCopy={() => void copyText(responsesExample).then((ok) => setStatus(ok ? "Responses API 示例已复制。" : "复制失败。"))}
              />
              <section className="docs-panel docs-note-panel">
                <h3>用户如何使用</h3>
                <ul>
                  <li>在侧边栏打开“使用文档”。</li>
                  <li>先复制 Base URL 和 API Key，再下载 Skill.md。</li>
                  <li>把 Skill.md 放到你的 AI 工具、项目文档或自动化流程里。</li>
                  <li>需要验证时，直接跳到“接口测试”页面跑一条请求。</li>
                </ul>
                <div className="docs-action-row">
                  <button className="btn-secondary" type="button" onClick={() => onRoute("overview")}>
                    <Server size={16} />
                    回到概览
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => onRoute("tester")}>
                    <ShieldCheck size={16} />
                    去接口测试
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}
