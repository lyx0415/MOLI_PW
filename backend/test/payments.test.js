import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import {
  verifyWechatSignature,
  decryptWechat,
  parseMoney,
  createGateways,
} from "../payments/gateways.js";
import { loadConfig } from "../lib/config.js";
import { verify as verifySignature } from "node:crypto";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
test("Wechat uses the exact raw body, timestamp and pinned public key ID", () => {
  const raw = '{ "amount": 100 }',
    timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = "fixtureNonce",
    serial = "PUB_KEY_ID_TEST";
  const headers = {
    "wechatpay-timestamp": timestamp,
    "wechatpay-nonce": nonce,
    "wechatpay-serial": serial,
    "wechatpay-signature": sign(
      "RSA-SHA256",
      Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
      keys.privateKey,
    ).toString("base64"),
  };
  verifyWechatSignature(headers, raw, keys.publicKey, serial);
  assert.throws(() =>
    verifyWechatSignature(headers, '{"amount":100}', keys.publicKey, serial),
  );
  assert.throws(() =>
    verifyWechatSignature(
      { ...headers, "wechatpay-serial": "WRONG" },
      raw,
      keys.publicKey,
      serial,
    ),
  );
  assert.throws(() =>
    verifyWechatSignature(
      headers,
      raw,
      keys.publicKey,
      serial,
      Date.now() + 600000,
    ),
  );
  assert.throws(() =>
    verifyWechatSignature(
      { ...headers, "wechatpay-signature": "WECHATPAY/SIGNTEST/invalid" },
      raw,
      keys.publicKey,
      serial,
    ),
  );
});
test("Wechat authenticated decryption rejects tampered ciphertext", () => {
  const key = randomBytes(32).toString("base64").slice(0, 32),
    nonce = "012345678901",
    aad = "transaction";
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(key),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ amount: { total: 100 } })),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const resource = {
    algorithm: "AEAD_AES_256_GCM",
    nonce,
    associated_data: aad,
    ciphertext: encrypted.toString("base64"),
  };
  assert.equal(decryptWechat(resource, key).amount.total, 100);
  encrypted[0] ^= 1;
  assert.throws(() =>
    decryptWechat(
      { ...resource, ciphertext: encrypted.toString("base64") },
      key,
    ),
  );
});
test("currency conversion uses exact integer cents and rejects malformed inputs", () => {
  assert.equal(parseMoney("0.01"), 1);
  assert.equal(parseMoney("12.3"), 1230);
  assert.equal(parseMoney("58.00"), 5800);
  for (const value of ["NaN", "0", "-1", "1.234", "1e3", "9007199254740992"])
    assert.throws(() => parseMoney(value));
});
test("real Alipay SDK verifies RSA2 callbacks, rejects merchant mismatch and generates server-priced website links", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "moli-payment-qa-"));
  t.after(() => {
    assert.equal(dirname(dir), tmpdir());
    assert.ok(basename(dir).startsWith("moli-payment-qa-"));
    return rm(dir, { recursive: true, force: true });
  });
  const merchant = generateKeyPairSync("rsa", { modulusLength: 2048 }),
    platform = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(
    join(dir, "private.pem"),
    merchant.privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  await writeFile(
    join(dir, "public.pem"),
    platform.publicKey.export({ type: "spki", format: "pem" }),
  );
  const gateway = createGateways(
    loadConfig({
      PUBLIC_ORIGIN: "https://moli.test",
      ALIPAY_ENABLED: "true",
      ALIPAY_APP_ID: "app-test",
      ALIPAY_SELLER_ID: "seller-test",
      ALIPAY_PRIVATE_KEY_PATH: join(dir, "private.pem"),
      ALIPAY_PUBLIC_KEY_PATH: join(dir, "public.pem"),
    }),
  ).alipay;
  const payload = {
    app_id: "app-test",
    seller_id: "seller-test",
    trade_status: "TRADE_SUCCESS",
    out_trade_no: "MLTEST",
    trade_no: "TXTEST",
    total_amount: "58.00",
  };
  const signData = (data) => {
    const raw = Object.keys(data)
      .sort()
      .map((key) => key + "=" + data[key])
      .join("&");
    return {
      ...data,
      sign_type: "RSA2",
      sign: sign("RSA-SHA256", Buffer.from(raw), platform.privateKey).toString(
        "base64",
      ),
    };
  };
  assert.equal(gateway.verifyNotify(signData(payload)).amountCents, 5800);
  assert.throws(() =>
    gateway.verifyNotify({ ...signData(payload), total_amount: "0.01" }),
  );
  assert.throws(() =>
    gateway.verifyNotify(signData({ ...payload, seller_id: "wrong-seller" })),
  );
  const r = await gateway.create({
    id: "id-test",
    order_no: "MLTEST",
    title: "服务",
    amount_cents: 5800,
  });
  const url = new URL(r.url);
  assert.equal(url.hostname, "openapi.alipay.com");
  assert.equal(
    JSON.parse(url.searchParams.get("biz_content")).total_amount,
    "58.00",
  );
  assert.equal(
    url.searchParams.get("notify_url"),
    "https://moli.test/api/payments/notify/alipay",
  );
});
test("Wechat Native and H5 requests sign server-priced payloads and verify signed gateway responses", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "moli-payment-qa-"));
  t.after(() => {
    assert.equal(dirname(dir), tmpdir());
    assert.ok(basename(dir).startsWith("moli-payment-qa-"));
    return rm(dir, { recursive: true, force: true });
  });
  const merchant = generateKeyPairSync("rsa", { modulusLength: 2048 }),
    platform = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(
    join(dir, "private.pem"),
    merchant.privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  await writeFile(
    join(dir, "public.pem"),
    platform.publicKey.export({ type: "spki", format: "pem" }),
  );
  const env = {
    PUBLIC_ORIGIN: "https://moli.test",
    WECHAT_ENABLED: "true",
    WECHAT_H5_ENABLED: "true",
    WECHAT_APP_ID: "wx-test",
    WECHAT_MCH_ID: "merchant-test",
    WECHAT_SERIAL: "SERIAL",
    WECHAT_PUBLIC_KEY_ID: "PUB_KEY_ID_TEST",
    WECHAT_API_V3_KEY: "12345678901234567890123456789012",
    WECHAT_PRIVATE_KEY_PATH: join(dir, "private.pem"),
    WECHAT_PUBLIC_KEY_PATH: join(dir, "public.pem"),
  };
  const gateway = createGateways(loadConfig(env)).wechat,
    requests = [];
  let tamper = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(url).pathname,
      auth = options.headers.Authorization,
      get = (key) => auth.match(new RegExp(key + '="([^"]+)"'))[1];
    assert.equal(options.redirect, "error");
    assert.ok(
      verifySignature(
        "RSA-SHA256",
        Buffer.from(
          `${options.method}\n${path}\n${get("timestamp")}\n${get("nonce_str")}\n${options.body}\n`,
        ),
        merchant.publicKey,
        Buffer.from(get("signature"), "base64"),
      ),
    );
    requests.push({ path, body: JSON.parse(options.body) });
    const raw = JSON.stringify(
        path.endsWith("/h5")
          ? { h5_url: "https://wx.tenpay.com/pay?test=1" }
          : { code_url: "weixin://pay.test" },
      ),
      timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = "response-nonce",
      signature = sign(
        "RSA-SHA256",
        Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
        platform.privateKey,
      ).toString("base64");
    return new Response(raw, {
      status: 200,
      headers: {
        "Wechatpay-Serial": "PUB_KEY_ID_TEST",
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Signature": tamper ? "bad-signature" : signature,
      },
    });
  });
  const order = {
    id: "order-test",
    order_no: "MLTEST",
    title: "Test service",
    amount_cents: 5800,
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };
  const qr = await gateway.create(order, false, { mode: "native" });
  assert.equal(qr.type, "qr");
  assert.equal(requests[0].body.amount.total, 5800);
  const h5 = await gateway.create(order, true, {
    mode: "h5",
    ip: "203.0.113.42",
  });
  assert.equal(
    new URL(h5.url).searchParams.get("redirect_url"),
    "https://moli.test/orders/order-test?payment=return",
  );
  assert.equal(requests[1].body.scene_info.payer_client_ip, "203.0.113.42");
  tamper = true;
  await assert.rejects(gateway.create(order, false, { mode: "native" }));
});
