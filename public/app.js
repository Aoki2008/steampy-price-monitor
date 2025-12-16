// 全局状态
let currentGameId = null;
let currentPeriod = "day";
let priceChart = null;
let supplyChart = null;

// 分页状态
let currentPage = 1;
const pageSize = 20;
let allPrices = [];

// API 基础地址
const API_BASE = "";

// ========== HTML 转义工具函数 ==========
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ========== 初始化 ==========
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initPeriodButtons();
  loadGames();

  // 每分钟自动刷新
  setInterval(refreshData, 60000);
});

// ========== 主题切换 ==========
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.dataset.theme = savedTheme;
  updateThemeButton(savedTheme);
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === "dark";
  const newTheme = isDark ? "light" : "dark";
  html.dataset.theme = newTheme;
  localStorage.setItem("theme", newTheme);
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const btn = document.getElementById("btn-theme");
  if (btn) {
    btn.textContent = theme === "dark" ? "亮色" : "暗色";
  }
}

// ========== 游戏管理 ==========
async function loadGames() {
  try {
    const response = await fetch(`${API_BASE}/api/games`);
    const games = await response.json();

    const gameList = document.getElementById("game-list");
    gameList.innerHTML = "";

    if (games.length === 0) {
      gameList.innerHTML =
        '<p style="color: var(--text-secondary)">暂无监控游戏，请添加</p>';
      return;
    }

    games.forEach((game, index) => {
      const div = document.createElement("div");
      div.className = `game-item ${index === 0 ? "active" : ""}`;
      div.dataset.id = game.id;

      const nameSpan = document.createElement("span");
      nameSpan.className = "game-name";
      nameSpan.textContent = game.name || game.id;

      const deleteBtn = document.createElement("span");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "✕";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteGame(game.id, e);
      };

      div.appendChild(nameSpan);
      div.appendChild(deleteBtn);

      div.onclick = (e) => {
        if (!e.target.classList.contains("delete-btn")) {
          selectGame(game.id);
        }
      };
      gameList.appendChild(div);
    });

    // 更新移动端游戏选择器
    const mobileSelect = document.getElementById("mobile-game-select");
    if (mobileSelect) {
      mobileSelect.innerHTML = '<option value="">选择游戏...</option>';
      games.forEach((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        option.textContent = game.name || game.id;
        mobileSelect.appendChild(option);
      });
    }

    // 选择第一个游戏
    if (games.length > 0 && !currentGameId) {
      selectGame(games[0].id);
    }
  } catch (error) {
    console.error("加载游戏列表失败:", error);
  }
}

function selectGame(gameId) {
  currentGameId = gameId;

  // 更新UI
  document.querySelectorAll(".game-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.id === gameId);
  });

  // 更新移动端选择器
  const mobileSelect = document.getElementById("mobile-game-select");
  if (mobileSelect) mobileSelect.value = gameId;

  // 更新页面标题
  const activeItem = document.querySelector(`.game-item[data-id="${gameId}"]`);
  const gameName =
    activeItem?.querySelector(".game-name")?.textContent || "价格监控";
  const titleEl = document.getElementById("current-game-title");
  if (titleEl) {
    titleEl.textContent = gameName;
  }

  // 加载数据
  loadPriceData();
}

function selectGameMobile(gameId) {
  if (!gameId) return;
  selectGame(gameId);
}

async function addGame() {
  const gameId = document.getElementById("input-game-id").value.trim();
  const gameName = document.getElementById("input-game-name").value.trim();

  if (!gameId) {
    alert("请输入游戏ID");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: gameId, name: gameName }),
    });

    if (response.ok) {
      hideAddGameModal();
      loadGames();
      // 切换到新添加的游戏
      setTimeout(() => selectGame(gameId), 500);
    }
  } catch (error) {
    alert("添加失败: " + error.message);
  }
}

