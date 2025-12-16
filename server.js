const express = require("express");
const cron = require("node-cron");
const cors = require("cors");
const https = require("https");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// 确保 data 目录存在
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ========== SQLite 数据库 ==========
const DB_PATH = path.join(dataDir, "prices.db");
const CONFIG_PATH = path.join(dataDir, "config.json");

let db = null;
let cronJob = null;

// 默认配置
const DEFAULT_CONFIG = {
  accessToken: "", // 请在设置页面配置你的 Access Token
  collectInterval: 10,
  dataRetentionDays: 365,
  apiHost: "steampy.com",
  apiPath: "/xboot/steamKeySale/listSale",
  // PushMe 推送配置
  pushme: {
    enabled: false,
    pushKeys: [], // 支持多个 Push Key，同时向多个设备推送
    // 推送冷却时间（分钟），同一游戏触发提醒后，在此时间内不再重复推送
    cooldownMinutes: 60,
    // 史低提醒（价格达到/低于游戏设定的史低价格时推送）
    historyLowAlert: {
      enabled: false,
    },
    // 每日报告
    dailyReport: {
      enabled: false,
      time: "20:00", // 每日报告时间
    },
    // 采集异常提醒
    errorAlert: {
      enabled: true,
    },
  },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return {
        ...DEFAULT_CONFIG,
        ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")),
      };
    }
  } catch (e) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

let config = loadConfig();

// 推送冷却记录 { gameId: lastPushTime }
const pushCooldowns = {};

function saveDatabase() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  try {
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }

  db.run(
    `CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, name TEXT, history_low_price REAL DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS price_records (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, min_price REAL NOT NULL, avg_price REAL, max_price REAL, stock_count INTEGER, seller_count INTEGER, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_price_game_time ON price_records(game_id, recorded_at)`
  );

  // 数据库迁移：为现有 games 表添加 history_low_price 字段
  try {
    db.run(`ALTER TABLE games ADD COLUMN history_low_price REAL DEFAULT NULL`);
  } catch (e) {
    // 字段已存在，忽略错误
  }
  // 数据库迁移：为 games 表添加推送开关字段
  try {
    db.run(
      `ALTER TABLE games ADD COLUMN push_enabled INTEGER DEFAULT 1`
    );
  } catch (e) {}

  const games = db.exec("SELECT COUNT(*) FROM games");
  if (games[0]?.values[0][0] === 0) {
    db.run("INSERT INTO games (id, name) VALUES (?, ?)", [
      "461759890218553344",
      "默认游戏",
    ]);
  }

  saveDatabase();
}

