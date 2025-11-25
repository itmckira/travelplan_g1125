// 簡單的旅遊計畫資料結構：會存到 localStorage & 匯出 JSON
const STORAGE_KEY = "travelPlannerDataV1";
// ⬇⬇⬇ 這裡填入你剛剛部署出的 Web App URL
const GOOGLE_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbymjqlPBMixbdbD_eFn5DqmBqSwg1ns_F4OpjNNN8a6y2ur1bTSInkA7Ok6BVbiHRuX/exec";

let state = {
  tripName: "",
  items: [],
};

// 自動同步用（debounce）
let autoSyncTimer = null;

// 同步狀態顯示用
let syncStatusEl = null;
let lastSyncTime = null;

let currentFilterDate = "";

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  const tripNameInput = document.getElementById("tripNameInput");
  const itemForm = document.getElementById("itemForm");
  const filterDateInput = document.getElementById("filterDate");
  const clearFilterBtn = document.getElementById("clearFilterBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const importJsonInput = document.getElementById("importJsonInput");
  const syncSheetBtn = document.getElementById("syncSheetBtn");
  syncStatusEl = document.getElementById("syncStatus");   // 同步狀態列
  
    // 同步到 Google Sheet
    syncSheetBtn.addEventListener("click", () => {
    syncToGoogleSheet(false);  // 手動模式（會跳 alert）
  });


  
  loadStateFromStorage();
  render();
  setSyncStatus("尚未同步", "neutral");

 // 修改旅遊名稱 → 儲存 + 自動同步
  tripNameInput.value = state.tripName || "";
  tripNameInput.addEventListener("input", () => {
    state.tripName = tripNameInput.value.trim();
    saveStateToStorage();
    scheduleAutoSync();  // ★ 旅遊名稱改了就自動回寫
  });

  // 新增行程
  itemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addItemFromForm(itemForm);
  });

  // 篩選某一天行程
  filterDateInput.addEventListener("change", () => {
    currentFilterDate = filterDateInput.value || "";
    render();
  });

  // 清除篩選
  clearFilterBtn.addEventListener("click", () => {
    currentFilterDate = "";
    filterDateInput.value = "";
    render();
  });

  // 匯出 JSON 檔案
  exportJsonBtn.addEventListener("click", () => {
    exportJsonFile();
  });

  // 匯入 JSON 檔案
  importJsonInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        if (!obj || !Array.isArray(obj.items)) {
          alert("JSON 格式不正確：缺少 items 陣列");
          return;
        }
        state = {
          tripName: obj.tripName || "",
          items: obj.items.map((it) => ({
            id: it.id || String(Date.now()) + Math.random(),
            date: it.date,
            time: it.time || "",
            title: it.title || "",
            location: it.location || "",
            note: it.note || "",
          })),
        };
         saveStateToStorage();
        // 重設篩選
        currentFilterDate = "";
        document.getElementById("filterDate").value = "";
        document.getElementById("tripNameInput").value = state.tripName;
        render();

        // ★ 匯入完成後也自動同步到 Google Sheet
        scheduleAutoSync();

        alert("匯入完成！");
      } catch (err) {
        console.error(err);
        alert("無法解析 JSON，請確認檔案格式。");
      } finally {
        // 重置 input，避免同一檔案無法再次觸發 change
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  });
});

// 將表單資料新增為一筆行程
function addItemFromForm(form) {
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");
  const titleEl = document.getElementById("title");
  const locationEl = document.getElementById("location");
  const noteEl = document.getElementById("note");

  const date = dateEl.value;
  const time = timeEl.value;
  const title = titleEl.value.trim();
  const location = locationEl.value.trim();
  const note = noteEl.value.trim();

  if (!date || !title) {
    alert("請至少填寫 日期 與 行程標題");
    return;
  }

  const newItem = {
    id: String(Date.now()) + Math.random(),
    date,
    time,
    title,
    location,
    note,
  };

  state.items.push(newItem);
  saveStateToStorage();
  render();

  // ★ 新增後自動同步到 Google Sheet
  scheduleAutoSync();

  // 保留日期，清掉其他欄位，方便連續輸入同一天
  timeEl.value = "";
  titleEl.value = "";
  locationEl.value = "";
  noteEl.value = "";
  titleEl.focus();
}


