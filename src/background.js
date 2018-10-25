const FIREFOX_DEFAULT_COOKIE_STORE = "firefox-default";
const APPLICABLE_PROTOCOLS = ["http:", "https:"];

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
  browser.sessions.setTabValue(tab.id, 'cloaked', false);
  console.log("Tab "+tab.id+" is now restored");
}

async function actuallyCloak(tab) {
  //Change tab title
  //blackout page contents
  var getContext = await browser.contextualIdentities.get(tab.cookieStoreId);
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

  await browser.sessions.setTabValue(tab.id, "cloaked", true);
  console.log("tab "+tab.id+" is now cloaked");
}

async function cloak(tab) {
  // go through all containers for this jar and cloak em
  if (tab.cookieStoreId == FIREFOX_DEFAULT_COOKIE_STORE) {
    console.log("Won't cloak default cookie store!");
    return;
  }

  // Go through all tabs and find the ones with our cookie store/container so we cloak all of them
  let tabs = await browser.tabs.query({cookieStoreId: tab.cookieStoreId});
  for (let ctab of tabs) {
    if (tab.cookieStoreId == ctab.cookieStoreId) {
      let state = await browser.sessions.getTabValue(ctab.id, "cloaked");
      console.log(state);
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

function protocolIsApplicable(url) {
  var anchor =  document.createElement('a');
  anchor.href = url;
  return APPLICABLE_PROTOCOLS.includes(anchor.protocol);
}

// Apply page action to all tabs on startup
var gettingAllTabs = browser.tabs.query({});
gettingAllTabs.then((tabs) => {
  for (let tab of tabs) {
    initializePageAction(tab);
  }
});

browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  initializePageAction(tab);
});

browser.pageAction.onClicked.addListener(cloak);
