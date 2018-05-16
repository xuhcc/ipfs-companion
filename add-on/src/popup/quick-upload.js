'use strict'
/* eslint-env browser, webextensions */

const browser = require('webextension-polyfill')
const choo = require('choo')
const html = require('choo/html')
const logo = require('./logo')

document.title = browser.i18n.getMessage('panel_quickUpload')

const app = choo()

app.use(quickUploadStore)
app.route('*', quickUploadPage)
app.mount('#root')

function quickUploadStore (state, emitter) {
  state.message = ''
  state.peerCount = ''
  state.ipfsNodeType = 'external'
  state.wrapWithDirectory = true
  state.pinUpload = true

  function updateState ({ipfsNodeType, peerCount}) {
    state.ipfsNodeType = ipfsNodeType
    state.peerCount = peerCount
  }

  let port

  emitter.on('DOMContentLoaded', async () => {
    // initialize connection to the background script which will trigger UI updates
    port = browser.runtime.connect({name: 'browser-action-port'})
    port.onMessage.addListener(async (message) => {
      if (message.statusUpdate) {
        console.log('In browser action, received message from background:', message)
        updateState(message.statusUpdate)
        emitter.emit('render')
      }
    })
  })

  emitter.on('fileInputChange', async (event) => {
    const file = event.target.files[0]
    try {
      const { ipfsCompanion } = await browser.runtime.getBackgroundPage()

      const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(Buffer.from(reader.result))
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })

      const uploadOptions = {
        wrapWithDirectory: state.wrapWithDirectory,
        pin: state.pinUpload
      }
      const result = await ipfsCompanion.ipfsAddAndShow({
        path: file.name,
        content: buffer
      }, uploadOptions)
      console.log('Upload result', result)

      // close upload tab as it will be replaced with a new tab with uploaded content
      const tab = await browser.tabs.getCurrent()
      browser.tabs.remove(tab.id)
    } catch (err) {
      console.error('Unable to perform quick upload', err)
      // keep upload tab and display error message in it
      state.message = `Unable to upload to IPFS API: ${err}`
      emitter.emit('render')
    }
  })
}

function quickUploadPage (state, emit) {
  const onFileInputChange = (e) => emit('fileInputChange', e)
  const onWrapWithDirectoryChange = (e) => { state.wrapWithDirectory = e.target.checked }
  const onPinUploadChange = (e) => { state.pinUpload = e.target.checked }
  const {peerCount} = state

  return html`
    <div class="montserrat pt5" style="background: linear-gradient(to top, #041727 0%,#043b55 100%); height:100%;">
      <div class="mw8 center pa3 white">
        <header class="flex items-center no-user-select">
          ${logo({
            size: 80,
            path: '../../icons',
            heartbeat: false
          })}
          <div class="pl3">
            <h1 class="f2 fw5 ma0">
              ${browser.i18n.getMessage('panel_quickUpload')}
            </h1>
            <p class="f3 fw2 lh-copy ma0 light-gray">
              ${browser.i18n.getMessage('quickUpload_subhead_peers', [peerCount])}
            </p>
          </div>
        </header>
        <label for="quickUploadInput" class='db relative mt5 hover-inner-shadow' style="border:solid 2px #6ACAD1">
          <input class="db absolute pointer w-100 h-100 top-0 o-0" type="file" id="quickUploadInput" onchange=${onFileInputChange} />
          <div class='dt dim' style='padding-left: 100px; height: 300px'>
            <div class='dtc v-mid'>
              <span class="f3 link dim br1 ph4 pv3 dib white" style="background: #6ACAD1">
                ${browser.i18n.getMessage('quickUpload_pick_file_button')}
              </span>
              <span class='f3'>
                <emph class='underline pl3 pr2 moon-gray'>
                  ${browser.i18n.getMessage('quickUpload_or')}
                </emph>
                ${browser.i18n.getMessage('quickUpload_drop_it_here')}
              </span>
              <p class='f4'>${state.message}</p>
            </div>
          </div>
        </label>
         <!-- TODO: enable wrapping in embedded node after js-ipfs release -->
        ${state.ipfsNodeType === 'external' ? html`
          <div id='quickUploadOptions' class='sans-serif mt3 f6 lh-copy no-user-select' style='color: #6ACAD1'>
              <label for='wrapWithDirectory' class='flex items-center db relative mt1 pointer'>
                <input id='wrapWithDirectory' type='checkbox' onchange=${onWrapWithDirectoryChange} checked=${state.wrapWithDirectory} />
                <span class='mark db flex items-center relative mr2 br2'></span>
                ${browser.i18n.getMessage('quickUpload_options_wrapWithDirectory')}
              </label>
              <label for='pinUpload' class='flex items-center db relative mt1 pointer'>
                <input id='pinUpload' type='checkbox' onchange=${onPinUploadChange} checked=${state.pinUpload} />
                <span class='mark db flex items-center relative mr2 br2'></span>
                ${browser.i18n.getMessage('quickUpload_options_pinUpload')}
              </label>
          </div>
       ` : null}
      </div>
    </div>
  `
}
