export function printHelp(): void {
  console.log(`用法:

  bun src/cli.js login
  bun src/cli.js models
  bun src/cli.js status
  bun src/cli.js ask "你好，请简单介绍一下自己"
  bun src/cli.js ask --model gpt-5.3-codex "你好"
  bun src/cli.js serve
  bun src/cli.js clear

说明:

  login   走真实 OpenAI Codex OAuth，保存 access/refresh token
  models  查看这个 demo 当前内置支持的模型列表
  status  查看当前 demo 保存的账号和过期时间
  ask     用保存的 token 调真实 Codex Responses API
  serve   启动本地 HTTP 网关
  clear   清空 demo 的本地状态
`);
}
