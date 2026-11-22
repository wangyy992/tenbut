# 满分，但是。

和朋友一起玩的中文联机打分小游戏。选择「满分女」「满分男」「满分追星线下」，抽取一个「但是」，每人给 0–10 分，所有人提交后统一揭晓。

## 已有功能

- 2–12 人异地房间；6 位房间码与邀请链接。
- 三类共 124 道题；5 / 10 / 20 题一局；本局不重复。
- 隐藏评分、揭晓分差、整局回顾、自定义题目（每房间最多 50 道）。
- 中途加入从下一题参与；刷新恢复；房主移出离线成员；房主离开自动转交。
- 手机适配；每 2 秒轮询同步；房间有效期 24 小时。

## 运行

Node.js >= 22.13，npm。

```sh
npm ci
npm run db:generate  # 仅修改 db/schema.ts 后需要；已有迁移无需重新生成
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fluffy_roland_deschain.sql
npm run dev
```

首次运行时应用上述已有迁移。运行过的本地数据库不必重复应用。dev 地址以终端输出为准；`npm start` 可预览构建后的 Worker。

```sh
npx tsc --noEmit
node tests/run-local.mjs  # 真实 SQLite + D1 适配器，测试完整 HTTP 处理逻辑
node tests/integration.mjs http://localhost:5173  # 可选：对正在运行的开发服务器测试
```

测试在目标站点临时创建专用测试房间，仅在开发环境运行。测试覆盖并发投票、隐藏答案、权限、掉线处理、旁观加入和完整游戏循环。

## 部署

项目使用 React 19、Vinext、Cloudflare Workers 和 D1。`.openai/hosting.json` 是托管配置；部署产物在 `dist/`。GitHub 保留完整源代码。GitHub Pages 只支持静态文件，无法运行这个联机后端；请使用支持 Worker + D1 的托管。

自有 Cloudflare 部署时，以构建生成的 `dist/server/wrangler.json` 为基础配置自己的 D1 数据库，并先应用 `drizzle/` 迁移。不要把另一环境的数据库 ID、凭据或 `.env` 提交到 Git。

## 文件

- `app/page.tsx`：游戏界面、邀请、轮询和会话恢复。
- `app/api/game/route.ts`：HTTP 接口，输入校验、房间过期及 D1 并发写入。
- `app/game.ts`：房间状态机、玩家权限、抽题与揭晓规则。
- `app/questions.ts`：内置题库。
- `db/schema.ts` / `drizzle/`：数据库结构及迁移。

## 房间与隐私

玩家无需账户，服务器为每人生成不可猜测的会话令牌；仅房间码不能读取或操作已加入玩家的会话。页面不会在所有人提交前返回评分数值；使用数据库版本号的条件更新避免同时提交时相互覆盖。

昵称、评分、题目会在同房间内展示。不要在题目中填写他人隐私。令牌保存在当前浏览器本地；更换设备、清除浏览器数据后需要重新加入。房间在创建 24 小时后不可访问，后续建房会清理过期记录。房间码为邀请口令，知道码的人可以加入，不适合存放敏感信息。

本项目为小范围朋友聚会设计，尚未加入面向大规模公开服务的限流和内容审核。