async function deleteGame(gameId, event) {
  event.stopPropagation();

  if (!confirm("确定要删除这个游戏的监控吗？所有历史数据将被删除。")) {
    return;
  }

  try {
    await fetch(`${API_BASE}/api/games/${gameId}`, { method: "DELETE" });
    if (currentGameId === gameId) {
      currentGameId = null;
    }
    loadGames();
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

// ========== 弹窗控制 ==========
function showAddGameModal() {
  document.getElementById("add-game-modal").classList.add("show");
  document.getElementById("input-game-id").value = "";
  document.getElementById("input-game-name").value = "";
}

function hideAddGameModal() {
  document.getElementById("add-game-modal").classList.remove("show");
}

// ========== 时间周期 ==========
function initPeriodButtons() {
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll(".period-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = btn.dataset.period;
      loadPriceData();
    };
  });
}

// ========== 数据加载 ==========
async function loadPriceData() {
  if (!currentGameId) return;

  try {
    // 并行加载数据
    const [pricesRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/api/prices/${currentGameId}?period=${currentPeriod}`),
      fetch(`${API_BASE}/api/stats/${currentGameId}?period=${currentPeriod}`),
    ]);

    const prices = await pricesRes.json();
    const { stats, latest } = await statsRes.json();

    // 更新统计卡片
    updateStats(stats, latest);

    // 更新图表
    updatePriceChart(prices);
    updateSupplyChart(prices);

    // 更新表格
    updateTable(prices);

    // 更新分析
    updateAnalysis(prices, stats);

    // 更新时间
    document.getElementById("last-update").textContent =
      new Date().toLocaleString();
  } catch (error) {
    console.error("加载数据失败:", error);
  }
}

// ========== 更新统计 ==========
function updateStats(stats, latest) {
  document.getElementById("stat-current").textContent = latest
    ? `¥${latest.min_price.toFixed(2)}`
    : "--";
  document.getElementById("stat-lowest").textContent = stats?.lowest_price
    ? `¥${stats.lowest_price.toFixed(2)}`
    : "--";
  document.getElementById("stat-avg").textContent = stats?.avg_min_price
    ? `¥${stats.avg_min_price.toFixed(2)}`
    : "--";
  document.getElementById("stat-highest").textContent = stats?.highest_min_price
    ? `¥${stats.highest_min_price.toFixed(2)}`
    : "--";
  document.getElementById("stat-sellers").textContent =
    latest?.seller_count ?? "--";
  document.getElementById("stat-stock").textContent =
    latest?.stock_count ?? "--";
}

// ========== 价格图表 ==========
function updatePriceChart(prices) {
  const ctx = document.getElementById("price-chart").getContext("2d");

  const labels = prices.map((p) => new Date(p.recorded_at));
  const minPrices = prices.map((p) => p.min_price);
  const avgPrices = prices.map((p) => p.avg_price);
  const maxPrices = prices.map((p) => p.max_price);

  if (priceChart) {
    priceChart.destroy();
  }

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "最低价",
          data: minPrices,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: prices.length > 50 ? 0 : 3,
        },
        {
          label: "平均价",
          data: avgPrices,
          borderColor: "#6366f1",
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: prices.length > 50 ? 0 : 3,
        },
        {
          label: "最高价",
          data: maxPrices,
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: prices.length > 50 ? 0 : 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f1f5f9",
          bodyColor: "#94a3b8",
          borderColor: "#334155",
          borderWidth: 1,
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ¥${context.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            displayFormats: {
              hour: "HH:mm",
              day: "MM/dd",
              week: "MM/dd",
            },
          },
          grid: {
            color: "#334155",
          },
          ticks: {
            color: "#94a3b8",
          },
        },
        y: {
          grid: {
            color: "#334155",
          },
          ticks: {
            color: "#94a3b8",
            callback: (value) => "¥" + value.toFixed(2),
          },
        },
      },
    },
  });
}

// ========== 供应图表 ==========
function updateSupplyChart(prices) {
  const ctx = document.getElementById("supply-chart").getContext("2d");

  const labels = prices.map((p) => new Date(p.recorded_at));
  const sellers = prices.map((p) => p.seller_count);
  const stocks = prices.map((p) => p.stock_count);

  if (supplyChart) {
    supplyChart.destroy();
  }

  supplyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "卖家数",
          data: sellers,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          fill: true,
          tension: 0.3,
          yAxisID: "y",
          pointRadius: prices.length > 50 ? 0 : 3,
        },
        {
          label: "库存总量",
          data: stocks,
          borderColor: "#06b6d4",
          backgroundColor: "transparent",
          tension: 0.3,
          yAxisID: "y1",
          pointRadius: prices.length > 50 ? 0 : 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#94a3b8",
          },
        },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f1f5f9",
          bodyColor: "#94a3b8",
          borderColor: "#334155",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            displayFormats: {
              hour: "HH:mm",
              day: "MM/dd",
            },
          },
          grid: {
            color: "#334155",
          },
          ticks: {
            color: "#94a3b8",
          },
        },
        y: {
          type: "linear",
          position: "left",
          grid: {
            color: "#334155",
          },
          ticks: {
            color: "#94a3b8",
          },
          title: {
            display: true,
            text: "卖家数",
            color: "#94a3b8",
          },
        },
        y1: {
          type: "linear",
          position: "right",
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: "#94a3b8",
          },
          title: {
            display: true,
            text: "库存",
            color: "#94a3b8",
          },
        },
      },
    },
  });
}

// ========== 更新表格 ==========
function updateTable(prices) {
  allPrices = [...prices].reverse(); // 保存所有数据（倒序）
  currentPage = 1;
  renderTablePage();
}

function renderTablePage() {
  const tbody = document.getElementById("data-table-body");
  const totalPages = Math.ceil(allPrices.length / pageSize) || 1;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = allPrices.slice(start, end);

  document.getElementById(
    "record-count"
  ).textContent = `${allPrices.length} 条记录`;
  document.getElementById(
    "page-info"
  ).textContent = `第 ${currentPage}/${totalPages} 页`;

  tbody.innerHTML = pageData
    .map(
      (p) => `
    <tr>
      <td>${new Date(p.recorded_at).toLocaleString()}</td>
      <td style="color: #10b981; font-weight: 600">¥${p.min_price.toFixed(
        2
      )}</td>
      <td>¥${p.avg_price?.toFixed(2) ?? "--"}</td>
      <td>¥${p.max_price?.toFixed(2) ?? "--"}</td>
      <td>${p.seller_count}</td>
      <td>${p.stock_count}</td>
    </tr>
  `
    )
    .join("");
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTablePage();
  }
}

function nextPage() {
  const totalPages = Math.ceil(allPrices.length / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    renderTablePage();
  }
}

// ========== 价格分析 ==========
function updateAnalysis(prices, stats) {
  const container = document.getElementById("analysis-content");

  if (prices.length < 2) {
    container.innerHTML =
      '<p class="loading">数据不足，暂无法分析。请等待更多数据采集。</p>';
    return;
  }

  // 计算趋势
  const firstPrice = prices[0].min_price;
  const lastPrice = prices[prices.length - 1].min_price;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(2);

  // 计算波动
  const minPrices = prices.map((p) => p.min_price);
  const volatility = Math.max(...minPrices) - Math.min(...minPrices);
  const avgPrice = minPrices.reduce((a, b) => a + b, 0) / minPrices.length;
  const volatilityPercent = ((volatility / avgPrice) * 100).toFixed(2);

  // 判断趋势
  let trendClass = "stable";
  let trendText = "持平";
  if (priceChange > 0.1) {
    trendClass = "up";
    trendText = "上涨";
  } else if (priceChange < -0.1) {
    trendClass = "down";
    trendText = "下跌";
  }

  // 计算建议
  let suggestion = "";
  if (lastPrice <= stats.lowest_price * 1.05) {
    suggestion = "💡 当前价格接近历史最低，可以考虑入手";
  } else if (lastPrice >= stats.highest_min_price * 0.95) {
    suggestion = "⚠️ 当前价格接近历史最高，建议观望";
  } else {
    suggestion = "📊 当前价格处于正常区间";
  }

  container.innerHTML = `
    <div class="analysis-item">
      <span class="analysis-label">价格趋势</span>
      <span class="analysis-value ${trendClass}">
        ${trendText} ${priceChange >= 0 ? "+" : ""}¥${priceChange.toFixed(
    2
  )} (${priceChange >= 0 ? "+" : ""}${priceChangePercent}%)
      </span>
    </div>
    <div class="analysis-item">
      <span class="analysis-label">价格波动幅度</span>
      <span class="analysis-value">¥${volatility.toFixed(
        2
      )} (${volatilityPercent}%)</span>
    </div>
    <div class="analysis-item">
      <span class="analysis-label">与历史最低价差距</span>
      <span class="analysis-value">¥${(lastPrice - stats.lowest_price).toFixed(
        2
      )}</span>
    </div>
    <div class="analysis-item">
      <span class="analysis-label">采集数据点数</span>
      <span class="analysis-value">${stats.record_count} 条</span>
    </div>
    <div class="analysis-item">
      <span class="analysis-label">建议</span>
      <span class="analysis-value">${suggestion}</span>
    </div>
  `;
}

// ========== 操作按钮 ==========
async function refreshData() {
  const btn = document.getElementById("btn-refresh");
  btn.classList.add("refreshing");
  btn.disabled = true;

  await loadPriceData();

  btn.classList.remove("refreshing");
  btn.disabled = false;
}

async function manualCollect() {
  const btn = document.getElementById("btn-collect");
  btn.disabled = true;
  btn.textContent = "采集中...";

  try {
    if (currentGameId) {
      await fetch(`${API_BASE}/api/collect/${currentGameId}`, {
        method: "POST",
      });
    } else {
      await fetch(`${API_BASE}/api/collect`, { method: "POST" });
    }

    // 等待数据写入
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await loadPriceData();
  } catch (error) {
    alert("采集失败: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "采集";
  }
}

// 关闭弹窗（点击外部）
document.getElementById("add-game-modal").onclick = (e) => {
  if (e.target.id === "add-game-modal") hideAddGameModal();
};
document.getElementById("settings-modal").onclick = (e) => {
  if (e.target.id === "settings-modal") hideSettingsModal();
};

// ESC 关闭弹窗
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideAddGameModal();
    hideSettingsModal();
  }
});

// ========== 设置面板 ==========
async function showSettingsModal() {
  document.getElementById("settings-modal").classList.add("show");
  switchSettingsTab("basic"); // 默认显示基础设置
  await loadSettings();
  await loadDbStats();
}

function hideSettingsModal() {
  document.getElementById("settings-modal").classList.remove("show");
}

// 切换设置标签
function switchSettingsTab(tabName) {
  // 更新标签按钮状态
  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  // 更新面板显示
  document.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  });
  // 如果切换到游戏管理标签，加载游戏列表
  if (tabName === "games") {
    loadGamesHistoryLow();
  }
}

// 加载游戏史低价格列表
async function loadGamesHistoryLow() {
  const container = document.getElementById("games-history-low-list");
  try {
    const res = await fetch(`${API_BASE}/api/games`);
    const games = await res.json();

    if (games.length === 0) {
      container.innerHTML =
        '<p style="color: var(--text-secondary)">暂无监控游戏</p>';
      return;
    }

    container.innerHTML = '';
    games.forEach((game) => {
      const item = document.createElement('div');
      item.className = 'game-history-item';
      item.dataset.id = game.id;

      // 游戏名称
      const nameSpan = document.createElement('span');
      nameSpan.className = 'game-name';
      nameSpan.textContent = game.name || game.id;

      // 当前史低价格显示
      const priceSpan = document.createElement('span');
      priceSpan.className = 'current-price';
      priceSpan.textContent = game.history_low_price !== null
        ? `¥${game.history_low_price}`
        : '未设置';

      // 设置行容器
      const settingsRow = document.createElement('div');
      settingsRow.className = 'game-settings-row';

      // 史低价格设置
      const priceDiv = document.createElement('div');

      const priceInput = document.createElement('input');
      priceInput.type = 'number';
      priceInput.step = '0.01';
      priceInput.min = '0';
      priceInput.placeholder = '史低';
      priceInput.value = game.history_low_price || '';
      priceInput.title = '设置史低价格';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-sm btn-primary btn-save';
      saveBtn.textContent = '保存';
      saveBtn.onclick = function() { saveGameHistoryLow(game.id, this); };

      priceDiv.appendChild(priceInput);
      priceDiv.appendChild(saveBtn);

      // 推送开关
      const pushDiv = document.createElement('div');
      const pushLabel = document.createElement('label');
      const pushCheckbox = document.createElement('input');
      pushCheckbox.type = 'checkbox';
      pushCheckbox.className = 'game-push-enabled';
      pushCheckbox.checked = game.push_enabled || false;
      pushCheckbox.title = '启用推送提醒';
      pushLabel.appendChild(pushCheckbox);
      pushLabel.appendChild(document.createTextNode('推送'));
      pushDiv.appendChild(pushLabel);

      settingsRow.appendChild(priceDiv);
      settingsRow.appendChild(pushDiv);

      item.appendChild(nameSpan);
      item.appendChild(priceSpan);
      item.appendChild(settingsRow);

      container.appendChild(item);
    });
  } catch (e) {
    container.innerHTML = '<p style="color: var(--danger)">加载失败</p>';
    console.error("加载游戏列表失败:", e);
  }
}

// 保存游戏史低价格
async function saveGameHistoryLow(gameId, btn) {
  const item = btn.closest(".game-history-item");
  const input = item.querySelector("input");
  const price = input.value.trim();

  btn.disabled = true;
  btn.textContent = "保存中...";

  try {
    const res = await fetch(`${API_BASE}/api/games/${gameId}/history-low`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history_low_price: price === "" ? null : parseFloat(price),
      }),
    });

    if (!res.ok) {
      throw new Error("保存史低价格失败");
    }

    // 同时保存游戏级的推送设置
    const pushEnabled = item.querySelector('.game-push-enabled').checked;

    const pushRes = await fetch(`${API_BASE}/api/games/${gameId}/push-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        push_enabled: !!pushEnabled
      })
    });

    if (!pushRes.ok) {
      throw new Error("保存推送设置失败");
    }

    // 全部成功
    btn.textContent = "✓ 已保存";
    item.querySelector(".current-price").textContent = price
      ? `¥${price}`
      : '未设置';
    setTimeout(() => {
      btn.textContent = "保存";
      btn.disabled = false;
    }, 1500);
  } catch (e) {
    btn.textContent = "保存失败";
    btn.disabled = false;
    alert(`保存失败: ${e.message}`);
    console.error("保存游戏设置失败:", e);
  }
}

