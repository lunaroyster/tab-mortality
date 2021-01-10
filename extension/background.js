const flat = (arr) =>
  arr.reduce((a, b) => (Array.isArray(b) ? [...a, ...flat(b)] : [...a, b]), []);

console.log("bye tabs");

const TICK = 1000;

const MAX_TAB_LIFE = 120000;

// Wrappers
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

// Excluded domains

async function getExcludedDomains() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("exclude", (obj) => resolve(obj["exclude"] || []));
  });
}

async function excludeDomain(domain) {
  const excludedDomains = await getExcludedDomains();
  const res = await new Promise((resolve, reject) => {
    chrome.storage.sync.set({ exclude: [...excludedDomains, domain] }, resolve);
  });
  for (let id in procs) {
    // TODO: we should only delete/update the specific tab here, especially if we increase MAX_TAB_LIFE
    delete procs[id];
  }
  return res;
}

// Procs
const procs = {};

class Proc {
  constructor(tabId, tab) {
    this.id = tabId;
    this.idleTime = 0;
    this.setTab(tab);
  }
  async setTab(tab) {
    this.tab = tab;
    this.isExcluded = await this.getIsExcluded();
  }
  async getTab() {
    const tab = await getTabById(this.id);
    this.tab = tab;
    return tab;
  }
  async getIsExcluded() {
    const tab = this.tab;
    const excludedDomains = await getExcludedDomains();
    let isExcluded = false;
    try {
      const u = tab.pendingUrl ? new URL(tab.pendingUrl) : new URL(tab.url);
      isExcluded = excludedDomains.indexOf(u.host) !== -1;
    } catch (e) {
      console.log(`Failed to parse URL: ${tab.url} on `, tab);
      console.log(e);
    }
    this.isExcluded = isExcluded;
    return isExcluded;
  }
  async isActive() {
    const tab = await this.getTab();
    if (tab.active) return true; // active tabs
    if (tab.audible) return true; // tabs playing audio
    if (tab.pinned) return true; // pinned tabs
    if (tab.incognito) return true; // tabs in incognito mode
    if (this.isExcluded) return true; // tabs we've already excluded (this reduces storage calls)

    return false;
  }
  makeAlive() {
    this.idleTime = 0;
  }
  async kill() {
    return new Promise((resolve, reject) => {
      chrome.tabs.remove(this.tab.id, () => resolve());
    });
  }
  async killALittle() {
    this.idleTime += TICK;
    if (this.idleTime > MAX_TAB_LIFE) {
      await this.kill();
    }
  }
  static async from(tab) {
    const proc = new Proc(tab.id, tab);
    await proc.getIsExcluded();
    return proc;
  }
}

// Main process

async function processTab(tab) {
  if (!procs[tab.id]) {
    const proc = await Proc.from(tab);
    procs[tab.id] = proc;
    return;
  }

  const proc = procs[tab.id];

  if (await proc.isActive()) {
    proc.makeAlive();
  } else {
    proc.killALittle();
  }
}

async function processAllTabs() {
  const tabs = await getAllTabs();
  for (let tab of tabs) {
    await processTab(tab);
  }
}

async function main() {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await getTabById(tabId);
    processTab(tab);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changes, tab) => {
    processTab(tab);
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    delete procs[tabId];
  });

  setInterval(async () => {
    processAllTabs();
  }, TICK);

  await processAllTabs();
}

main();
