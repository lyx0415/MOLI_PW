import { loadConfig } from "../lib/config.js";
import { openDatabase, migrate } from "../lib/db.js";
import { id, hashPassword } from "../lib/security.js";
import { now } from "../lib/errors.js";
import { password } from "../lib/validation.js";
export async function seedDemo(db, pass) {
  const hash = await hashPassword(password.parse(pass));
  const people = [
    [
      "晚风",
      "英雄联盟",
      "峡谷大师",
      5800,
      "sage",
      ["温柔指挥", "双排搭子"],
      "不急着赢下每一局，先一起享受游戏。擅长辅助与中路，耐心沟通，陪你找到舒服的节奏。",
    ],
    [
      "小满",
      "王者荣耀",
      "荣耀王者",
      4800,
      "peach",
      ["欢乐上分", "辅助专精"],
      "在峡谷里遇见快乐。熟悉团队配合和英雄搭配，欢迎新手与回归玩家，一起练习一起进步。",
    ],
    [
      "阿序",
      "无畏契约",
      "超凡入圣",
      6800,
      "lavender",
      ["战术复盘", "稳定沟通"],
      "从准星到配合，认真对待每一次开黑。可以一起练习地图思路，复盘对局，放松也能很有收获。",
    ],
    [
      "青禾",
      "和平精英",
      "超级王牌",
      3800,
      "sky",
      ["轻松娱乐", "耐心陪练"],
      "一起探索海岛，分享游戏里的小惊喜。节奏轻松，沟通清楚，适合希望找到稳定游戏搭子的你。",
    ],
    [
      "橘子",
      "永劫无间",
      "无间修罗",
      5600,
      "sand",
      ["动作练习", "轻松开黑"],
      "喜欢漂亮的操作，也喜欢有趣的队友。可练习基础连招和团战配合，把陌生地图变成熟悉风景。",
    ],
    [
      "南星",
      "英雄联盟",
      "璀璨钻石",
      4200,
      "mint",
      ["新手友好", "晚间在线"],
      "从第一场对局开始，慢慢建立默契。支持娱乐与基础陪练，认真反馈，给每次游戏留一点好心情。",
    ],
  ];
  await db.tx(async (tx) => {
    const create = async (address, name, role) => {
      let u = await tx.one("SELECT id FROM moli_users WHERE email=?", [
        address,
      ]);
      if (u) return u.id;
      const userId = id();
      await tx.run(
        "INSERT INTO moli_users (id,email,name,password_hash,role,state,email_verified,terms_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [userId, address, name, hash, role, "active", 1, "2026-10", now()],
      );
      return userId;
    };
    await create("customer@demo.moli.test", "体验客户", "customer");
    await create("admin@demo.moli.test", "体验运营", "admin");
    for (let i = 0; i < people.length; i++) {
      const [name, game, skill, rate, theme, tags, bio] = people[i];
      const userId = await create(
        `provider${i + 1}@demo.moli.test`,
        name,
        "provider",
      );
      if (
        await tx.one("SELECT id FROM moli_providers WHERE user_id=?", [userId])
      )
        continue;
      const p = id();
      await tx.run(
        "INSERT INTO moli_providers (id,user_id,nickname,bio,city,theme,tags_json,verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          p,
          userId,
          name,
          bio,
          ["杭州", "成都", "上海", "广州", "深圳", "南京"][i],
          theme,
          JSON.stringify(tags),
          now(),
          now(),
        ],
      );
      await tx.run(
        "INSERT INTO moli_services (id,provider_id,game,title,skill,rate_cents,description,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [id(), p, game, game + " · 一起开黑", skill, rate, bio, now()],
      );
      for (let d = 0; d < 7; d++)
        await tx.run(
          "INSERT INTO moli_availability (id,provider_id,weekday,start_minute,end_minute) VALUES (?,?,?,?,?)",
          [id(), p, d, 0, 1440],
        );
    }
    if (!(await tx.one("SELECT id FROM moli_announcements LIMIT 1")))
      await tx.run(
        "INSERT INTO moli_announcements (id,title,content,created_at) VALUES (?,?,?,?)",
        [
          id(),
          "欢迎来到茉莉的游戏小站",
          "选择喜欢的游戏与陪玩，预约你的下一段轻松时光。遇到问题，可在帮助中心提交工单。",
          now(),
        ],
      );
  });
}
if (process.argv[1] === import.meta.filename) {
  const config = loadConfig();
  if (config.production || process.env.DEMO_MODE !== "true")
    throw new Error("Demo seed requires development and DEMO_MODE=true");
  const db = await openDatabase(config);
  try {
    await migrate(db);
    await seedDemo(db, process.env.DEMO_PASSWORD);
    console.log(
      "Demo accounts created. All demo users use DEMO_PASSWORD. Never use this database in production.",
    );
  } finally {
    await db.close();
  }
}
