import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages のリポジトリ名に合わせて変更してください
// 例: https://yourname.github.io/quest-study/ の場合 → "/quest-study/"
const BASE = process.env.VITE_BASE_PATH || "/quest-study/";

export default defineConfig({
  plugins: [react()],
  base: BASE,
});
