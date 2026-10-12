# 部署说明

## 本次可用交付与边界

代码、构建、API 测试和独立 MySQL 8.0.46 测试已准备。提供的 Docker Compose 使用 Node 24、MySQL 8、Caddy HTTPS 网关；本次工作环境没有 Docker 引擎，容器构建和真实公网部署需在目标服务器验证。

项目负责人已确认拥有微信支付商户账号。正式联调仍需要域名、服务器、商户 AppID/商户号、API 私钥、验签公钥信息和 APIv3 密钥。不要把这些密钥发送到聊天或 GitHub。

## 服务器准备

建议 Linux 服务器安装 Docker Engine 与 Compose v2，并将实际域名解析到服务器。开放80/443，MySQL 和应用端口仅在容器网络中使用。部署一个 API 实例；扩大规模前按架构文档改共享限流和迁移锁。

复制 `.env.example` 为 `.env`，填写：

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://你的实际域名
PUBLIC_HOST=你的实际域名
DATABASE_DRIVER=mysql
DB_HOST=db
DB_PORT=3306
DB_NAME=peiwang_db
DB_USER=moli
DB_PASSWORD=单独生成的强数据库密码
MYSQL_ROOT_PASSWORD=另一个单独生成的强密码
TRUST_PROXY=1
OPERATOR_NAME=实际运营主体
SUPPORT_EMAIL=实际客服邮箱
SMTP_HOST=实际邮件服务器
SMTP_PORT=465
SMTP_USER=实际邮箱账号
SMTP_PASSWORD=邮箱服务授权密码
SMTP_FROM=发件地址
DEMO_MODE=false
```

`.env` 和 `secrets/` 应仅允许运维读取。密钥文件由只读卷挂载，确保容器内 `node` 用户有读取权限。不要把演示数据库复制到服务器。

## 启动

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

应用启动时执行版本化迁移，原业务表保持不变。Caddy 根据域名自动取得 HTTPS 证书；DNS、证书签发与公网端口需实际可用。生产缺少 HTTPS/MySQL/邮件/运营信息时应用拒绝启动。

通过受保护的部署终端给管理员初始化命令临时提供 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，运行容器内 `node backend/scripts/create-admin.js`。不要将密码写进 shell 历史或提交 `.env`；完成后清除临时变量。

## 微信配置

按 [支付文档](PAYMENTS.md) 设置微信字段并挂载密钥。先开通 Native；需要手机浏览器支付时再开通 H5 并登记相同域名。改变字段后重启应用。

服务公开前，用商户允许的测试方式核对：注册邮箱、管理员登录、陪玩审核、预约冲突、真实付款、查询支付、重复通知、拒单、整单原路退款与双方订单状态。真实付款须由负责人确认金额和参与者后执行，本次交付未进行任何真实扣款。

## 运营设置

前台服务协议、隐私政策和退款规则依据当前功能编写，运营者应核对主体、联系人、服务范围、保存期限与实际处理流程后发布。入驻审核需要成年身份和技能核验；客服工单需要实际有人值守，结算需要真实转账与凭证。

如果在中国大陆部署，应根据实际运营地点与业务确认所需备案及资质，并将真实备案号填入 `ICP_RECORD`。本代码不会生成虚构备案、实名认证或营业资质。

## 备份与升级

- 按运营者选定的周期备份 MySQL 数据和支付核对记录，将备份加密后放在服务器之外，并实际测试恢复。
- 升级前备份数据库，保存前一应用镜像。不要修改已经应用的迁移文件，使用新的递增迁移文件。
- 已付款订单、退款和结算记录不能通过回滚网页代码来撤销，应先核对资金事实。
- `/api/health` 同时检查数据库可用性；配置服务器监控、错误日志和支付通知失败告警。
- 更换旧系统公开过的密码。Git 历史中仍可能保留这些值，新的运行配置不得复用它们。

Docker、DNS、SMTP 商户公网联调以及运营资质不在本次本地验证结果中，需在目标环境完成。