async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    const config = await res.json();
    document.getElementById("input-interval").value =
      config.collectInterval || 10;
    document.getElementById("input-retention").value =
      config.dataRetentionDays || 365;
    document.getElementById("current-token").textContent =
      config.accessToken || "未设置";

    // PushMe 配置
    const pushme = config.pushme || {};
    document.getElementById("pushme-enabled").checked = pushme.enabled || false;
    // 加载 Push Keys 列表
    window.pushmeKeys = pushme.pushKeys || [];
    // 兼容旧配置：如果后端返回的 pushKey 看起来是被前端或后端屏蔽（包含'*'），则不自动加入
    if (
      pushme.pushKey &&
      !pushme.pushKey.includes("*") &&
      !window.pushmeKeys.includes(pushme.pushKey)
    ) {
      window.pushmeKeys.push(pushme.pushKey);
    }
    renderPushKeysList();
    // 推送冷却时间
    document.getElementById("pushme-cooldown").value =
      pushme.cooldownMinutes || 60;
    // 史低提醒
    document.getElementById("pushme-history-low-alert").checked =
      pushme.historyLowAlert?.enabled || false;
    // 价格变动提醒
    document.getElementById("pushme-price-change-alert").checked =
      pushme.priceChangeAlert?.enabled || false;
    document.getElementById("pushme-drop-percent").value =
      pushme.priceChangeAlert?.dropPercent || "";
    document.getElementById("pushme-rise-percent").value =
      pushme.priceChangeAlert?.risePercent || "";
    // 每日报告
    document.getElementById("pushme-daily-report").checked =
      pushme.dailyReport?.enabled || false;
    document.getElementById("pushme-report-time").value =
      pushme.dailyReport?.time || "20:00";
    // 异常提醒
    document.getElementById("pushme-error-alert").checked =
      pushme.errorAlert?.enabled !== false;
  } catch (e) {
    console.error("加载配置失败:", e);
  }
}

