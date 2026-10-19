export function TakeoverModeTips() {
  return <div className="takeover-mode-tips" aria-label="接管方式说明">
    <p><strong>直接接管</strong>直接使用本身兼容 Codex 的模型，无需 AZT 做兼容转换。确认时可选“显示模型状态”或“独立使用 · 本地模型列表”。</p>
    <p><strong>混合接管</strong>由 AZT 做兼容转换，让原本不能直接用于 Codex 的模型接入使用，例如 Claude、DeepSeek、Gemini 等；也可组合多个渠道的模型。使用期间需保持 AZT 运行。</p>
    <p>模型名称仅作举例，具体接管方式取决于渠道接口和兼容性检测结果。例如，渠道已将 Claude 适配为兼容 Codex 时，也可选择直接接管。</p>
    <p className="takeover-startup-tip"><strong>重启后使用</strong>显示模型状态或混合接管：先启动 AZT，等待管理页加载完成，再打开 Codex，并保持 AZT 运行。本地模型列表：无需启动 AZT，不显示动态状态。</p>
  </div>;
}
