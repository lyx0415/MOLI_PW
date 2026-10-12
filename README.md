# 茉莉陪玩 · 三角色服务平台

从原有“入职申请 + 人员展示”升级为客户、陪玩、管理者共用的全栈平台。保留茉莉绿与暖白品牌，提供响应式页面和完整的预约履约流程。

## 已实现

| 角色 | 功能 |
| --- | --- |
| 客户 | 邮箱注册验证、登录和找回密码；游戏/价格/风格筛选；收藏；查看服务与档期；预约；微信或支付宝付款；订单沟通；确认完成；真实订单评价；退款申请；客服工单 |
| 陪玩 | 提交入驻申请、查看审核结果；工作台；服务与价格管理；每周档期；接单/拒单/开始/结束；订单沟通；收入与结算申请 |
| 管理者 | 入驻审核；账号与主页管理；订单与原路退款；工单回复；结算登记；公告与评价管理；操作日志 |

支付支持微信 Native、可配置的微信 H5，以及支付宝电脑网站/手机网站支付。密钥未配置时支付和公开预约不会开放。网页回跳不会将订单直接标记为付款成功。

## 本地启动

环境要求：Node.js 24 或更高版本。开发环境默认使用持久化 SQLite，生产环境强制使用 MySQL 8 与 HTTPS。

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

打开 `http://localhost:5173`。前端 Vite 将 `/api` 代理到后端 `3000` 端口。不要用 `127.0.0.1:5173` 替代已配置的 `PUBLIC_ORIGIN`；如需替换，应同步修改 `.env`。

### 体验示例资料

在 `.env` 中明确设置 `DEMO_MODE=true`，并为 `DEMO_PASSWORD` 设置一个至少10位、包含字母数字的临时密码，然后运行：

```powershell
npm run demo:seed
```

示例账号：`customer@demo.moli.test`、`provider1@demo.moli.test` 至 `provider6@demo.moli.test`、`admin@demo.moli.test`。密码均为你设置的 `DEMO_PASSWORD`。示例人物与插画不是真实人员，界面有演示标识。生产服务器拒绝示例播种；上线应使用全新生产数据库。

### 创建真实管理员

在服务器的受保护环境中设置 `ADMIN_EMAIL`、`ADMIN_PASSWORD`、可选 `ADMIN_NAME`，运行 `npm run admin:create`。该命令不会覆盖已有账号。执行后移除 `ADMIN_PASSWORD`，不要把密码写进 Git。

## 验证

```powershell
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --registry=https://registry.npmjs.org
```

本地浏览器测试默认使用已安装的 Microsoft Edge。其他平台先运行 `npx playwright install chromium`，再设置 `PLAYWRIGHT_CHANNEL=chromium`。测试使用独立内存数据库和隔离支付适配器，不进行真实扣款；生产入口不加载该适配器。

真实 MySQL 回归：准备专用测试 MySQL 实例，通过 `TEST_DB_DRIVER=mysql`、`TEST_DB_PORT`、`TEST_DB_USER`、`TEST_DB_PASSWORD` 指定。测试创建并删除随机 `moli_qa_*` 数据库，需要测试实例的建库权限，请勿指向业务生产库。测试不会复用旧业务表。

## 目录

```text
backend/
  app.js                 HTTP 入口、鉴权、CSRF、错误处理
  lib/                   数据库、配置、校验、订单领域逻辑
  migrations/            带版本和校验和的数据库迁移
  payments/              微信 API v3 / 支付宝官方 SDK
  routes/                账号、发现、业务、管理、支付接口
  scripts/               管理员创建、迁移、维护、示例播种
  test/                  API、鉴权、支付与邮箱验证测试
frontend/src/
  components/            品牌、插画、服务卡片、分页
  lib/                   API、账号状态、站点信息
  views/                 公开页面与三角色工作台
deploy/                  HTTPS 网关
tests/e2e/               浏览器业务流程
docs/                    架构、支付、部署、迁移与验收
```

## 部署与运营

- [部署说明](docs/DEPLOYMENT.md)：Docker Compose、HTTPS、邮件、管理员初始化、备份。
- [微信与支付宝支付](docs/PAYMENTS.md)：商户配置、回调、查单、退款及真实联调步骤。
- [架构与业务规则](docs/ARCHITECTURE.md)：权限、订单状态、资金与并发规则。
- [旧数据迁移](docs/MIGRATION.md)：原始数据保留、账号绑定、上线切换和回退。
- [验收记录](docs/ACCEPTANCE.md)：已验证范围和剩余外部条件。

生产版需要运营主体、客服邮箱、SMTP、域名/HTTPS 和商户密钥。微信商户已由项目负责人确认持有，仍需实际配置并完成商户联调。当前代码不能代替公网部署、支付产品开通、真实审核和运营安排。
