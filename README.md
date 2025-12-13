# 🎮 Steam Key 价格监控系统

实时监控 Steam Key 价格走势，支持多游戏监控、历史数据分析和价格趋势图表展示。

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

访问 **http://localhost:3000** 查看监控面板。

---

## 配置说明

所有配置都在 `server.js` 文件中，以下是主要配置项：

### 1. 服务端口

```javascript
// server.js 第 9 行
const PORT = 3000;
```

### 2. 自动采集间隔

```javascript
// server.js 第 320-327 行
let cronJob = cron.schedule('*/10 * * * *', () => {
  console.log('=== 定时采集任务开始 ===');
  collectAllPrices();
}, {
  scheduled: true,
  timezone: "Asia/Shanghai"
});
```

**Cron 表达式说明：**

| 表达式 | 含义 |
|--------|------|
| `*/10 * * * *` | 每10分钟 |
| `*/30 * * * *` | 每30分钟 |
| `0 * * * *` | 每小时整点 |
| `0 */2 * * *` | 每2小时 |
| `0 0 * * *` | 每天零点 |

修改 `'*/10 * * * *'` 为你需要的间隔即可。

### 3. API 配置

```javascript
// server.js 第 53-63 行
const API_CONFIG = {
  host: 'steampy.com',
  basePath: '/xboot/steamKeySale/listSale',
  headers: {
    'User-Agent': 'APPAPK',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'identity',
    'accessToken': '532d4db7b63649048d6b0f3f14f942c2'  // 如果 token 失效需要更新
  }
};
```

### 4. 数据保留时间

```javascript
// server.js 第 140-142 行
// 保留最近30天的数据，避免文件过大
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
db.priceRecords = db.priceRecords.filter(r => r.recordedAt > thirtyDaysAgo);
```

修改 `30` 为你需要保留的天数。

---

## 项目结构

```
jiank/
├── server.js           # 后端服务器（核心配置都在这里）
├── package.json        # 项目依赖
├── README.md           # 项目文档
├── data/
│   └── database.json   # 价格数据存储（自动生成）
└── public/
    ├── index.html      # 前端页面
    ├── style.css       # 样式文件
    └── app.js          # 前端逻辑
```

---

## API 接口

### 游戏管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/games` | 获取所有监控游戏 |
| POST | `/api/games` | 添加游戏 `{id, name}` |
| DELETE | `/api/games/:id` | 删除游戏 |

### 价格数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/prices/:gameId?period=day` | 获取价格历史 |
| GET | `/api/stats/:gameId?period=day` | 获取统计数据 |

`period` 可选值：`day`（24小时）、`week`（7天）、`month`（30天）、`all`（全部）

### 采集控制

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/collect` | 手动采集所有游戏 |
| POST | `/api/collect/:gameId` | 手动采集指定游戏 |

---

## 添加新游戏

### 方法一：网页操作
点击页面上的 **「+ 添加游戏」** 按钮，输入游戏ID。

### 方法二：API 调用
```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"id": "游戏ID", "name": "游戏名称"}'
```

### 如何获取游戏ID？
从 Steampy APP 的游戏详情页 URL 或接口中获取 `gameId` 参数。

---

## 数据存储

数据保存在 `data/database.json` 文件中，格式如下：

```json
{
  "games": [
    { "id": "461759890218553344", "name": "游戏名称", "createdAt": "..." }
  ],
  "priceRecords": [
    {
      "id": 1702468718808,
      "gameId": "461759890218553344",
      "minPrice": 3.6,
      "avgPrice": 11.74,
      "maxPrice": 100,
      "stockCount": 40,
      "sellerCount": 39,
      "recordedAt": "2025-12-13T12:58:38.808Z"
    }
  ]
}
```

---

## 常见问题

### Q: 如何修改采集频率？
修改 `server.js` 第 321 行的 cron 表达式，然后重启服务。

### Q: 数据文件太大怎么办？
修改第 141 行的数据保留天数，或直接删除 `data/database.json` 重新开始。

### Q: accessToken 失效怎么办？
从 Steampy APP 抓包获取新的 token，更新 `server.js` 第 61 行。

### Q: 如何后台运行？
```bash
# Windows - 使用 pm2
npm install -g pm2
pm2 start server.js --name "steam-monitor"

# 或使用 nohup (Git Bash)
nohup node server.js &
```

---

## 技术栈

- **后端**: Node.js + Express + node-cron
- **前端**: 原生 HTML/CSS/JS + Chart.js
- **存储**: JSON 文件（轻量级，无需数据库）