async function loadDbStats() {
  try {
    const res = await fetch(`${API_BASE}/api/db-stats`);
    const stats = await res.json();
    document.getElementById("db-record-count").textContent =
      stats.recordCount?.toLocaleString() || "0";
    document.getElementById("db-game-count").textContent =
      stats.gameCount || "0";
    document.getElementById("db-size").textContent = stats.fileSizeKB
      ? `${stats.fileSizeKB} KB`
      : "--";
    document.getElementById("db-oldest").textContent = stats.oldestRecord
      ? new Date(stats.oldestRecord).toLocaleDateString()
      : "--";
  } catch (e) {
    console.error("加载数据库状态失败:", e);
  }
}

async function saveSettings() {
  const interval = parseInt(document.getElementById("input-interval").value);
  const retention = parseInt(document.getElementById("input-retention").value);
  const token = document.getElementById("input-token").value.trim();

  const body = { collectInterval: interval, dataRetentionDays: retention };
  if (token) body.accessToken = token;

  // PushMe 配置
  body.pushme = {
    enabled: document.getElementById("pushme-enabled").checked,
    // 只提交看起来有效的 pushKeys（过滤掉被屏蔽的或空字符串）
    pushKeys: (window.pushmeKeys || []).filter((k) => k && !k.includes("*")),
    // 推送冷却时间
    cooldownMinutes:
      parseInt(document.getElementById("pushme-cooldown").value) || 60,
    // 史低提醒
    historyLowAlert: {
      enabled: document.getElementById("pushme-history-low-alert").checked,
    },
    // 价格变动提醒
    priceChangeAlert: {
      enabled: document.getElementById("pushme-price-change-alert").checked,
      dropPercent:
        parseFloat(document.getElementById("pushme-drop-percent").value) || 0,
      risePercent:
        parseFloat(document.getElementById("pushme-rise-percent").value) || 0,
    },
    // 每日报告
    dailyReport: {
      enabled: document.getElementById("pushme-daily-report").checked,
      time: document.getElementById("pushme-report-time").value || "20:00",
    },
    // 异常提醒
    errorAlert: {
      enabled: document.getElementById("pushme-error-alert").checked,
    },
  };

  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      alert("设置已保存！");
      hideSettingsModal();
      document.getElementById("input-token").value = "";
    } else {
      alert("保存失败");
    }
  } catch (e) {
    alert("保存失败: " + e.message);
  }
}

