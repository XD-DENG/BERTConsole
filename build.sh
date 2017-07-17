
# we now always set this; to build debug run directly.

export NODE_ENV=production

# jic
mkdir -p build

# clean
rm -fr build/*
rm -fr bert-shell-win32-ia32

# copy
cp -r ext src theme index.html index.js package.json yarn.lock build/

# install node modules.  note this is always production.
cd build
yarn install --production

# we're not caching, so clean up
rm yarn.lock

# TEMP: patch r language tokenizer
cp ../r-patched.js node_modules/monaco-editor/min/vs/basic-languages/src/r.js

# now package
cd ..
node_modules/.bin/electron-packager build --platform=win32 --arch=ia32 --icon=icon.ico
