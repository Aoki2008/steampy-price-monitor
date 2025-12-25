# 🎮 Steam Key 价格监控系统

实时监控 Steam Key 价格走势，支持多游戏监控、SQLite 数据存储、多维度数据分析和价格趋势图表展示。

## ✨ 功能特性

- 📊 **实时价格监控** - 自动采集最低价、平均价、最高价、卖家数、库存量
- 💾 **SQLite 数据存储** - 高性能数据库，支持最长一年数据保留
- 📈 **多维度数据分析** - 按天/周/月分析、价格分布图、波动分析
- 🎯 **多游戏支持** - 同时监控多个游戏，支持搜索添加和批量导入
- 🔔 **企业微信推送** - 史低提醒、每日报告、异常提醒
- 🌓 **深色模式** - 支持亮色/暗色主题切换
- 📱 **响应式设计** - 完美适配桌面端和移动端

## 🚀 快速开始

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

### 后台运行（推荐）

```bash
npm install -g pm2
pm2 start server.js --name "steam-monitor"
```

## 📁 项目结构

```
steampy-price-monitor/
├── server.js           # 后端服务器
├── package.json        # 项目依赖
├── data/               # 数据目录（自动生成）
│   ├── prices.db       # SQLite 数据库
│   └── config.json     # 配置文件
└── public/             # 前端文件
    ├── index.html
    ├── style.css
    └── app.js
```

## 🛠️ 技术栈

- **后端**: Node.js + Express + SQLite
- **前端**: HTML/CSS/JS + Chart.js
- **推送**: 企业微信机器人 Webhook

## 📝 版本信息

当前版本：**v2.1.3**

查看完整更新日志请访问 [Releases](https://github.com/Aoki2008/steampy-price-monitor/releases) 页面。

## 📄 开源协议

MIT License