// PushMe 测试推送
async function testPushMe() {
  try {
    // 允许测试使用未保存的 keys：将当前窗口中的 pushKeys 作为测试参数提交
    const res = await fetch(`${API_BASE}/api/pushme/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushKeys: (window.pushmeKeys || []).filter((k) => k && !k.includes("*")) }),
    });
    const result = await res.json();
    if (result.success) {
      alert("测试推送已发送！请检查手机通知");
    } else {
      alert("推送失败: " + (result.reason || result.error || "未知错误"));
    }
  } catch (e) {
    alert("推送失败: " + e.message);
  }
}

// 手动发送每日报告
async function sendDailyReport() {
  try {
    await fetch(`${API_BASE}/api/pushme/daily-report`, { method: "POST" });
    alert("每日报告已发送！");
  } catch (e) {
    alert("发送失败: " + e.message);
  }
}

async function cleanupData() {
  if (!confirm("确定要清理过期数据吗？")) return;

  try {
    await fetch(`${API_BASE}/api/cleanup`, { method: "POST" });
    alert("清理完成！");
    await loadDbStats();
  } catch (e) {
    alert("清理失败: " + e.message);
  }
}

// ========== 多维度分析 ==========
let analysisChart = null;
let distributionChart = null;
let currentAnalysisTab = "daily";

// 初始化分析标签页
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.onclick = () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentAnalysisTab = btn.dataset.tab;
    loadAnalysisData();
  };
});

async function loadAnalysisData() {
  if (!currentGameId) return;

  try {
    const res = await fetch(`${API_BASE}/api/analysis/${currentGameId}`);
    const data = await res.json();

    updateAnalysisChart(data);
    updateDistributionChart(data.distribution);
    updateAnalysisSummary(data);
  } catch (e) {
    console.error("加载分析数据失败:", e);
  }
}

function updateAnalysisChart(data) {
  const ctx = document.getElementById("analysis-chart").getContext("2d");

  let chartData;
  let labelKey;

  switch (currentAnalysisTab) {
    case "daily":
      chartData = data.daily || [];
      labelKey = "day";
      break;
    case "weekly":
      chartData = data.weekly || [];
      labelKey = "week";
      break;
    case "monthly":
      chartData = data.monthly || [];
      labelKey = "month";
      break;
  }

  if (analysisChart) analysisChart.destroy();

  analysisChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.map((d) => d[labelKey]),
      datasets: [
        {
          label: "平均最低价",
          data: chartData.map((d) => d.avg_min),
          backgroundColor: "rgba(99, 102, 241, 0.7)",
          borderRadius: 4,
        },
        {
          label: "最低价",
          data: chartData.map((d) => d.min),
          backgroundColor: "rgba(16, 185, 129, 0.7)",
          borderRadius: 4,
        },
        {
          label: "最高价",
          data: chartData.map((d) => d.max),
          backgroundColor: "rgba(245, 158, 11, 0.7)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#94a3b8" } },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f1f5f9",
          bodyColor: "#94a3b8",
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ¥${ctx.parsed.y?.toFixed(2) || "--"}`,
          },
        },
      },
      scales: {
        x: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
        y: {
          grid: { color: "#334155" },
          ticks: { color: "#94a3b8", callback: (v) => "¥" + v },
        },
      },
    },
  });
}

