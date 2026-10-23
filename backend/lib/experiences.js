export const categories = [
  {
    id: "esports",
    name: "线上电竞",
    mode: "online",
    tagline: "隔着屏幕，也能默契开局",
    description: "组队上分、娱乐开黑、游戏技巧交流，按自己的节奏找到合拍搭子。",
    examples: ["双人开黑", "新手入门", "战术配合"],
    note: "使用本人游戏账号，预约前确认游戏区服与语音方式。",
  },
  {
    id: "offline-gaming",
    name: "线下电竞",
    mode: "offline",
    tagline: "坐在一起，把配合打出来",
    description:
      "约在公开营业的电竞场馆，一起组队、交流技巧，享受面对面开黑的乐趣。",
    examples: ["电竞馆组队", "同城开黑", "新手体验"],
    note: "场馆机位费另行核对，提前确认设备与游戏区服。",
  },
  {
    id: "fitness",
    name: "健身陪练",
    mode: "offline",
    tagline: "让每一次坚持，都有人同行",
    description: "健身房搭伴、轻运动与训练打卡，寻找节奏相近的运动伙伴。",
    examples: ["健身房搭伴", "慢跑打卡", "基础体能"],
    note: "陪练不替代医疗建议或专业康复；需要专业教学时请先核实资质，量力而行。",
  },
  {
    id: "ktv",
    name: "KTV欢唱",
    mode: "offline",
    tagline: "喜欢的歌，一起唱才尽兴",
    description:
      "在公开营业的KTV相聚，合唱、练歌、分享歌单，让聚会多一点默契。",
    examples: ["双人合唱", "聚会搭子", "歌单交流"],
    note: "提前确认包厢、人数与费用；仅提供唱歌陪伴服务。",
  },
  {
    id: "boardgames",
    name: "桌游搭子",
    mode: "offline",
    tagline: "一张桌子，开启新的故事",
    description:
      "从轻松派对游戏到策略桌游，在桌游门店寻找愿意一起思考、一起大笑的伙伴。",
    examples: ["规则入门", "策略对局", "派对桌游"],
    note: "确认游戏名称、参与人数、门店规则及场地费用。",
  },
  {
    id: "chess",
    name: "棋牌切磋",
    mode: "offline",
    tagline: "落子之间，遇见同好",
    description: "围棋、象棋与休闲牌类交流，享受思考和友好切磋的过程。",
    examples: ["象棋切磋", "围棋交流", "休闲牌局"],
    note: "仅限休闲娱乐与技巧交流，禁止赌博、现金输赢及变相下注。",
  },
];
export const categoryFor = (id) => categories.find((c) => c.id === id);
export const publicDetailColumns =
  "COALESCE(d.category,'esports') AS category,COALESCE(d.city,'') AS service_city,COALESCE(d.venue,'') AS venue,COALESCE(d.fee_note,'') AS fee_note,d.revision";
export const detailColumns =
  "COALESCE(d.category,'esports') AS category,COALESCE(d.city,'') AS service_city,COALESCE(d.venue,'') AS venue,COALESCE(d.fee_note,'') AS fee_note,COALESCE(d.review_status,'approved') AS review_status,COALESCE(d.review_reason,'') AS review_reason,d.revision,d.requested_active";
export const published =
  "s.active=1 AND (d.service_id IS NULL OR d.review_status='approved')";
export function experience(row) {
  return {
    category: row.category || "esports",
    mode: categoryFor(row.category || "esports")?.mode || "online",
    city: row.service_city || "",
    venue: row.venue || "",
    feeNote: row.fee_note || "",
    description: row.description || "",
  };
}
