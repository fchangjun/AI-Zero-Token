export function TakeoverModeTips() {
  return <div className="takeover-mode-tips" aria-label="接管方式说明">
    <p><strong>直接接管</strong>请求直连本渠道，适合已支持 Codex 的服务。日常优先选；模型目录与状态更新需保持 AZT 运行。</p>
    <p><strong>混合接管</strong>选好模型即可接入，AZT 自动识别接口并中转，适合多渠道混用或兼容接入。需保持 AZT 运行，响应可能变慢。</p>
  </div>;
}
