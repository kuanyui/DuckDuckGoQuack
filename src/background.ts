import { MyStorage, SearchEngine, CurrentState, ENGINES, isUrlSupported, TypedMsg, getEngineObjOfUrl, storageManager, search_engine_t } from "./common";

browser.runtime.onMessage.addListener((_ev: any) => {
    const ev = _ev as TypedMsg
    const reply = (r: TypedMsg) => Promise.resolve(r)
    switch (ev.type) {
        case 'getEnabledEnginesFromBg': return reply({ type: ev.type, data: getEnabledEngines()  })
    }
})

const STORAGE: MyStorage = storageManager.getDefaultData()

function getEnabledEngines (): SearchEngine[] {
    return ENGINES.filter(en => STORAGE.enabledEngines.includes(en.id))
}


async function getCurrentState (tabId: number, currentUrl?: string): Promise<CurrentState | null> {
    if (!currentUrl) {return null}
    const engines = getEnabledEngines()
    if (!isUrlSupported(currentUrl)) { return null }
    const engine = getEngineObjOfUrl(currentUrl)
    if (!engine) { console.error('[To Developer] This should not happened'); return null}
    let curIdx = engines.indexOf(engine)
    if (curIdx === -1) {
        curIdx = 0
    }
    const curEng = engines[curIdx]
    let keyword: string = 'ERROR'
    if (curEng.queryNeedContentScript) {
        console.log('Send to tab...')
        try {
            const msg: TypedMsg = { type: 'getQueryStringFromPage', data: '' }
            const res = await browser.tabs.sendMessage(tabId, msg) as TypedMsg
            if (res.type === 'getQueryStringFromPage') {
                keyword = res.data
            }
        } catch (err) {
            // If error, it means content_script doesn't run or respond
            console.error('Encounter an unexpected error, please report. Sorry!')
        }
    } else {
        const urlObj = new URL(currentUrl)
        const params = new URLSearchParams(urlObj.search)
        keyword = params.get(curEng.queryKey) || ''
        console.log('keyword ===', urlObj)
    }
    const nextEng = engines[(curIdx + 1) % engines.length]
    return {
        keyword: keyword,
        currentEngine: curEng,
        nextEngine: nextEng
    }
}


async function goToNextEngine (tab: browser.tabs.Tab) {
    if (!tab.id) { console.error('ERROR: What the snap?'); return }
    const state = await getCurrentState(tab.id, tab.url)
    if (!state) {return}
    browser.tabs.update(tab.id, {
        url: state.nextEngine.queryUrl.replace(/{}/, state.keyword)
    })
}

browser.pageAction.onClicked.addListener(function (tab) {
    goToNextEngine(tab)
})

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        // console.log(tabId, changeInfo)
        if (isUrlSupported(changeInfo.url)) {
            browser.pageAction.show(tabId)
        } else {
            browser.pageAction.hide(tabId)
        }
    }
});

// Storage
console.log('[background] first time to get config from storage')
storageManager.getData().then((obj) => {
    Object.assign(STORAGE, obj.enabledEngines)
})

storageManager.onDataChanged((changes) => {
    console.log('[background] storage changed!', changes)
    STORAGE.enabledEngines = changes.enabledEngines.newValue
})
