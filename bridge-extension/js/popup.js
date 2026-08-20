const enabled = document.getElementById("enabled");
const demo = document.getElementById("demo");
const statusEl = document.getElementById("stack-status");

chrome.storage.local.get({ enabled: true }, (data) => {
  enabled.checked = data.enabled;
});

enabled.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabled.checked });
});

demo.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/demo-store.html") });
});

chrome.runtime.sendMessage({ type: "CHECK_BACKEND" }, (response) => {
  if (!statusEl) return;
  if (!response || response.error) {
    statusEl.textContent = "Backend offline · start bridge-backend on :4000";
    statusEl.dataset.state = "down";
    return;
  }
  const model = response.risk && response.risk.model ? response.risk.model : "bridge-ml";
  const riskOn = response.risk && response.risk.enabled !== false;
  statusEl.textContent = riskOn
    ? `API + ML connected · ${model}`
    : `API up · risk scoring off · ${model}`;
  statusEl.dataset.state = "up";
});
