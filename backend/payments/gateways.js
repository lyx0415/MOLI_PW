import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sign, verify, randomBytes, createDecipheriv } from "node:crypto";
import { AlipaySdk } from "alipay-sdk";
import { assert, HttpError } from "../lib/errors.js";

export function parseMoney(value) {
  assert(
    typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value),
    400,
    "无效金额",
  );
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  assert(Number.isSafeInteger(cents) && cents > 0, 400, "无效金额");
  return cents;
}
export const moneyString = (cents) => (cents / 100).toFixed(2);
export function verifyWechatSignature(
  headers,
  raw,
  key,
  serial,
  clock = Date.now(),
) {
  const get = (name) =>
    typeof headers.get === "function"
      ? headers.get(name)
      : headers[name.toLowerCase()];
  const timestamp = get("Wechatpay-Timestamp"),
    nonce = get("Wechatpay-Nonce"),
    signature = get("Wechatpay-Signature");
  assert(
    get("Wechatpay-Serial") === serial &&
      /^\d+$/.test(timestamp || "") &&
      Math.abs(clock / 1000 - Number(timestamp)) < 300,
    401,
    "微信支付通知签名无效",
  );
  assert(
    typeof nonce === "string" &&
      typeof signature === "string" &&
      !signature.startsWith("WECHATPAY/SIGNTEST/"),
    401,
    "微信支付通知签名无效",
  );
  assert(
    verify(
      "RSA-SHA256",
      Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
      key,
      Buffer.from(signature, "base64"),
    ),
    401,
    "微信支付通知签名无效",
  );
}
export function decryptWechat(resource, apiKey) {
  assert(
    resource.algorithm === "AEAD_AES_256_GCM" &&
      Buffer.byteLength(apiKey) === 32,
    400,
    "微信支付通知格式无效",
  );
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  assert(encrypted.length > 16, 400, "微信支付通知格式无效");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiKey),
    Buffer.from(resource.nonce),
  );
  decipher.setAuthTag(encrypted.subarray(-16));
  decipher.setAAD(Buffer.from(resource.associated_data || ""));
  return JSON.parse(
    Buffer.concat([
      decipher.update(encrypted.subarray(0, -16)),
      decipher.final(),
    ]).toString("utf8"),
  );
}

