export function printHelp(): void {
  console.log(`用法:

  azt login
  azt models
  azt status
  azt ask "你好，请简单介绍一下自己"
  azt ask --model gpt-5.3-codex "你好"
  azt ask --payload-file ./codex-body.json --dump-raw ./codex-raw.json
  azt ask --payload-file ./codex-body.json --write-artifacts-dir ./artifacts
  azt start
  azt serve
  azt clear

说明:

  login   走真实 OpenAI Codex OAuth，新增并保存一个账号 profile
  models  查看这个 demo 当前内置支持的模型列表
  status  查看当前 demo 当前激活账号、账号数量和过期时间
  ask     用保存的 token 调真实 Codex Responses API
          实验模式可用 --payload-file 透传额外请求体，配合 --dump-raw / --print-raw 观察 SSE 原始事件
          如响应里含 image_b64 / partial_image_b64，可用 --write-artifacts-dir 直接写成图片文件
  start   启动本地 HTTP 网关并自动打开管理页面
  serve   启动本地 HTTP 网关
  clear   清空 demo 的本地状态
`);
}