// 儲存到 localStorage
function saveStateToStorage() {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (err) {
    console.error("save error", err);
  }
}

// 刪除單一行程
function deleteItem(id) {
  const index = state.items.findIndex((it) => it.id === id);
  if (index === -1) return;

  state.items.splice(index, 1);
  saveStateToStorage();
  render();
  // 刪除也要自動同步到 Google Sheet
  if (typeof scheduleAutoSync === "function") {
    scheduleAutoSync();
  }
}

// 從 localStorage 載入
function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.items)) return;
    state = {
      tripName: obj.tripName || "",
      items: obj.items.map((it) => ({
        id: it.id || String(Date.now()) + Math.random(),
        date: it.date,
        time: it.time || "",
        title: it.title || "",
        location: it.location || "",
        note: it.note || "",
      })),
    };
  } catch (err) {
    console.error("load error", err);
  }
}

function setSyncStatus(text, mode = "neutral") {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = text;
  syncStatusEl.className = "sync-status"; // 先清掉原本的
  if (mode) {
    syncStatusEl.classList.add("sync-" + mode);
  }
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}


// 排程自動同步googl sheet（避免每次 key 一下就狂打 API）
function scheduleAutoSync() {
  // 如果還沒設定 Web App，就不做自動同步
  if (!GOOGLE_WEBAPP_URL || GOOGLE_WEBAPP_URL.indexOf("script.google.com") === -1) {
    return;
  }

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  setSyncStatus("有變更，即將自動同步…", "pending");

  // 2 秒內沒有再修改，就自動同步
  autoSyncTimer = setTimeout(() => {
    syncToGoogleSheet(true); // true = 自動模式
  }, 2000);
}



// 依日期分組並呈現
function render() {
  const container = document.getElementById("itemsContainer");
  const listTitleEl = document.getElementById("listTitle");
  container.innerHTML = "";

  let items = [...state.items];

  // 依日期 + 時間排序
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || "").localeCompare(b.time || "");
  });

  // 過濾當日
  if (currentFilterDate) {
    items = items.filter((it) => it.date === currentFilterDate);
    listTitleEl.textContent = `行程列表（${currentFilterDate}）`;
  } else {
    listTitleEl.textContent = "行程列表（全部）";
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "date-empty";
    empty.textContent = currentFilterDate
      ? "這一天目前沒有行程。"
      : "目前尚未新增任何行程。";
    container.appendChild(empty);
    return;
  }

  // 用日期分組
  const byDate = {};
  items.forEach((it) => {
    if (!byDate[it.date]) byDate[it.date] = [];
    byDate[it.date].push(it);
  });

	const dates = Object.keys(byDate).sort();
	dates.forEach((date, idx) => {
    const group = document.createElement("div");
    group.className = "date-group";

    // 根據日期順序輪流上顏色，同一天共用同一色
    const colorIndex = idx % 4; // 對應 CSS 的 date-color-0 ~ 3
    group.classList.add(`date-color-${colorIndex}`);

    const header = document.createElement("div");
    header.className = "date-group-header";

    const title = document.createElement("div");
    title.className = "date-group-title";
    title.textContent = date;

    const count = document.createElement("div");
    count.className = "date-group-count";
    count.textContent = `${byDate[date].length} 則行程`;

    header.appendChild(title);
    header.appendChild(count);
    group.appendChild(header);

    byDate[date].forEach((item) => {
	  const card = document.createElement("div");
	  card.className = "item-card";

	  const headerRow = document.createElement("div");
	  headerRow.className = "item-header";

	  const timeEl = document.createElement("div");
	  timeEl.className = "item-time";
	  timeEl.textContent = item.time || "—";

	  // 左邊：標題 + 地點
	  const mainInfo = document.createElement("div");
	  mainInfo.style.flex = "1 1 auto";

	  const titleEl = document.createElement("div");
	  titleEl.className = "item-title";
	  titleEl.textContent = item.title;

	  const locationEl = document.createElement("div");
	  locationEl.className = "item-location";
	  locationEl.textContent = item.location;

	  mainInfo.appendChild(titleEl);
	  if (item.location) mainInfo.appendChild(locationEl);

	  // 右邊：操作按鈕區（目前只有刪除）
	  const actionsEl = document.createElement("div");
	  actionsEl.className = "item-actions";

	  const delBtn = document.createElement("button");
	  delBtn.type = "button";
	  delBtn.textContent = "刪除";
	  delBtn.className = "item-delete-btn";
	  delBtn.addEventListener("click", () => {
		const ok = confirm(`確定要刪除這筆行程嗎？\n\n[${item.date} ${item.time || ""}]\n${item.title}`);
		if (ok) {
		  deleteItem(item.id);
		}
	  });

	  actionsEl.appendChild(delBtn);

	  // headerRow：時間 / 主資訊 / 操作按鈕
	  headerRow.appendChild(timeEl);
	  headerRow.appendChild(mainInfo);
	  headerRow.appendChild(actionsEl);

	  card.appendChild(headerRow);

	  if (item.note) {
		const noteEl = document.createElement("div");
		noteEl.className = "item-note";
		noteEl.textContent = item.note;
		card.appendChild(noteEl);
	  }

	  group.appendChild(card);
	});


    container.appendChild(group);
  });
}

