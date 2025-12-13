# 🎮 Steam Key 价格监控系统 v2.0

实时监控 Steam Key 价格走势，支持多游戏监控、SQLite 数据存储、多维度数据分析和价格趋势图表展示。

## ✨ 功能特性

- 📊 **实时价格监控** - 自动采集最低价、平均价、最高价、卖家数、库存量
- 💾 **SQLite 数据存储** - 高性能数据库，支持最长一年数据保留
- ⚙️ **后台配置管理** - 可视化设置采集频率、数据保留期限、Access Token
- 📈 **多维度数据分析** - 按天/周/月分析、价格分布图、波动分析
- 🎯 **多游戏支持** - 同时监控多个游戏的价格走势
- 💡 **智能建议** - 基于历史数据提供购买建议

## 🚀 快速开始

### 从 GitHub 克隆

```bash
# 克隆项目
git clone https://github.com/Aoki2008/steampy-price-monitor.git
cd steampy-price-monitor

# 安装依赖
npm install

# 启动服务
npm start
```

访问 **http://localhost:3000** 查看监控面板。

### 环境要求

- Node.js 16.0+
- npm 7.0+

---

## ⚙️ 后台配置

点击页面右上角的 **「⚙️ 设置」** 按钮，可以配置：

### 采集配置

| 配置项       | 范围        | 说明                     |
| ------------ | ----------- | ------------------------ |
| 采集间隔     | 1-1440 分钟 | 自动采集数据的时间间隔   |
| 数据保留天数 | 1-365 天    | 超过期限的数据会自动清理 |

### API 配置

| 配置项       | 说明                               |
| ------------ | ---------------------------------- |
| Access Token | Steampy API 访问令牌，失效时可更新 |

### 数据库状态

- 记录总数、监控游戏数
- 数据库文件大小
- 最早/最新记录时间
- 手动清理过期数据按钮

---

## 📊 数据分析功能

### 价格走势图

- 最低价、平均价、最高价趋势线
- 支持 24 小时/7 天/30 天/全部 时间范围

### 市场供应趋势

- 卖家数量变化
- 库存总量变化

### 多维度分析

- **按天分析** - 最近 30 天每日价格统计
- **按周分析** - 最近 12 周每周价格统计
- **按月分析** - 最近 12 个月每月价格统计

### 价格分布

- 价格区间分布饼图 (0-5, 5-10, 10-20, 20-50, 50+)

### 统计指标

- 历史最低价/最高价/均价
- 价格波动幅度
- 购买建议

---

## 📁 项目结构

```
jiank/
├── server.js           # 后端服务器 (Express + SQLite)
├── package.json        # 项目依赖
├── README.md           # 项目文档
├── data/
│   ├── prices.db       # SQLite 数据库 (自动生成)
│   └── config.json     # 配置文件 (自动生成)
└── public/
    ├── index.html      # 前端页面
    ├── style.css       # 样式文件
    └── app.js          # 前端逻辑
```

---

## 🔌 API 接口

### 游戏管理

| 方法   | 路径             | 说明                  |
| ------ | ---------------- | --------------------- |
| GET    | `/api/games`     | 获取所有监控游戏      |
| POST   | `/api/games`     | 添加游戏 `{id, name}` |
| DELETE | `/api/games/:id` | 删除游戏及其数据      |

### 价格数据

| 方法 | 路径                             | 说明               |
| ---- | -------------------------------- | ------------------ |
| GET  | `/api/prices/:gameId?period=day` | 获取价格历史       |
| GET  | `/api/stats/:gameId?period=day`  | 获取统计数据       |
| GET  | `/api/analysis/:gameId`          | 获取多维度分析数据 |

`period` 可选值：`day`（24 小时）、`week`（7 天）、`month`（30 天）、`quarter`（90 天）、`year`（365 天）、`all`（全部）

### 配置管理

| 方法 | 路径            | 说明                                                         |
| ---- | --------------- | ------------------------------------------------------------ |
| GET  | `/api/config`   | 获取当前配置                                                 |
| PUT  | `/api/config`   | 更新配置 `{accessToken, collectInterval, dataRetentionDays}` |
| GET  | `/api/db-stats` | 获取数据库状态                                               |

### 采集控制

| 方法 | 路径                   | 说明             |
| ---- | ---------------------- | ---------------- |
| POST | `/api/collect`         | 手动采集所有游戏 |
| POST | `/api/collect/:gameId` | 手动采集指定游戏 |
| POST | `/api/cleanup`         | 清理过期数据     |

---

## 🎮 添加新游戏

### 方法一：网页操作

点击页面上的 **「+ 添加游戏」** 按钮，输入游戏 ID 和名称。

### 方法二：API 调用

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"id": "游戏ID", "name": "游戏名称"}'
```

### 如何获取游戏 ID？

从 Steampy APP 的游戏详情页 URL 或接口中获取 `gameId` 参数。

---

## ❓ 常见问题

### Q: 如何修改采集频率？

点击页面右上角「⚙️ 设置」按钮，修改「采集间隔」后保存即可，无需重启服务。

### Q: 数据文件太大怎么办？

1. 在设置中减少「数据保留天数」
2. 点击「🗑️ 清理过期数据」按钮

### Q: Access Token 失效怎么办？

1. 从 Steampy APP 抓包获取新的 Token
2. 在设置页面的「Access Token」输入框中填入新 Token
3. 点击「保存设置」

### Q: 如何后台运行？

```bash
# 使用 pm2 (推荐)
npm install -g pm2
pm2 start server.js --name "steam-monitor"
pm2 save

# 查看日志
pm2 logs steam-monitor

# 停止服务
pm2 stop steam-monitor
```

---

## 🛠️ 技术栈

- **后端**: Node.js + Express + node-cron
- **数据库**: SQLite (sql.js)
- **前端**: 原生 HTML/CSS/JS + Chart.js
- **图表**: Chart.js + chartjs-adapter-date-fns

---

## 📝 更新日志

### v2.0.0

- ✨ 新增 SQLite 数据库存储，替换 JSON 文件
- ✨ 新增后台配置页面，支持可视化设置
- ✨ 新增 Access Token 在线更新功能
- ✨ 新增多维度数据分析（按天/周/月）
- ✨ 新增价格分布饼图
- ✨ 数据保留期限扩展至最长一年
- 🚀 性能优化，支持大量历史数据

### v1.0.0

- 🎉 初始版本，基础价格监控功能