function cleanOldData() {
  const cutoff = new Date(
    Date.now() - config.dataRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  db.run("DELETE FROM price_records WHERE recorded_at < ?", [cutoff]);
  saveDatabase();
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ========== PushMe 推送服务 ==========

async function sendPushMe(title, content, pushKeysOverride) {
  // 使用覆盖的 pushKeys（用于测试无需先保存设置）或全局配置
  let pushKeys = Array.isArray(pushKeysOverride)
    ? pushKeysOverride.filter((k) => k && !k.includes("*"))
    : config.pushme?.pushKeys || [];
  // 兼容旧配置：如果有单个 pushKey，也加入列表（如果未被屏蔽）
  if (config.pushme?.pushKey && !config.pushme.pushKey.includes("*") && !pushKeys.includes(config.pushme.pushKey)) {
    pushKeys.push(config.pushme.pushKey);
  }

  console.log(`[PushMe] PushMe 启用状态: ${config.pushme?.enabled}`);
  console.log(`[PushMe] 有效 Push Keys 数量: ${pushKeys.length}`);

  if (!config.pushme?.enabled) {
    console.log('[PushMe] 失败: PushMe 功能未启用');
    return { success: false, reason: "PushMe功能未启用。请在设置中启用PushMe并保存配置。" };
  }

  if (pushKeys.length === 0) {
    console.log('[PushMe] 失败: 没有有效的 Push Key');
    return { success: false, reason: "未配置有效的Push Key。请在设置中添加至少一个Push Key并保存配置。" };
  }

  console.log(`[PushMe] 发送推送: ${title} (共 ${pushKeys.length} 个接收者)`);

  const results = [];
  for (const pushKey of pushKeys) {
    const params = new URLSearchParams({
      push_key: pushKey,
      title: title,
      content: content,
    });

    const url = `https://push.i-i.me/?${params.toString()}`;

    try {
      const response = await fetch(url, { method: "GET", timeout: 15000 });
      const data = await response.text();
      const success = response.ok || data.includes("success");

      console.log(
        `[PushMe] ${pushKey.slice(0, 6)}*** - ${success ? "成功" : "失败"} (${
          response.status
        })`
      );
      results.push({
        pushKey: pushKey.slice(0, 6) + "***",
        success,
        statusCode: response.status,
      });
    } catch (e) {
      console.error(`[PushMe] ${pushKey.slice(0, 6)}*** 推送失败:`, e.message);
      results.push({
        pushKey: pushKey.slice(0, 6) + "***",
        success: false,
        error: e.message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return {
    success: successCount > 0,
    total: pushKeys.length,
    successCount,
    results,
  };
}

// 价格提醒检查（综合所有规则）
async function checkPriceAlert(gameId, gameName, minPrice) {
  if (!config.pushme?.enabled) return;

  const pushme = config.pushme;

  // 检查冷却时间
  const cooldownMs = (pushme.cooldownMinutes || 60) * 60 * 1000;
  const lastPushTime = pushCooldowns[gameId] || 0;
  const now = Date.now();
  if (now - lastPushTime < cooldownMs) {
    console.log(`[PushMe] ${gameName} 在冷却中，跳过推送`);
    return;
  }

  const alerts = [];

  // 读取游戏级推送设置
  const gameRow = db.exec(
    "SELECT history_low_price, push_enabled FROM games WHERE id = ?",
    [gameId]
  );
  const gameVals = gameRow[0]?.values[0] || [];
  const historyLow = gameVals[0];
  const gamePushEnabled = gameVals[1] !== 0; // default true

  // 如果游戏级推送被关闭，则跳过
  if (gamePushEnabled === false) return;

  // 史低提醒（保留原有逻辑，使用游戏级史低）
  if (pushme.historyLowAlert?.enabled) {
    if (historyLow !== null && minPrice <= historyLow) {
      alerts.push(`🏆 达到/低于史低 ¥${historyLow}`);
    }
  }

  // 发送推送
  if (alerts.length > 0) {
    const content = `**${gameName}** 当前最低价 **¥${minPrice.toFixed(
      2
    )}**\n\n${alerts.join("\n")}\n\n⏰ ${new Date().toLocaleString()}`;
    await sendPushMe(`🔔 价格提醒: ${gameName}`, content);
    // 记录推送时间
    pushCooldowns[gameId] = now;
  }
}

// 采集异常提醒
async function sendErrorAlert(gameId, error) {
  if (!config.pushme?.errorAlert?.enabled) return;

  const game = db.exec("SELECT name FROM games WHERE id = ?", [gameId]);
  const gameName = game[0]?.values[0]?.[0] || gameId;

  await sendPushMe(
    `⚠️ 采集异常`,
    `**${gameName}** 采集失败\n\n错误: ${error}\n\n⏰ ${new Date().toLocaleString()}`
  );
}

// 每日报告
async function sendDailyReport() {
  console.log('[每日报告] 开始生成每日报告');

  if (!config.pushme?.dailyReport?.enabled) {
    console.log('[每日报告] 失败: 每日报告功能未启用');
    return { success: false, reason: "每日报告功能未启用" };
  }

  if (!config.pushme?.enabled) {
    console.log('[每日报告] 失败: PushMe 功能未启用');
    return { success: false, reason: "PushMe功能未启用" };
  }

  const games = db.exec("SELECT id, name FROM games");
  if (!games[0]?.values?.length) {
    console.log('[每日报告] 失败: 没有监控的游戏');
    return { success: false, reason: "没有监控的游戏" };
  }

  console.log(`[每日报告] 正在为 ${games[0].values.length} 个游戏生成报告`);

  let report = "## 📊 每日价格报告\n\n";
  let gameCount = 0;

  for (const [gameId, gameName] of games[0].values) {
    const stats = db.exec(
      `SELECT MIN(min_price), MAX(min_price), AVG(min_price) FROM price_records WHERE game_id = ? AND recorded_at > datetime('now', '-1 day')`,
      [gameId]
    );
    const latest = db.exec(
      `SELECT min_price FROM price_records WHERE game_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [gameId]
    );

    if (stats[0]?.values[0]?.[0] !== null) {
      const [min, max, avg] = stats[0].values[0];
      const current = latest[0]?.values[0]?.[0] || 0;
      report += `### ${gameName}\n`;
      report += `- 当前: ¥${current.toFixed(2)}\n`;
      report += `- 今日最低: ¥${min.toFixed(2)}\n`;
      report += `- 今日最高: ¥${max.toFixed(2)}\n`;
      report += `- 今日均价: ¥${avg.toFixed(2)}\n\n`;
      gameCount++;
    }
  }

  if (gameCount === 0) {
    console.log('[每日报告] 失败: 过去24小时内没有价格数据');
    return { success: false, reason: "过去24小时内没有价格数据" };
  }

  report += `---\n⏰ ${new Date().toLocaleString()}`;

  console.log(`[每日报告] 报告已生成，包含 ${gameCount} 个游戏的数据`);
  const result = await sendPushMe("📊 Steam Key 每日报告", report);

  if (result.success) {
    console.log('[每日报告] 发送成功');
  } else {
    console.log(`[每日报告] 发送失败: ${result.reason}`);
  }

  return result;
}

let dailyReportJob = null;
function startDailyReportJob() {
  if (dailyReportJob) dailyReportJob.stop();

  if (config.pushme?.dailyReport?.enabled && config.pushme?.dailyReport?.time) {
    const [hour, minute] = config.pushme.dailyReport.time.split(":");
    dailyReportJob = cron.schedule(
      `${minute || 0} ${hour || 20} * * *`,
      sendDailyReport,
      { timezone: "Asia/Shanghai" }
    );
    console.log(`每日报告: ${config.pushme.dailyReport.time}`);
  }
}

function fetchPriceData(gameId) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      gameId,
      pageNumber: "1",
      pageSize: "100",
      sort: "keyPrice",
      order: "asc",
    });
    const req = https.request(
      {
        hostname: config.apiHost,
        path: `${config.apiPath}?${params}`,
        method: "GET",
        headers: { "User-Agent": "APPAPK", accessToken: config.accessToken },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

async function collectAndStorePrices(gameId) {
  try {
    console.log(`[${new Date().toLocaleString()}] 采集 ${gameId}...`);
    const response = await fetchPriceData(gameId);

    if (!response.success || !response.result?.content?.length) return null;

    const prices = response.result.content.map((i) => i.keyPrice);
    const stocks = response.result.content.map((i) => i.stock);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stockCount = stocks.reduce((a, b) => a + b, 0);
    const sellerCount = response.result.content.length;

    db.run(
      `INSERT INTO price_records (game_id, min_price, avg_price, max_price, stock_count, seller_count, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        minPrice,
        avgPrice,
        maxPrice,
        stockCount,
        sellerCount,
        new Date().toISOString(),
      ]
    );
    saveDatabase();

    // 获取游戏名称并检查价格提醒
    const game = db.exec("SELECT name FROM games WHERE id = ?", [gameId]);
    const gameName = game[0]?.values[0]?.[0] || gameId;
    await checkPriceAlert(gameId, gameName, minPrice);

    console.log(`采集完成: ¥${minPrice}`);
    return { minPrice, avgPrice, maxPrice, stockCount, sellerCount };
  } catch (e) {
    console.error("采集失败:", e.message);
    // 发送采集异常提醒
    await sendErrorAlert(gameId, e.message);
    return null;
  }
}

async function collectAllPrices() {
  const games = db.exec("SELECT id FROM games");
  if (games[0]) {
    for (const row of games[0].values) await collectAndStorePrices(row[0]);
  }
}

function startCronJob() {
  if (cronJob) cronJob.stop();
  cronJob = cron.schedule(
    `*/${config.collectInterval} * * * *`,
    collectAllPrices,
    { timezone: "Asia/Shanghai" }
  );
  console.log(`定时任务: 每 ${config.collectInterval} 分钟`);
}

// ========== API ==========
app.get("/api/games", (req, res) => {
  const r = db.exec(
    "SELECT id, name, history_low_price, push_enabled, created_at FROM games"
  );
  res.json(
    r[0]?.values.map((row) => ({
      id: row[0],
      name: row[1],
      history_low_price: row[2],
      push_enabled: row[3] === 1,
      created_at: row[4],
    })) || []
  );
});

// 更新游戏的推送设置（每个游戏的推送开关）
app.put('/api/games/:id/push-settings', (req, res) => {
  const { push_enabled } = req.body;
  const enabled = push_enabled ? 1 : 0;

  db.run(
    'UPDATE games SET push_enabled = ? WHERE id = ?',
    [enabled, req.params.id]
  );
  saveDatabase();
  res.json({ success: true });
});

app.post("/api/games", (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.status(400).json({ error: "游戏ID不能为空" });
  db.run("INSERT OR REPLACE INTO games (id, name) VALUES (?, ?)", [
    id,
    name || "未命名",
  ]);
  saveDatabase();
  collectAndStorePrices(id);
  res.json({ success: true });
});

app.delete("/api/games/:id", (req, res) => {
  db.run("DELETE FROM price_records WHERE game_id = ?", [req.params.id]);
  db.run("DELETE FROM games WHERE id = ?", [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

// 更新游戏史低价格
app.put("/api/games/:id/history-low", (req, res) => {
  const { history_low_price } = req.body;
  const price =
    history_low_price === null || history_low_price === ""
      ? null
      : parseFloat(history_low_price);
  db.run("UPDATE games SET history_low_price = ? WHERE id = ?", [
    price,
    req.params.id,
  ]);
  saveDatabase();
  res.json({ success: true });
});

app.get("/api/prices/:gameId", (req, res) => {
  const days =
    { day: 1, week: 7, month: 30, quarter: 90, year: 365, all: 9999 }[
      req.query.period
    ] || 1;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const r = db.exec(
    `SELECT id, game_id, min_price, avg_price, max_price, stock_count, seller_count, recorded_at FROM price_records WHERE game_id = ? AND recorded_at > ? ORDER BY recorded_at`,
    [req.params.gameId, cutoff]
  );
  res.json(
    r[0]?.values.map((row) => ({
      id: row[0],
      game_id: row[1],
      min_price: row[2],
      avg_price: row[3],
      max_price: row[4],
      stock_count: row[5],
      seller_count: row[6],
      recorded_at: row[7],
    })) || []
  );
});

app.get("/api/stats/:gameId", (req, res) => {
  const days =
    { day: 1, week: 7, month: 30, quarter: 90, year: 365 }[req.query.period] ||
    1;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const sr = db.exec(
    `SELECT MIN(min_price), MAX(min_price), AVG(min_price), AVG(avg_price), COUNT(*), MIN(recorded_at), MAX(recorded_at) FROM price_records WHERE game_id = ? AND recorded_at > ?`,
    [req.params.gameId, cutoff]
  );
  const lr = db.exec(
    `SELECT * FROM price_records WHERE game_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    [req.params.gameId]
  );

  const s = sr[0]?.values[0];
  const l = lr[0]?.values[0];

  res.json({
    stats:
      s?.[0] !== null
        ? {
            lowest_price: s[0],
            highest_min_price: s[1],
            avg_min_price: s[2],
            avg_price: s[3],
            record_count: s[4],
            first_record: s[5],
            last_record: s[6],
          }
        : null,
    latest: l
      ? {
          min_price: l[2],
          avg_price: l[3],
          max_price: l[4],
          stock_count: l[5],
          seller_count: l[6],
          recorded_at: l[7],
        }
      : null,
  });
});

app.get("/api/analysis/:gameId", (req, res) => {
  const gid = req.params.gameId;
  const map = (r, cols) =>
    r[0]?.values.map((row) =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    ) || [];

  const hourly = db.exec(
    `SELECT strftime('%Y-%m-%d %H:00', recorded_at) as h, AVG(min_price), MIN(min_price), MAX(min_price), AVG(seller_count) FROM price_records WHERE game_id = ? AND recorded_at > datetime('now', '-1 day') GROUP BY h ORDER BY h`,
    [gid]
  );
  const daily = db.exec(
    `SELECT date(recorded_at) as d, AVG(min_price), MIN(min_price), MAX(min_price), AVG(seller_count), AVG(stock_count) FROM price_records WHERE game_id = ? AND recorded_at > datetime('now', '-30 days') GROUP BY d ORDER BY d`,
    [gid]
  );
  const weekly = db.exec(
    `SELECT strftime('%Y-W%W', recorded_at) as w, AVG(min_price), MIN(min_price), MAX(min_price), AVG(seller_count) FROM price_records WHERE game_id = ? AND recorded_at > datetime('now', '-84 days') GROUP BY w ORDER BY w`,
    [gid]
  );
  const monthly = db.exec(
    `SELECT strftime('%Y-%m', recorded_at) as m, AVG(min_price), MIN(min_price), MAX(min_price), AVG(seller_count) FROM price_records WHERE game_id = ? AND recorded_at > datetime('now', '-365 days') GROUP BY m ORDER BY m`,
    [gid]
  );
  const dist = db.exec(
    `SELECT CASE WHEN min_price < 5 THEN '0-5' WHEN min_price < 10 THEN '5-10' WHEN min_price < 20 THEN '10-20' WHEN min_price < 50 THEN '20-50' ELSE '50+' END as r, COUNT(*) FROM price_records WHERE game_id = ? GROUP BY r`,
    [gid]
  );
  const vol = db.exec(
    `SELECT AVG(min_price), MIN(min_price), MAX(min_price), COUNT(*) FROM price_records WHERE game_id = ?`,
    [gid]
  );

  res.json({
    hourly: map(hourly, ["hour", "avg_min", "min", "max", "avg_sellers"]),
    daily: map(daily, [
      "day",
      "avg_min",
      "min",
      "max",
      "avg_sellers",
      "avg_stock",
    ]),
    weekly: map(weekly, ["week", "avg_min", "min", "max", "avg_sellers"]),
    monthly: map(monthly, ["month", "avg_min", "min", "max", "avg_sellers"]),
    distribution: map(dist, ["price_range", "count"]),
    volatility: vol[0]?.values[0]
      ? {
          mean: vol[0].values[0][0],
          min: vol[0].values[0][1],
          max: vol[0].values[0][2],
          range: vol[0].values[0][2] - vol[0].values[0][1],
          count: vol[0].values[0][3],
        }
      : null,
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    ...config,
    accessToken: config.accessToken ? "***" + config.accessToken.slice(-6) : "",
    pushme: {
      ...config.pushme,
      // 如果已经存在 pushKeys 列表，则不要返回被屏蔽的 pushKey（避免前端把屏蔽值当作真实 key 保存回去）
      pushKey:
        Array.isArray(config.pushme?.pushKeys) && config.pushme.pushKeys.length > 0
          ? ""
          : config.pushme?.pushKey
          ? "***" + config.pushme.pushKey.slice(-6)
          : "",
    },
    cronStatus: cronJob ? "运行中" : "已停止",
  });
});

app.put("/api/config", (req, res) => {
  const { accessToken, collectInterval, dataRetentionDays, pushme } = req.body;
  let restart = false;
  let restartDailyReport = false;

  if (accessToken?.length > 10) config.accessToken = accessToken;
  if (
    collectInterval >= 1 &&
    collectInterval <= 1440 &&
    config.collectInterval !== collectInterval
  ) {
    config.collectInterval = collectInterval;
    restart = true;
  }
  if (dataRetentionDays >= 1 && dataRetentionDays <= 365)
    config.dataRetentionDays = dataRetentionDays;

  // PushMe 配置更新
  if (pushme) {
    if (!config.pushme) config.pushme = { ...DEFAULT_CONFIG.pushme };

    if (typeof pushme.enabled === "boolean")
      config.pushme.enabled = pushme.enabled;
    // 支持新的 pushKeys 数组，同时兼容旧的 pushKey 字段
    if (Array.isArray(pushme.pushKeys)) {
      // 过滤掉空值或被屏蔽的（包含'*'）条目
      config.pushme.pushKeys = pushme.pushKeys.filter((k) => k && !k.includes("*"));
      // 如果明确提交了空数组，清除兼容旧字段 pushKey
      if (config.pushme.pushKeys.length === 0 && config.pushme.pushKey) {
        delete config.pushme.pushKey;
      }
    } else if (pushme.pushKey?.length > 5) {
      // 仅在 pushKey 看起来不是被屏蔽（不包含'*'）时保存
      if (!pushme.pushKey.includes("*")) {
        config.pushme.pushKey = pushme.pushKey;
        // 兼容：如果 pushKey 被设置，则保证 pushKeys 中包含该 key
        if (!Array.isArray(config.pushme.pushKeys)) config.pushme.pushKeys = [];
        if (!config.pushme.pushKeys.includes(pushme.pushKey))
          config.pushme.pushKeys.push(pushme.pushKey);
      }
    }

    // 推送冷却时间
    if (typeof pushme.cooldownMinutes === "number")
      config.pushme.cooldownMinutes = pushme.cooldownMinutes;

    // 史低提醒
    if (pushme.historyLowAlert) {
      if (!config.pushme.historyLowAlert) config.pushme.historyLowAlert = {};
      if (typeof pushme.historyLowAlert.enabled === "boolean")
        config.pushme.historyLowAlert.enabled = pushme.historyLowAlert.enabled;
    }

    if (pushme.dailyReport) {
      if (!config.pushme.dailyReport) config.pushme.dailyReport = {};
      if (typeof pushme.dailyReport.enabled === "boolean") {
        config.pushme.dailyReport.enabled = pushme.dailyReport.enabled;
        restartDailyReport = true;
      }
      if (pushme.dailyReport.time) {
        config.pushme.dailyReport.time = pushme.dailyReport.time;
        restartDailyReport = true;
      }
    }

    if (pushme.errorAlert) {
      if (!config.pushme.errorAlert) config.pushme.errorAlert = {};
      if (typeof pushme.errorAlert.enabled === "boolean")
        config.pushme.errorAlert.enabled = pushme.errorAlert.enabled;
    }
  }

  saveConfig(config);
  if (restart) startCronJob();
  if (restartDailyReport) startDailyReportJob();
  res.json({ success: true });
});

// PushMe 测试推送
app.post("/api/pushme/test", async (req, res) => {
  const providedKeys = req.body?.pushKeys;

  console.log('[PushMe Test] 收到测试请求');
  console.log('[PushMe Test] 提供的 keys 数量:', providedKeys?.length || 0);
  console.log('[PushMe Test] PushMe 启用状态:', config.pushme?.enabled);
  console.log('[PushMe Test] 配置中的 keys 数量:', config.pushme?.pushKeys?.length || 0);

  const result = await sendPushMe(
    "🔔 测试推送",
    `这是一条来自 **Steam Key 价格监控** 的测试消息\n\n⏰ ${new Date().toLocaleString()}`,
    providedKeys
  );

  console.log('[PushMe Test] 测试结果:', result);

  res.json(result);
});

// 手动触发每日报告
app.post("/api/pushme/daily-report", async (req, res) => {
  console.log('[每日报告] 收到手动触发请求');
  const result = await sendDailyReport();
  console.log('[每日报告] 手动触发结果:', result);
  res.json(result || { success: true });
});

app.post("/api/collect", async (req, res) => {
  await collectAllPrices();
  res.json({ success: true });
});
app.post("/api/collect/:gameId", async (req, res) => {
  res.json({
    success: true,
    data: await collectAndStorePrices(req.params.gameId),
  });
});
app.post("/api/cleanup", (req, res) => {
  cleanOldData();
  res.json({ success: true });
});

app.get("/api/db-stats", (req, res) => {
  const rc =
    db.exec("SELECT COUNT(*) FROM price_records")[0]?.values[0][0] || 0;
  const gc = db.exec("SELECT COUNT(*) FROM games")[0]?.values[0][0] || 0;
  const oldest = db.exec("SELECT MIN(recorded_at) FROM price_records")[0]
    ?.values[0][0];
  const newest = db.exec("SELECT MAX(recorded_at) FROM price_records")[0]
    ?.values[0][0];
  const size = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  res.json({
    recordCount: rc,
    gameCount: gc,
    oldestRecord: oldest,
    newestRecord: newest,
    fileSizeKB: Math.round(size / 1024),
    dataRetentionDays: config.dataRetentionDays,
  });
});

async function start() {
  await initDatabase();
  startCronJob();
  startDailyReportJob(); // 启动每日报告任务
  cron.schedule("0 0 * * *", cleanOldData, { timezone: "Asia/Shanghai" });
  setTimeout(collectAllPrices, 2000);

  app.listen(PORT, () => {
    console.log(
      `\n🎮 Steam Key 价格监控 v2.1\n📍 http://localhost:${PORT}\n⏰ 采集间隔: ${
        config.collectInterval
      }分钟 | 数据保留: ${config.dataRetentionDays}天\n📱 PushMe: ${
        config.pushme?.enabled ? "已启用" : "未启用"
      }\n`
    );
  });
}

start().catch(console.error);

process.on("SIGINT", () => {
  if (cronJob) cronJob.stop();
  saveDatabase();
  process.exit(0);
});
