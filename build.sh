
# we now always set this; to build debug run directly.

export NODE_ENV=production

# clean
rm -fr build/*
rm -fr bert-console-win32-ia32

# copy
cp -r ext src theme index.html index.js package.json build/

# install node modules.  note this is always production.
cd build
yarn install --production

# now package
cd ..
node_modules/.bin/electron-packager build --platform=win32 --arch=ia32 --icon=icon.ico
