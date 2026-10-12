# 微信与支付宝支付

项目负责人已确认有微信支付商户账号。推荐先接入微信 Native，再按商户开通情况开启 H5；支付宝实现保留为可选渠道。

## 微信商户配置

商户需要普通商户 API v3 支付权限、与商户号绑定的 AppID、API 证书序列号和对应私钥，以及 APIv3 密钥。当前适配器使用固定验签公钥 ID；优先采用微信支付公钥模式。已有平台证书模式也可传入可信平台证书 PEM 和其序列号，轮换时同步更换文件及 ID。

将私钥、公钥分别保存为 `secrets/wechat-private.pem`、`secrets/wechat-public.pem`，禁止提交 Git，填好：

```dotenv
WECHAT_ENABLED=true
WECHAT_H5_ENABLED=false
WECHAT_APP_ID=你的AppID
WECHAT_MCH_ID=你的商户号
WECHAT_SERIAL=你的商户API证书序列号
WECHAT_PRIVATE_KEY_PATH=secrets/wechat-private.pem
WECHAT_PUBLIC_KEY_PATH=secrets/wechat-public.pem
WECHAT_PUBLIC_KEY_ID=对应的PUB_KEY_ID或平台证书序列号
WECHAT_API_V3_KEY=你的32字节APIv3密钥
PUBLIC_ORIGIN=https://你的实际域名
```

Native 接口：`POST /v3/pay/transactions/native`，返回二维码由本网站本地生成。付款通知地址为：

```text
https://你的实际域名/api/payments/notify/wechat
```

通知使用原始请求体和微信请求头验签，再用 APIv3 密钥进行 AES-256-GCM 解密。校验商户号、AppID、币种、金额和订单号后，事务内更新一次订单；错误签名、过期签名、错误公钥 ID 和探测签名不会记账。

### 手机浏览器 H5

在微信商户后台开通 H5 产品并登记实际支付域名后，设置 `WECHAT_H5_ENABLED=true`。手机系统浏览器会调用 `/v3/pay/transactions/h5`；真实用户 IP 由可信反向代理链提供。回跳地址始终在 `PUBLIC_ORIGIN` 下，并编码为 `redirect_url`。

H5 支付需要在微信外的系统浏览器打开；微信内置浏览器使用二维码方案，用户需在外部浏览器打开或用另一设备扫码。当前未实现公众号 OAuth/OpenID/JSAPI，不声称支持微信内一键 JSAPI 支付。未开通 H5 时所有设备都显示 Native 二维码。

### 微信查单与退款

查单使用签名请求与应答验签。退款调用 `/v3/refund/domestic/refunds`，使用稳定的商户退款单号，并通过签名查询确认最终状态。`PROCESSING` 只表示处理中，不会显示“已退款”。首次请求超时可重试相同退款单号，避免新建重复退款。

## 支付宝可选配置

应用需要电脑网站支付；移动端另需手机网站支付产品。适配器使用支付宝官方 Node.js SDK，公钥模式、RSA2、PKCS8 私钥默认配置：

```dotenv
ALIPAY_ENABLED=true
ALIPAY_APP_ID=你的应用ID
ALIPAY_SELLER_ID=你的收款账户seller_id
ALIPAY_PRIVATE_KEY_PATH=secrets/alipay-private.pem
ALIPAY_PUBLIC_KEY_PATH=secrets/alipay-public.pem
ALIPAY_KEY_TYPE=PKCS8
ALIPAY_ENDPOINT=https://openapi.alipay.com
```

通知地址：`https://你的实际域名/api/payments/notify/alipay`。检查 RSA2、AppID、seller_id、交易状态、订单和金额后才记账。查询与退款响应由 SDK 验签。测试可用支付宝沙箱网关 `https://openapi-sandbox.dl.alipaydev.com`，生产配置拒绝沙箱。

## 资金与验收

价格由服务器根据服务快照计算，单位为整数分。客户端不能提交总金额或把状态直接改为已付款。网页回跳只用于展示，实际状态取决于验签通知或签名查单。付款渠道和模式在第一次支付请求时锁定。

测试代码的支付适配器只存在于 `backend/test/e2e-server.js`，要求 `NODE_ENV=test`，使用独立内存库。生产入口和 Docker 镜像不包含此入口。当前所有支付测试都没有进行真实扣款。

正式联调前确认商户产品权限、域名/HTTPS、私钥对应证书和公钥 ID、APIv3 密钥、退款权限与负责人指定的试单金额。验收真实支付、重复通知、查单、拒单、退款处理中和退款到账。资金核对完成后再开放公众预约。

## 官方依据

- [微信 Native 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)
- [微信 H5 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791834)
- [微信 H5 调起与回跳](https://pay.wechatpay.cn/doc/v3/merchant/4012791835)
- [微信通知验签与解密](https://pay.wechatpay.cn/doc/v3/merchant/4012791861)
- [支付宝官方 Node.js SDK](https://github.com/alipay/alipay-sdk-nodejs-all)
