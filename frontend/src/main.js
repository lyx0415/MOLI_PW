import { createApp } from "vue";
import App from "./App.vue";
import router from "./router/index.js";
import "./style.css";
import "./design.css";
import "./marketplace.css";
import { initAuth } from "./lib/api.js";
await initAuth();
createApp(App).use(router).mount("#app");