function updateDistributionChart(distribution) {
  const ctx = document.getElementById("distribution-chart").getContext("2d");

  if (distributionChart) distributionChart.destroy();

  const colors = ["#10b981", "#6366f1", "#8b5cf6", "#f59e0b", "#ef4444"];

  distributionChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: (distribution || []).map((d) => `¥${d.price_range}`),
      datasets: [
        {
          data: (distribution || []).map((d) => d.count),
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#94a3b8", padding: 15 },
        },
      },
    },
  });
}

function updateAnalysisSummary(data) {
  const container = document.getElementById("analysis-summary");
  const vol = data.volatility;

  if (!vol || vol.count === 0) {
    container.innerHTML =
      '<p style="color:var(--text-secondary);text-align:center">暂无足够数据进行分析</p>';
    return;
  }

  const volatilityPercent = ((vol.range / vol.mean) * 100).toFixed(1);

  container.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">历史均价</div>
      <div class="summary-value">¥${vol.mean?.toFixed(2) || "--"}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">历史最低</div>
      <div class="summary-value down">¥${vol.min?.toFixed(2) || "--"}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">历史最高</div>
      <div class="summary-value up">¥${vol.max?.toFixed(2) || "--"}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">价格波动</div>
      <div class="summary-value">¥${
        vol.range?.toFixed(2) || "--"
      } (${volatilityPercent}%)</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">数据点数</div>
      <div class="summary-value">${vol.count?.toLocaleString() || "--"}</div>
    </div>
  `;
}

// 修改 loadPriceData 函数，加载完数据后也加载分析数据
const originalLoadPriceData = loadPriceData;
loadPriceData = async function () {
  await originalLoadPriceData();
  await loadAnalysisData();
};

// ========== PushMe Key 管理 ==========

// 初始化 pushmeKeys
window.pushmeKeys = window.pushmeKeys || [];

// 渲染 Push Keys 列表
function renderPushKeysList() {
  const container = document.getElementById("pushme-keys-list");
  if (!container) return;

  if (window.pushmeKeys.length === 0) {
    container.innerHTML =
      '<div style="color: var(--text-secondary); font-size: 13px; padding: 8px 0;">暂无 Push Key</div>';
    return;
  }

  container.innerHTML = '';
  window.pushmeKeys.forEach((key, index) => {
    const item = document.createElement('div');
    item.className = 'pushme-key-item';

    const keySpan = document.createElement('span');
    keySpan.className = 'key-text';
    keySpan.textContent = `${key.slice(0, 6)}***${key.slice(-4)}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '删除';
    removeBtn.onclick = function() { removePushKey(index); };

    item.appendChild(keySpan);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

// 添加 Push Key
function addPushKey() {
  const input = document.getElementById("pushme-key-input");
  const key = input.value.trim();

  if (!key) {
    alert("请输入 Push Key");
    return;
  }

  if (window.pushmeKeys.includes(key)) {
    alert("该 Push Key 已存在");
    return;
  }

  window.pushmeKeys.push(key);
  input.value = "";
  renderPushKeysList();
}

// 删除 Push Key
function removePushKey(index) {
  if (confirm("确定要删除这个 Push Key 吗？")) {
    window.pushmeKeys.splice(index, 1);
    renderPushKeysList();
  }
}
