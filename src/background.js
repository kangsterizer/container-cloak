const FIREFOX_DEFAULT_COOKIE_STORE = "firefox-default";
const APPLICABLE_PROTOCOLS = ["http:", "https:"];
var CURRENTLY_CLOAKED = []; // runtime state (vs session saved state)

function onCreated() {
  if (browser.runtime.lastError) {
    console.log(`Error: ${browser.runtime.lastError}`);
  } else {
    console.log("Item created successfully");
  }
}

async function restoreCloak(tab) {
  var restorePage = `
  document.body.style = saved_to_uncloak;
  document.title = saved_title_to_uncloak;
  `

  browser.tabs.executeScript(tab.id, {
    code: restorePage
  });

  chrome.tabs.executeScript(tab.id, {
    code: `
      Array.prototype.slice.call(document.querySelectorAll("link[rel~=icon]")).forEach(function(l){
        l.href = l.saved_href;
      });
    `
  });
  await browser.tabs.update(tab.id, {muted: false});
  await browser.sessions.setTabValue(tab.id, 'cloaked', false);
  CURRENTLY_CLOAKED = CURRENTLY_CLOAKED.filter(item => item !== tab.id);
  console.log("Tab "+tab.id+" is now restored");
}

async function actuallyCloak(tab) {
  if (CURRENTLY_CLOAKED.includes(tab.id)) {
    //no need to do anything here
    return;
  }
  try {
    var getContext = await browser.contextualIdentities.get(tab.cookieStoreId);
  } catch {
    var getContext = {name: 'default'}
  }
  var blackPageOut = `
  // Save things to restore them later
  var saved_to_uncloak = document.body.style;
  var saved_title_to_uncloak = document.title;

  // Blur page out
  document.body.style.filter = "blur(50px)";
  document.body.background = "#500";

  // Change tab title
  document.title = "Cloaked <`+getContext.name+`>";
  `;

  await browser.tabs.executeScript(tab.id, {
    code: blackPageOut,
  });

  // Fav icon
  var faviconURL = browser.runtime.getURL("48-favicon.png");

  chrome.tabs.executeScript(tab.id, {
    code: `
      // If no favicon exist, add one. I don't actually know why it's necessary, some Firefox shenanigans
      if (!document.querySelector("link[rel~=icon]")) {
        document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="`+tab.favIconURL+`">');
      }
      Array.prototype.slice.call(document.querySelectorAll("link[rel~=icon]")).forEach(function(l){
        l.saved_href = l.href;
        l.href = "`+faviconURL+`";
      });
    `});

  await browser.tabs.update(tab.id, {muted: true});
  await browser.sessions.setTabValue(tab.id, "cloaked", true);
  CURRENTLY_CLOAKED.push(tab.id);
  console.log("tab "+tab.id+" is now cloaked");
}

async function cloak(tab) {
  // Go through all tabs and find the ones with our cookie store/container so we cloak all of them
  let tabs = await browser.tabs.query({cookieStoreId: tab.cookieStoreId});
  for (let ctab of tabs) {
    if (tab.cookieStoreId == ctab.cookieStoreId) {
      let state = await browser.sessions.getTabValue(ctab.id, "cloaked");
      if (state) {
        console.log("Will restore cloak tab: "+ctab.id);
        restoreCloak(ctab);
      } else {
        console.log("Will actually cloak tab: "+ctab.id);
        actuallyCloak(ctab);
      }
    }
  }
}
function initializePageAction(tab) {
  if (protocolIsApplicable(tab.url)) {
    browser.pageAction.setIcon({tabId: tab.id, path: "48-favicon.png"});
    browser.pageAction.setTitle({tabId: tab.id, title: "Cloak this page"});
    browser.pageAction.show(tab.id);
  }
}

async function initializeCloak(tab) {
  let state = await browser.sessions.getTabValue(tab.id, "cloaked");
  if (state) {
    actuallyCloak(tab.id);
  }
}

function protocolIsApplicable(url) {
  var anchor =  document.createElement('a');
  anchor.href = url;
  return APPLICABLE_PROTOCOLS.includes(anchor.protocol);
}

async function beforeRequest(details) {
  let state = await browser.sessions.getTabValue(details.tabId, "cloaked");
  if (state) {
    console.log("this is a hidden tab, reloading is forbidden");
    return {cancel: true};
  }
  return {cancel: false};
}

// Apply page action to all tabs on startup
var gettingAllTabs = browser.tabs.query({});
gettingAllTabs.then((tabs) => {
  for (let tab of tabs) {
    initializePageAction(tab);
    initializeCloak(tab);
  }
});

browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  initializePageAction(tab);
});
browser.webRequest.onBeforeRequest.addListener(beforeRequest, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);
browser.pageAction.onClicked.addListener(cloak);
