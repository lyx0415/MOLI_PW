import { reactive } from "vue";
import { api } from "./api.js";
export const site = reactive({
  games: [],
  gameCatalog: [],
  booking: {
    enabled: false,
    timeZone: "Asia/Shanghai",
    minMinutes: 30,
    maxMinutes: 240,
    stepMinutes: 30,
  },
  categories: [],
  counts: { providers: 0, completed: 0 },
  announcements: [],
  demo: false,
  emailVerificationRequired: false,
  supportEmail: "",
  operator: "",
  icp: "",
  loaded: false,
  error: false,
});
export async function loadSite() {
  try {
    Object.assign(site, await api("/site", { quiet: true }), {
      loaded: true,
      error: false,
    });
  } catch {
    site.error = true;
  }
}
