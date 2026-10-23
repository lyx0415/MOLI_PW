import { z } from "zod";
import { categories, categoryFor } from "./experiences.js";
export const games = [
  "英雄联盟",
  "王者荣耀",
  "无畏契约",
  "和平精英",
  "永劫无间",
  "其他游戏",
];
export const text = (max, min = 1) => z.string().trim().min(min).max(max);
export const email = z
  .email()
  .max(254)
  .transform((x) => x.toLowerCase());
export const password = z
  .string()
  .min(10)
  .max(128)
  .refine((s) => /[a-zA-Z]/.test(s) && /[0-9]/.test(s), "密码须包含字母和数字");
const checkExperience = (data, ctx) => {
  if (data.category === "esports" && !games.includes(data.game))
    ctx.addIssue({
      code: "custom",
      path: ["game"],
      message: "请选择支持的游戏",
    });
  if (categoryFor(data.category).mode === "offline")
    for (const key of ["city", "venue", "feeNote"])
      if (!data[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "线下服务须填写城市、公开营业场所和费用说明",
        });
};
export const applicationSchema = z
  .object({
    nickname: text(30),
    bio: text(1000, 20),
    city: text(50, 0),
    contact: text(120),
    category: z.enum(categories.map((c) => c.id)).default("esports"),
    venue: text(200, 0).default(""),
    feeNote: text(500, 0).default(""),
    game: text(50),
    skill: text(60),
    rateCents: z.number().int().min(100).max(200000),
    tags: z.array(text(15)).max(5),
    adult: z.literal(true),
    terms: z.literal(true),
  })
  .superRefine(checkExperience);
export const serviceSchema = z
  .object({
    category: z.enum(categories.map((c) => c.id)).default("esports"),
    city: text(50, 0).default(""),
    venue: text(200, 0).default(""),
    feeNote: text(500, 0).default(""),
    game: text(50),
    title: text(80),
    skill: text(60),
    rateCents: z.number().int().min(100).max(200000),
    description: text(1000, 10),
    active: z.boolean(),
  })
  .superRefine(checkExperience);
export const scheduleSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    }),
  )
  .max(28)
  .superRefine((items, ctx) => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].startMinute >= items[i].endMinute)
        ctx.addIssue({ code: "custom", message: "结束时间必须晚于开始时间" });
      for (let j = 0; j < i; j++)
        if (
          items[i].weekday === items[j].weekday &&
          items[i].startMinute < items[j].endMinute &&
          items[i].endMinute > items[j].startMinute
        )
          ctx.addIssue({ code: "custom", message: "可预约时间段不能重叠" });
    }
  });
export const pagination = (query) => {
  const integer = (value, fallback, maximum) => {
    const number =
      typeof value === "string" || typeof value === "number"
        ? Number(value)
        : NaN;
    return Number.isFinite(number) && number > 0
      ? Math.max(1, Math.min(maximum, Math.trunc(number)))
      : fallback;
  };
  return {
    page: integer(query.page, 1, 10000),
    size: integer(query.size, 12, 50),
  };
};