// 匯出 JSON 檔案
function exportJsonFile() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const safeName = (state.tripName || "travel-plan")
    .replace(/[\\\/:*?"<>|]/g, "_")
    .slice(0, 40);

  a.href = url;
  a.download = `${safeName || "travel-plan"}-${yyyy}${mm}${dd}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ✅ 新增：同步到 Google Sheet
// isAuto = true 代表「自動同步」，不要一直跳 alert
// isAuto = true 代表「自動同步」（少跳 alert）
async function syncToGoogleSheet(isAuto = false) {
  if (!GOOGLE_WEBAPP_URL || GOOGLE_WEBAPP_URL.indexOf("script.google.com") === -1) {
    if (!isAuto) {
      alert("尚未設定有效的 Google Web App URL，請先在 app.js 中設定 GOOGLE_WEBAPP_URL。");
    }
    setSyncStatus("尚未設定 Google Web App URL", "error");
    return;
  }

  if ((!state.items || state.items.length === 0) && !isAuto) {
    const ok = confirm("目前沒有任何行程，仍然要同步（只清空試算表原資料）嗎？");
    if (!ok) return;
  }

  try {
    setSyncStatus("同步中…", "pending");

    const res = await fetch(GOOGLE_WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(state),
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json().catch(() => ({}));

    if (data.ok) {
      lastSyncTime = new Date();
      const timeText = formatTime(lastSyncTime);
      if (!isAuto) {
        alert(`同步完成！已寫入 ${data.count || 0} 筆行程到 Google Sheet。`);
      }
      setSyncStatus(`已同步（${timeText}）`, "ok");
      console.log(`Synced to Google Sheet: ${data.count || 0} items at ${timeText}`);
    } else {
      const msg = "同步失敗：" + (data.message || "不明錯誤");
      if (!isAuto) {
        alert(msg);
      }
      setSyncStatus("同步失敗", "error");
      console.error(msg);
    }
  } catch (err) {
    console.error(err);
    if (!isAuto) {
      alert("同步到 Google Sheet 時發生錯誤：" + err.message);
    }
    setSyncStatus("同步失敗（請查看 console）", "error");
  }
}
