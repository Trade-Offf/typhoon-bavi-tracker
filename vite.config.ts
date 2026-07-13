import { defineConfig, type Plugin } from "vite";
import { normalizeZj } from "./worker/normalize";

/**
 * 开发服务器中间件：拦截 /api/typhoon/:tfid 请求，从上游获取原始数据后
 * 走与 Cloudflare Worker 相同的归一化逻辑，确保前端拿到一致的 TyphoonData 结构。
 * （生产环境由 Worker 完成归一化，不需要此插件）
 */
function typhoonDevProxy(): Plugin {
  return {
    name: "typhoon-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/typhoon\/(\w+)$/);
        if (!m) return next();

        const tfid = m[1];
        try {
          const upstream = await fetch(
            `https://typhoon.slt.zj.gov.cn/Api/TyphoonInfo/${tfid}`,
            { headers: { referer: "https://typhoon.slt.zj.gov.cn/wap.html" } },
          );
          if (!upstream.ok) throw new Error(`上游 HTTP ${upstream.status}`);
          const raw = await upstream.json();
          const data = normalizeZj(raw);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=300");
          res.end(JSON.stringify(data));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
        },
      },
    },
  },
  plugins: [typhoonDevProxy()],
});
