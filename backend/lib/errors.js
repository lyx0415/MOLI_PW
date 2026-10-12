export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function assert(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
export const ok = (res, data = null, message = "操作成功", status = 200) =>
  res.status(status).json({ code: status, message, data });
export const now = () => new Date().toISOString();
