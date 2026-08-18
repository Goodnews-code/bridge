const enabled = document.getElementById("enabled");
const demo = document.getElementById("demo");

chrome.storage.local.get({ enabled: true }, (data) => {
  enabled.checked = data.enabled;
});

enabled.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabled.checked });
});

demo.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/demo-store.html") });
});