export function createGateways(config) {
  const env = config.env,
    channels = {};
  const httpsCallback = (channel) =>
    `${config.origin}/api/payments/notify/${channel}`;
  if (env.ALIPAY_ENABLED === "true") {
    assert(
      env.ALIPAY_APP_ID && env.ALIPAY_SELLER_ID,
      500,
      "ALIPAY_APP_ID and ALIPAY_SELLER_ID required",
    );
    const endpoint = env.ALIPAY_ENDPOINT || "https://openapi.alipay.com";
    assert(
      [
        "https://openapi.alipay.com",
        "https://openapi-sandbox.dl.alipaydev.com",
      ].includes(endpoint),
      500,
      "Invalid Alipay endpoint",
    );
    assert(
      !config.production || endpoint === "https://openapi.alipay.com",
      500,
      "Production cannot use Alipay sandbox",
    );
    const sdk = new AlipaySdk({
      appId: env.ALIPAY_APP_ID,
      privateKey: readFileSync(
        resolve(config.projectRoot, env.ALIPAY_PRIVATE_KEY_PATH),
        "utf8",
      ),
      alipayPublicKey: readFileSync(
        resolve(config.projectRoot, env.ALIPAY_PUBLIC_KEY_PATH),
        "utf8",
      ),
      keyType: env.ALIPAY_KEY_TYPE || "PKCS8",
      endpoint,
    });
    const rpc = async (method, bizContent) => {
      const result = await sdk.exec(
        method,
        { bizContent },
        { validateSign: true },
      );
      assert(
        result.code === "10000",
        502,
        result.subMsg || result.msg || "支付宝接口暂不可用",
      );
      return result;
    };
    channels.alipay = {
      label: "支付宝",
      create: async (order, mobile, context = {}) => ({
        type: "redirect",
        url: sdk.pageExecute(
          (context.mode ? context.mode === "wap" : mobile)
            ? "alipay.trade.wap.pay"
            : "alipay.trade.page.pay",
          "GET",
          {
            notifyUrl: httpsCallback("alipay"),
            returnUrl: `${config.origin}/orders/${order.id}?payment=return`,
            bizContent: {
              out_trade_no: order.order_no,
              product_code: (context.mode ? context.mode === "wap" : mobile)
                ? "QUICK_WAP_WAY"
                : "FAST_INSTANT_TRADE_PAY",
              subject: "茉莉陪玩 · " + order.title,
              total_amount: moneyString(order.amount_cents),
              timeout_express: "15m",
            },
          },
        ),
      }),
      verifyNotify: (data) => {
        assert(
          data.sign_type === "RSA2" && sdk.checkNotifySignV2(data),
          401,
          "支付宝通知验签失败",
        );
        assert(
          data.app_id === env.ALIPAY_APP_ID &&
            data.seller_id === env.ALIPAY_SELLER_ID,
          400,
          "支付宝商户不匹配",
        );
        if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(data.trade_status))
          return null;
        return {
          channel: "alipay",
          orderNo: data.out_trade_no,
          tradeNo: data.trade_no,
          amountCents: parseMoney(data.total_amount),
        };
      },
      query: async (order) => {
        const r = await rpc("alipay.trade.query", {
          out_trade_no: order.order_no,
        });
        return ["TRADE_SUCCESS", "TRADE_FINISHED"].includes(r.tradeStatus)
          ? {
              channel: "alipay",
              orderNo: order.order_no,
              tradeNo: r.tradeNo,
              amountCents: parseMoney(r.totalAmount),
            }
          : null;
      },
      refund: async (order) => {
        const r = await rpc("alipay.trade.refund", {
          out_trade_no: order.order_no,
          refund_amount: moneyString(order.amount_cents),
          out_request_no: order.refund_no,
          refund_reason: order.refund_reason,
        });
        return { success: r.fundChange === "Y" || r.fundChange === "N" };
      },
      queryRefund: async (order) => {
        const r = await rpc("alipay.trade.fastpay.refund.query", {
          out_trade_no: order.order_no,
          out_request_no: order.refund_no,
        });
        return { success: r.refundStatus === "REFUND_SUCCESS" };
      },
    };
  }
  if (env.WECHAT_ENABLED === "true") {
    assert(
      env.WECHAT_MCH_ID &&
        env.WECHAT_APP_ID &&
        env.WECHAT_SERIAL &&
        env.WECHAT_PUBLIC_KEY_ID &&
        Buffer.byteLength(env.WECHAT_API_V3_KEY || "") === 32,
      500,
      "Incomplete WeChat merchant configuration",
    );
    const privateKey = readFileSync(
        resolve(config.projectRoot, env.WECHAT_PRIVATE_KEY_PATH),
        "utf8",
      ),
      publicKey = readFileSync(
        resolve(config.projectRoot, env.WECHAT_PUBLIC_KEY_PATH),
        "utf8",
      );
    const call = async (method, path, body) => {
      const payload = body ? JSON.stringify(body) : "",
        timestamp = String(Math.floor(Date.now() / 1000)),
        nonce = randomBytes(16).toString("hex");
      const signature = sign(
        "RSA-SHA256",
        Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${payload}\n`),
        privateKey,
      ).toString("base64");
      const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WECHAT_SERIAL}",signature="${signature}"`;
      const response = await fetch("https://api.mch.weixin.qq.com" + path, {
        method,
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Wechatpay-Serial": env.WECHAT_PUBLIC_KEY_ID,
        },
        body: payload || undefined,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      const raw = await response.text();
      if (!response.ok)
        throw new HttpError(502, "微信支付接口暂不可用，请稍后重试");
      if (raw)
        verifyWechatSignature(
          response.headers,
          raw,
          publicKey,
          env.WECHAT_PUBLIC_KEY_ID,
        );
      return raw ? JSON.parse(raw) : {};
    };
    channels.wechat = {
      label: env.WECHAT_H5_ENABLED === "true" ? "微信支付" : "微信扫码",
      h5: env.WECHAT_H5_ENABLED === "true",
      create: async (order, mobile, context = {}) => {
        const h5 = context.mode === "h5";
        assert(
          !h5 || env.WECHAT_H5_ENABLED === "true",
          400,
          "手机网页支付尚未开放，请使用扫码支付",
        );
        const r = await call(
          "POST",
          h5 ? "/v3/pay/transactions/h5" : "/v3/pay/transactions/native",
          {
            appid: env.WECHAT_APP_ID,
            mchid: env.WECHAT_MCH_ID,
            description: "茉莉陪玩 · " + order.title,
            out_trade_no: order.order_no,
            time_expire: order.expires_at,
            notify_url: httpsCallback("wechat"),
            amount: { total: order.amount_cents, currency: "CNY" },
            ...(h5
              ? {
                  scene_info: {
                    payer_client_ip: context.ip,
                    h5_info: {
                      type: "Wap",
                      app_name: "茉莉陪玩",
                      app_url: config.origin,
                    },
                  },
                }
              : {}),
          },
        );
        if (h5) {
          const target = new URL(r.h5_url);
          assert(
            target.protocol === "https:" && target.hostname === "wx.tenpay.com",
            502,
            "微信支付响应地址无效",
          );
          target.searchParams.set(
            "redirect_url",
            `${config.origin}/orders/${order.id}?payment=return`,
          );
          return { type: "redirect", url: target.toString() };
        }
        assert(
          typeof r.code_url === "string" && r.code_url.startsWith("weixin://"),
          502,
          "微信支付响应无效",
        );
        return { type: "qr", codeUrl: r.code_url };
      },
      verifyNotify: (data, headers, raw) => {
        verifyWechatSignature(
          headers,
          raw,
          publicKey,
          env.WECHAT_PUBLIC_KEY_ID,
        );
        assert(
          data.event_type === "TRANSACTION.SUCCESS",
          400,
          "无效微信支付事件",
        );
        const r = decryptWechat(data.resource, env.WECHAT_API_V3_KEY);
        assert(
          r.mchid === env.WECHAT_MCH_ID &&
            r.appid === env.WECHAT_APP_ID &&
            r.trade_state === "SUCCESS" &&
            r.amount.currency === "CNY",
          400,
          "微信支付商户或交易信息不匹配",
        );
        return {
          channel: "wechat",
          orderNo: r.out_trade_no,
          tradeNo: r.transaction_id,
          amountCents: r.amount.total,
        };
      },
      query: async (order) => {
        const r = await call(
          "GET",
          `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.order_no)}?mchid=${env.WECHAT_MCH_ID}`,
        );
        assert(
          r.mchid === env.WECHAT_MCH_ID && r.appid === env.WECHAT_APP_ID,
          400,
          "微信商户不匹配",
        );
        if (r.trade_state === "SUCCESS")
          assert(r.amount.currency === "CNY", 400, "微信支付币种不匹配");
        return r.trade_state === "SUCCESS"
          ? {
              channel: "wechat",
              orderNo: r.out_trade_no,
              tradeNo: r.transaction_id,
              amountCents: r.amount.total,
            }
          : null;
      },
      refund: async (order) => {
        const r = await call("POST", "/v3/refund/domestic/refunds", {
          transaction_id: order.gateway_trade_no,
          out_refund_no: order.refund_no,
          reason: order.refund_reason.slice(0, 80),
          amount: {
            refund: order.amount_cents,
            total: order.amount_cents,
            currency: "CNY",
          },
        });
        return {
          success: r.status === "SUCCESS",
          processing: r.status === "PROCESSING",
        };
      },
      queryRefund: async (order) => {
        const r = await call(
          "GET",
          `/v3/refund/domestic/refunds/${encodeURIComponent(order.refund_no)}`,
        );
        assert(
          r.mchid === env.WECHAT_MCH_ID &&
            r.out_trade_no === order.order_no &&
            r.amount.refund === order.amount_cents,
          400,
          "退款信息不匹配",
        );
        return {
          success: r.status === "SUCCESS",
          processing: r.status === "PROCESSING",
        };
      },
    };
  }
  return channels;
}
