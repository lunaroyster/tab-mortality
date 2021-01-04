const flat = (arr) =>
  arr.reduce((a, b) => (Array.isArray(b) ? [...a, ...flat(b)] : [...a, b]), []);

console.log("bye tabs");

const TICK = 5000;

const MAX_TAB_LIFE = 300000;

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
  })
}

const procs = {};

async function initTabProc(tab) {
  const excludedDomains = await getExcludedDomains();
  const u = new URL(tab.url);
  const isExcluded = excludedDomains.indexOf(u.host) !== -1;
  procs[tab.id] = {
    idleTime: 0,
    isExcluded,
  };
}

async function getExcludedDomains() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get('exclude', (obj) => resolve(obj['exclude']));
  })
}

async function excludeDomain(domain) {
  const excludedDomains = await getExcludedDomains();
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({exclude: [...excludedDomains, domain]}, resolve);
  })
}

function isTabActive(tab) {
  if (tab.active) return true;
  if (tab.audible) return true;
  if (tab.pinned) return true;
  if (procs[tab.id].isExcluded) return true;

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

async function main() {
  setInterval(async () => {
    const tabs = await getAllTabs();
    for (let tab of tabs) {
      await processTab(tab);
    }
  }, TICK);
  
  chrome.tabs.onActivated.addListener(async ({tabId}) => {
    const tab = await getTabById(tabId);
    processTab(tab);
  });
}

main();
