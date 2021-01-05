const flat = (arr) =>
  arr.reduce((a, b) => (Array.isArray(b) ? [...a, ...flat(b)] : [...a, b]), []);

console.log("bye tabs");

const TICK = 5000;

const MAX_TAB_LIFE = 120000;

async function getWindows() {
  return new Promise(function (resolve, reject) {
    chrome.windows.getAll((windows) => {
      resolve(windows);
    });
  });
}

async function getTabsByWindow(windowId) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.getAllInWindow(windowId, (tabs) => {
      resolve(tabs);
    });
  });
}

async function getAllTabs() {
  return new Promise(async function (resolve, reject) {
    const windows = await getWindows();
    const proms = await Promise.all(windows.map((w) => getTabsByWindow(w.id)));
    resolve(flat(proms));
  });
}

async function getTabById(id) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.get(id, resolve);
  });
}

const procs = {};

async function initTabProc(tab) {
  const excludedDomains = await getExcludedDomains();
  let isExcluded = false;
  try {
    const u =
      tab.status === "loading" ? new URL(tab.pendingUrl) : new URL(tab.url);
    isExcluded = excludedDomains.indexOf(u.host) !== -1;
  } catch (e) {
    console.log(`Failed to parse URL: ${tab.url} on `, tab);
    console.log(e);
  }
  procs[tab.id] = {
    idleTime: 0,
    isExcluded,
    tab,
  };
}

async function getExcludedDomains() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("exclude", (obj) => resolve(obj["exclude"] || []));
  });
}

async function excludeDomain(domain) {
  const excludedDomains = await getExcludedDomains();
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ exclude: [...excludedDomains, domain] }, resolve);
  });
}

function isTabActive(tab) {
  if (tab.active) return true; // active tabs
  if (tab.audible) return true; // tabs playing audio
  if (tab.pinned) return true; // pinned tabs
  if (tab.incognito) return true; // tabs in incognito mode
  if (procs[tab.id].isExcluded) return true; // tabs we've already excluded (this reduces storage calls)

  return false;
}

function makeTabAlive(tab) {
  procs[tab.id].idleTime = 0;
}

async function killTab(tab) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tab.id, () => resolve());
  });
}

async function killTabALittle(tab) {
  const proc = procs[tab.id];
  proc.idleTime += TICK;
  if (proc.idleTime > MAX_TAB_LIFE) {
    await killTab(tab);
  }
}

async function processTab(tab) {
  if (!procs[tab.id]) {
    await initTabProc(tab);
    return;
  }

  if (isTabActive(tab)) {
    makeTabAlive(tab);
  } else {
    await killTabALittle(tab);
  }
}

function clearRemovedTabs(tabs) {
  const tabIds = Object.fromEntries(tabs.map((t) => [t.id, true]));
  for (let id in procs) {
    if (!tabIds[id]) delete procs[id];
  }
}

async function processAllTabs() {
  const tabs = await getAllTabs();
  for (let tab of tabs) {
    await processTab(tab);
  }
  clearRemovedTabs(tabs);
}

async function main() {
  setInterval(async () => {
    processAllTabs();
  }, TICK);

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await getTabById(tabId);
    processTab(tab);
  });

  await processAllTabs();
}

main();
