import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import type { BusyAction, SettingDraft } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";

function createSettingsDraft(config: AdminConfig): SettingDraft {
  return {
    defaultModel: config.settings.defaultModel,
    proxyEnabled: config.settings.networkProxy.enabled,
    proxyUrl: config.settings.networkProxy.url,
    proxyNoProxy: config.settings.networkProxy.noProxy || "localhost,127.0.0.1,::1",
    autoSwitchEnabled: config.settings.autoSwitch.enabled,
    quotaSyncConcurrency: String(config.settings.runtime?.quotaSyncConcurrency || 16),
    serverPort: String(config.settings.server.port || 8787),
  };
}

export function SettingsPage(props: {
  showEmails: boolean;
  setShowEmails: Dispatch<SetStateAction<boolean>>;
  config: AdminConfig | null;
  busy: BusyAction;
  status: string;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
}) {
  const [settingsDraft, setSettingsDraft] = useState<SettingDraft>({
    defaultModel: "",
    proxyEnabled: false,
    proxyUrl: "",
    proxyNoProxy: "localhost,127.0.0.1,::1",
    autoSwitchEnabled: false,
    quotaSyncConcurrency: "16",
    serverPort: "8787",
  });
  const [settingsDirty, setSettingsDirty] = useState(false);

  useEffect(() => {
    if (!props.config || settingsDirty) {
      return;
    }
    setSettingsDraft(createSettingsDraft(props.config));
  }, [props.config, settingsDirty]);

  function markSettingsDirty(next: Partial<SettingDraft>) {
    setSettingsDraft((draft) => ({ ...draft, ...next }));
    setSettingsDirty(true);
  }

  async function saveSettings(options?: { restart?: boolean }) {
    const serverPort = Number.parseInt(settingsDraft.serverPort, 10);
    if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
      props.setStatus("端口必须是 1 到 65535 之间的整数。");
      return;
    }
    const quotaSyncConcurrency = Number.parseInt(settingsDraft.quotaSyncConcurrency, 10);
    if (!Number.isInteger(quotaSyncConcurrency) || quotaSyncConcurrency < 1 || quotaSyncConcurrency > 32) {
      props.setStatus("全局额度刷新并发数必须是 1 到 32 之间的整数。");
      return;
    }

    const busyAction: BusyAction = options?.restart ? "restart" : "settings";
    props.setBusy(busyAction);
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: formatJson({
          defaultModel: settingsDraft.defaultModel,
          networkProxy: {
            enabled: settingsDraft.proxyEnabled,
            url: settingsDraft.proxyUrl,
            noProxy: settingsDraft.proxyNoProxy,
          },
          autoSwitch: {
            enabled: settingsDraft.autoSwitchEnabled,
          },
          runtime: {
            quotaSyncConcurrency,
          },
          server: {
            port: serverPort,
          },
        }),
      });
      props.setConfig(next);
      setSettingsDirty(false);
      if (options?.restart) {
        props.setStatus("设置已保存，正在重启本地网关...");
        await fetchJson<{ ok: boolean; restarting?: boolean }>("/_gateway/admin/restart", { method: "POST" });
        props.setStatus("本地网关正在重启，页面会自动恢复。");
      } else {
        props.setStatus("设置已保存。");
      }
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  async function testProxy() {
    props.setBusy("proxy");
    try {
      const result = await fetchJson<{ status: number; elapsedMs: number }>("/_gateway/admin/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({
          networkProxy: {
            enabled: settingsDraft.proxyEnabled,
            url: settingsDraft.proxyUrl,
            noProxy: settingsDraft.proxyNoProxy,
          },
        }),
      });
      props.setStatus(`代理测试通过: HTTP ${result.status}，耗时 ${result.elapsedMs} ms。`);
    } catch (error) {
      props.setStatus(`代理测试失败: ${errorMessage(error)}`);
    } finally {
      props.setBusy(null);
    }
  }

  async function refreshModels() {
    props.setBusy("models");
    try {
      await fetchJson("/_gateway/models/refresh", { method: "POST" });
      await props.refreshConfig({ silent: true });
      props.setStatus("Codex 模型列表已同步。");
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-page-head">
        <div>
          <div className="settings-page-kicker">
            <Settings2 size={14} />
            系统设置
          </div>
          <h2>本地网关和运行策略</h2>
          <p>设置会保存到本地状态目录，CLI、桌面端和本地服务共享。</p>
        </div>
        <div className="settings-page-actions">
          <button className="btn-secondary" type="button" onClick={refreshModels} disabled={props.busy === "models"}>
            {props.busy === "models" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            同步 Codex 模型
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-section">
          <h4>模型</h4>
          <label className="field">
            <span>默认文本模型</span>
            <select className="control" value={settingsDraft.defaultModel} onChange={(event) => markSettingsDirty({ defaultModel: event.target.value })}>
              {(props.config?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">模型列表来源：{props.config?.modelCatalog.source || "-"}，共 {props.config?.modelCatalog.modelCount || 0} 个。</p>
        </section>

        <section className="settings-section">
          <h4>上游代理</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.proxyEnabled} onChange={(event) => markSettingsDirty({ proxyEnabled: event.target.checked })} />
            <span>启用 OAuth、模型刷新和接口转发代理</span>
          </label>
          <label className="field">
            <span>代理地址</span>
            <input className="input" value={settingsDraft.proxyUrl} onChange={(event) => markSettingsDirty({ proxyUrl: event.target.value })} placeholder="http://127.0.0.1:7890" />
          </label>
          <label className="field">
            <span>No Proxy</span>
            <input className="input" value={settingsDraft.proxyNoProxy} onChange={(event) => markSettingsDirty({ proxyNoProxy: event.target.value })} />
          </label>
          <button className="btn-secondary" type="button" onClick={testProxy} disabled={props.busy === "proxy"}>
            测试代理
          </button>
        </section>

        <section className="settings-section">
          <h4>端口</h4>
          <label className="field">
            <span>网关端口</span>
            <input className="input" inputMode="numeric" type="number" min={1} max={65535} value={settingsDraft.serverPort} onChange={(event) => markSettingsDirty({ serverPort: event.target.value })} />
          </label>
          <p className="hint">修改后重启本地网关生效，桌面窗口不会退出。若端口被占用，启动时会自动顺延到下一个可用端口。</p>
        </section>

        <section className="settings-section">
          <h4>账号运行策略</h4>
          <label className="switch-line">
            <input type="checkbox" checked={settingsDraft.autoSwitchEnabled} onChange={(event) => markSettingsDirty({ autoSwitchEnabled: event.target.checked })} />
            <span>当前 API 账号额度耗尽后自动切换到下一个仍有额度的账号</span>
          </label>
          <label className="field">
            <span>全局额度刷新并发数</span>
            <input
              className="input"
              inputMode="numeric"
              max={32}
              min={1}
              type="number"
              value={settingsDraft.quotaSyncConcurrency}
              onChange={(event) => markSettingsDirty({ quotaSyncConcurrency: event.target.value })}
            />
          </label>
          <p className="hint">手动刷新全部账号额度时使用，默认 16。账号很多可以调高，遇到限流或失败增多时调低。</p>
          <p className="hint">{props.status}</p>
        </section>

        <section className="settings-section">
          <h4>显示</h4>
          <label className="switch-line">
            <input type="checkbox" checked={props.showEmails} onChange={(event) => props.setShowEmails(event.target.checked)} />
            <span>脱敏模式</span>
          </label>
          <p className="hint">开启后账号邮箱将以脱敏形式展示。</p>
        </section>
      </div>

      <div className="settings-page-actions settings-page-footer-actions">
        <button className="btn-secondary" type="button" onClick={() => void saveSettings()} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty}>
          保存设置
        </button>
        <button className="btn-primary" type="button" onClick={() => void saveSettings({ restart: true })} disabled={props.busy === "settings" || props.busy === "restart" || !settingsDirty || !props.config?.restartSupported}>
          保存并重启网关
        </button>
      </div>
    </section>
  );
}
