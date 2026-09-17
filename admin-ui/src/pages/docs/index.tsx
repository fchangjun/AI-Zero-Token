import { useMemo, useState } from "react";
import { ArrowRight, Copy, Download, ExternalLink, Server, ShieldCheck } from "lucide-react";
import { downloadTextFile } from "@/shared/api";
import { copyText } from "@/shared/lib/app-utils";
import type { AdminConfig } from "@/shared/types";
import { skillMarkdown } from "@/content/skill-doc";
import "./docs.css";
import { useT } from "@/i18n";

type DocsTab = "quick-start" | "openclaw" | "skill" | "examples";

function SnippetCard({
  title,
  description,
  code,
  onCopy,
  copyTitle,
}: {
  title: string;
  description: string;
  code: string;
  onCopy: () => void;
  copyTitle: string;
}) {
  return (
    <section className="docs-snippet">
      <div className="docs-snippet-head">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <button className="btn-secondary icon-only" type="button" onClick={onCopy} title={copyTitle}>
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
  const t = useT();
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
    { label: t("docs.skill.highlights.purposeLabel"), value: t("docs.skill.highlights.purposeValue") },
    {
      label: t("docs.skill.highlights.paramsLabel"),
      value: t("docs.skill.highlights.paramsValue", { baseUrl, apiKey }),
    },
    { label: t("docs.skill.highlights.startLabel"), value: t("docs.skill.highlights.startValue") },
    { label: t("docs.skill.highlights.endpointsLabel"), value: t("docs.skill.highlights.endpointsValue") },
  ];

  const quickStartSnippet = `baseURL = "${baseUrl}"\napiKey = "${apiKey}"`;
  const openAIExample = `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: "${apiKey}",\n  baseURL: "${baseUrl}",\n});`;
  const curlExample = `curl ${baseUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${config?.settings.defaultModel || "gpt-5.4"}",\n    "messages": [{ "role": "user", "content": "Reply with OK only." }]\n  }'`;
  const openClawSettings = `Provider: OpenAI compatible\nBase URL: ${baseUrl}\nAPI Key: ${apiKey}\nModel: ${config?.settings.defaultModel || "gpt-5.4"}\nChat endpoint: /chat/completions\nStreaming: enabled\nTools / function calling: enabled`;
  const openClawToolExample = `curl ${baseUrl}/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${config?.settings.defaultModel || "gpt-5.4"}",\n    "stream": true,\n    "messages": [{ "role": "user", "content": "Call the weather tool for Shanghai." }],\n    "tools": [{\n      "type": "function",\n      "function": {\n        "name": "get_weather",\n        "description": "Get weather for a city.",\n        "parameters": {\n          "type": "object",\n          "properties": { "city": { "type": "string" } },\n          "required": ["city"]\n        }\n      }\n    }],\n    "tool_choice": "auto"\n  }'`;
  const responsesExample = `curl ${baseUrl}/responses \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${config?.settings.defaultModel || "gpt-5.4"}",\n    "input": "Reply with OK only."\n  }'`;

  async function copyDoc() {
    const ok = await copyText(skillMarkdown);
    setStatus(ok ? t("docs.copySkillDone") : t("docs.copySkillFailed"));
  }

  function downloadDoc() {
    downloadTextFile("AI-Zero-Token-Skill.md", skillMarkdown, "text/markdown;charset=utf-8");
    setStatus(t("docs.downloadSkillDone"));
  }

  return (
    <section className="docs-page">
      <header className="docs-page-head docs-page-head-actions">
        <div className="docs-page-actions">
          <button className="btn-secondary" type="button" onClick={() => void copyDoc()}>
            <Copy size={16} />
            {t("docs.copySkill")}
          </button>
          <button className="btn-secondary" type="button" onClick={downloadDoc}>
            <Download size={16} />
            {t("docs.downloadSkill")}
          </button>
          <button className="btn-primary" type="button" onClick={() => onRoute("tester")}>
            <ExternalLink size={16} />
            {t("docs.openTester")}
          </button>
        </div>
      </header>

      <section className="docs-summary">
        <div className="docs-summary-item">
          <span>{t("docs.baseUrlLabel")}</span>
          <strong>{baseUrl}</strong>
        </div>
        <div className="docs-summary-item">
          <span>{t("docs.apiKeyLabel")}</span>
          <strong>{apiKey}</strong>
        </div>
        <div className="docs-summary-item">
          <span>{t("docs.startCommandLabel")}</span>
          <strong>{startCommand}</strong>
        </div>
        <div className="docs-summary-item">
          <span>{t("docs.docSizeLabel")}</span>
          <strong>{t("docs.docSizeValue", { lines: docStats.lines, headings: docStats.headings, codeBlocks: docStats.codeBlocks })}</strong>
        </div>
      </section>

      <div className="docs-layout">
        <div className="docs-main">
          <nav className="docs-tab-bar" aria-label={t("docs.tabBarAria")}>
            <button className={activeTab === "quick-start" ? "is-active" : ""} type="button" onClick={() => setActiveTab("quick-start")}>
              {t("docs.tabs.quickStart")}
            </button>
            <button className={activeTab === "openclaw" ? "is-active" : ""} type="button" onClick={() => setActiveTab("openclaw")}>
              {t("docs.tabs.openclaw")}
            </button>
            <button className={activeTab === "skill" ? "is-active" : ""} type="button" onClick={() => setActiveTab("skill")}>
              {t("docs.tabs.skill")}
            </button>
            <button className={activeTab === "examples" ? "is-active" : ""} type="button" onClick={() => setActiveTab("examples")}>
              {t("docs.tabs.examples")}
            </button>
          </nav>

          {activeTab === "quick-start" ? (
            <div className="docs-panel-grid">
              <section className="docs-panel">
                <div className="docs-panel-head">
                  <div>
                    <h3>{t("docs.quickStart.sectionTitle")}</h3>
                    <p>{t("docs.quickStart.sectionDescription")}</p>
                  </div>
                </div>
                <ol className="docs-step-list">
                  <li>
                    <strong>{t("docs.quickStart.step1Title")}</strong>
                    <span>{t("docs.quickStart.step1Body", { command: startCommand })}</span>
                  </li>
                  <li>
                    <strong>{t("docs.quickStart.step2Title")}</strong>
                    <span>{t("docs.quickStart.step2Body", { baseUrl, apiKey })}</span>
                  </li>
                  <li>
                    <strong>{t("docs.quickStart.step3Title")}</strong>
                    <span>{t("docs.quickStart.step3Body")}</span>
                  </li>
                </ol>
              </section>

              <section className="docs-panel">
                <div className="docs-panel-head">
                  <div>
                    <h3>{t("docs.quickStart.templateTitle")}</h3>
                    <p>{t("docs.quickStart.templateDescription")}</p>
                  </div>
                </div>
                <div className="docs-mini-grid">
                  <button className="docs-mini-copy" type="button" onClick={copyBaseUrl}>
                    <span>{t("docs.baseUrlLabel")}</span>
                    <strong>{baseUrl}</strong>
                    <Copy size={14} />
                  </button>
                  <button className="docs-mini-copy" type="button" onClick={() => void copyText(apiKey).then((ok) => setStatus(ok ? t("docs.copyApiKeyDone") : t("docs.copyApiKeyFailed")))}>
                    <span>{t("docs.apiKeyLabel")}</span>
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
                    <h3>{t("docs.quickStart.endpointsTitle")}</h3>
                    <p>{t("docs.quickStart.endpointsDescription")}</p>
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

          {activeTab === "openclaw" ? (
            <div className="docs-example-grid">
              <SnippetCard
                title={t("docs.openclaw.settingsTitle")}
                description={t("docs.openclaw.settingsDescription")}
                code={openClawSettings}
                onCopy={() => void copyText(openClawSettings).then((ok) => setStatus(ok ? t("docs.openclaw.settingsCopyDone") : t("docs.copyFailed")))}
                copyTitle={t("common.copy")}
              />
              <SnippetCard
                title={t("docs.openclaw.toolTitle")}
                description={t("docs.openclaw.toolDescription")}
                code={openClawToolExample}
                onCopy={() => void copyText(openClawToolExample).then((ok) => setStatus(ok ? t("docs.openclaw.toolCopyDone") : t("docs.copyFailed")))}
                copyTitle={t("common.copy")}
              />
              <section className="docs-panel docs-note-panel">
                <h3>{t("docs.openclaw.scopeTitle")}</h3>
                <ul>
                  <li>{t("docs.openclaw.scopeStream")}</li>
                  <li>{t("docs.openclaw.scopeTools")}</li>
                  <li>{t("docs.openclaw.scopeToolCalls")}</li>
                  <li>{t("docs.openclaw.scopeLogs")}</li>
                  <li>{t("docs.openclaw.scopeLimits")}</li>
                </ul>
              </section>
            </div>
          ) : null}

          {activeTab === "skill" ? (
            <section className="docs-panel docs-preview-panel">
              <div className="docs-panel-head">
                <div>
                  <h3>{t("docs.skill.summaryTitle")}</h3>
                  <p>{t("docs.skill.summaryDescription")}</p>
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
                  {t("docs.skill.sourceSummary")}
                  <span>{t("docs.skill.sourceLineCount", { count: sourceLines })}</span>
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
                title={t("docs.examples.openaiTitle")}
                description={t("docs.examples.openaiDescription")}
                code={openAIExample}
                onCopy={() => void copyText(openAIExample).then((ok) => setStatus(ok ? t("docs.examples.openaiCopyDone") : t("docs.copyFailed")))}
                copyTitle={t("common.copy")}
              />
              <SnippetCard
                title={t("docs.examples.curlTitle")}
                description={t("docs.examples.curlDescription")}
                code={curlExample}
                onCopy={() => void copyText(curlExample).then((ok) => setStatus(ok ? t("docs.examples.curlCopyDone") : t("docs.copyFailed")))}
                copyTitle={t("common.copy")}
              />
              <SnippetCard
                title={t("docs.examples.responsesTitle")}
                description={t("docs.examples.responsesDescription")}
                code={responsesExample}
                onCopy={() => void copyText(responsesExample).then((ok) => setStatus(ok ? t("docs.examples.responsesCopyDone") : t("docs.copyFailed")))}
                copyTitle={t("common.copy")}
              />
              <section className="docs-panel docs-note-panel">
                <h3>{t("docs.examples.usageTitle")}</h3>
                <ul>
                  <li>{t("docs.examples.usage1")}</li>
                  <li>{t("docs.examples.usage2")}</li>
                  <li>{t("docs.examples.usage3")}</li>
                  <li>{t("docs.examples.usage4")}</li>
                </ul>
                <div className="docs-action-row">
                  <button className="btn-secondary" type="button" onClick={() => onRoute("overview")}>
                    <Server size={16} />
                    {t("docs.examples.backOverview")}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => onRoute("tester")}>
                    <ShieldCheck size={16} />
                    {t("docs.examples.goTester")}
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
