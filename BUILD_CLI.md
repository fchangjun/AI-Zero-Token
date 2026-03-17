# CLI 构建与发布准备

这份文档只讲一件事：

如何把当前项目构建成一个可运行、可本地安装、可继续发布为 npm CLI 的包。

README 负责介绍项目怎么使用；这里负责介绍 CLI 构建链。

## 当前目标

当前 CLI 相关目标已经拆成 4 层：

1. 源码可以直接运行
2. 构建产物可以直接运行
3. 可以通过 `npm link` 暴露成全局命令
4. 可以通过 `npm pack` 验证包内容

## 当前约定

- npm 包名：`ai-zero-token`
- CLI 命令名：`azt`
- CLI 构建产物入口：`dist/cli.js`
- 项目使用 ESM
- 相对导入统一使用 `.js` 后缀

这里最重要的一条是：

源码虽然是 `.ts` 文件，但相对导入写成 `.js`，这样可以同时兼容：

- Bun 直接运行源码
- Node 运行构建后的 `dist/*.js`
- 后续桌面端打包

## 相关文件

- `package.json`
- `tsconfig.json`
- `tsup.config.ts`
- `src/cli.ts`
- `src/cli/index.ts`

## package.json 的关键字段

当前 CLI 相关的关键字段主要有：

```json
{
  "type": "module",
  "bin": {
    "azt": "dist/cli.js",
    "ai-zero-token": "dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "bunx tsc -p tsconfig.json --noEmit",
    "pack:dry": "npm pack --dry-run"
  },
  "files": [
    "dist",
    "README.md",
    "package.json"
  ]
}
```

### `bin`

告诉 npm：

- 安装后把 `azt` 这个命令指向 `dist/cli.js`

### `files`

告诉 npm：

- 打包时只带必要文件
- 不把 `src/`、`node_modules/`、本地状态之类的内容一起带进去

## tsconfig.json 的关键点

这个项目当前是 Bun 开发优先、Node 构建产物运行，所以 TypeScript 配置要服务这两种场景。

重点有：

- `noEmit: true`
- `allowImportingTsExtensions: true` 已经不再是主路径依赖，但属于前面学习阶段的过渡支持
- 现在项目更推荐的导入风格是 `.js`

## tsup.config.ts 的作用

`tsup` 负责把 `src/**/*.ts` 构建成 `dist/**/*.js`。

当前这套项目结构更适合：

- 不依赖单文件 bundle 作为唯一输出
- 而是把整棵源码树转成 JS 产物

这样更容易：

- 看懂构建结果
- 调试路径问题
- 保持 CLI / core / server 的目录结构

## 构建命令

### 1. 类型检查

```bash
bunx tsc -p tsconfig.json --noEmit
```

### 2. 构建

```bash
npm run build
```

### 3. 验证构建产物

如果本机 `node` 版本满足要求：

```bash
node dist/cli.js help
```

如果当前环境里是 Bun 更稳定，也可以先用：

```bash
bun dist/cli.js help
```

## 本地安装验证

### 1. 建立本地全局链接

```bash
npm link
```

### 2. 验证命令

```bash
azt help
azt status
azt models
```

如果你同时保留了长命令，也可以验证：

```bash
ai-zero-token help
```

## npm 打包检查

先做 dry run：

```bash
npm pack --dry-run
```

这里主要看 3 件事：

1. `dist/cli.js` 在不在
2. `package.json` 在不在
3. 是否还把 `src/**`、构建配置、本地状态等不必要文件一起带进包

如果 dry run 正常，再做真实本地打包：

```bash
npm pack
```

它会生成一个本地 `.tgz` 文件，例如：

```text
ai-zero-token-1.0.0.tgz
```

这个文件就是以后真正发布到 npm 的本地近似物。

## 常见问题

### 1. 为什么源码是 `.ts`，导入却写 `.js`

因为导入路径最终要对齐运行时产物：

- 源码：`src/**/*.ts`
- 运行时：`dist/**/*.js`

所以写 `.js` 更符合最终执行环境。

### 2. 为什么不能只靠 Bun 直接跑源码

因为当前项目目标不只是本地开发，还包括：

- npm CLI
- Node 运行构建产物
- 后续桌面端集成

所以必须考虑构建后的模块解析。

### 3. 为什么不做代码加密或混淆

CLI 的当前目标是：

- 可运行
- 可维护
- 可调试
- 可发布

不是隐藏源码。

## 发布前还要补什么

当前如果想真正公开发布到 npm，还建议继续补：

- `description`
- `license`
- `repository`
- `keywords`
- `engines`
- 更清晰的开源边界说明

## 推荐学习顺序

如果你是为了学习 CLI 构建，建议按这个顺序看：

1. `package.json`
2. `tsconfig.json`
3. `tsup.config.ts`
4. `src/cli.ts`
5. `src/cli/index.ts`
6. `BUILD_CLI.md`
