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

const procs = {};

function initTabProc(tab) {
  procs[tab.id] = {
    idleTime: 0,
  };
}

function isTabActive(tab) {
  if (tab.active) return true;
  if (tab.audible) return true;
  if (tab.pinned) return true;
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
    initTabProc(tab);
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
}

main();
