
const {app, BrowserWindow, ipcMain} = require('electron')
const windowStateKeeper = require('electron-window-state');

// flag opens devtools automatically, useful for debug
let devtools = false;

process.argv.forEach( function( arg, index ){
  if( arg === "--devtools" ) devtools = true;
  if( arg === "--pipename" ){
    process.env.BERT_PIPE_NAME = process.argv[index+1];
  }
})

let mainWindow, mainWindowState;

function createWindow () {

  mainWindowState = windowStateKeeper({
    defaultWidth: 1300,
    defaultHeight: 750
  });
  
  mainWindow = new BrowserWindow({
    'x': mainWindowState.x,
    'y': mainWindowState.y,
    'width': mainWindowState.width,
    'height': mainWindowState.height
  });
  mainWindowState.manage(mainWindow);
  
	mainWindow.loadURL(`file://${__dirname}/index.html`);
	if( devtools ) mainWindow.webContents.openDevTools();

	mainWindow.on('closed', function () {
		mainWindow = null;
	});
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', function () {
	if (mainWindow === null) {
		createWindow();
	}
});

ipcMain.on('download', function(event, opts = {}){

	let url = opts.url;
	let dest = opts.destfile;
	let listener = function(event, item, webContents){
		
		let totalBytes = item.getTotalBytes();
		let filePath = dest || path.join(app.getPath('downloads'), item.getFilename());

		// NOTE: this fails with unix-y paths.  R is building these paths incorrectly

		if( process.platform === "win32" ){
			filePath = filePath.replace( /\//g, "\\" );
		}
		item.setSavePath(filePath);

		item.on('updated', () => {

      console.info( 'updated', arguments );

      mainWindow.setProgressBar(item.getReceivedBytes() / totalBytes);
			webContents.send( 'download-progress', { received: item.getReceivedBytes(), total: totalBytes });
		});

		item.on('done', (e, state) => {

      console.info( 'done', arguments );

			if (!mainWindow.isDestroyed()) {
				mainWindow.setProgressBar(-1);
			}

			if (state === 'interrupted') {
				// electron.dialog.showErrorBox('Download error', `The download of ${item.getFilename()} was interrupted`);
			}

			webContents.send( 'download-complete', { path: filePath, name: item.getFilename(), size: totalBytes, state: state });
			webContents.session.removeListener('will-download', listener);
			
		});

	};
	
	mainWindow.webContents.session.on( 'will-download', listener );
	mainWindow.webContents.downloadURL(url);
	
});


