# apple-membercenter-devices
Does
====
Shows expirations for Apple Member Center programs, certificates, profiles. 

Requires
========
casperjs
MacOSX
------
brew install casperjs --devel
Linux
-----
- wget https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-1.9.7-linux-x86_64.tar.bz2
- tar -xvf phantomjs-1.9.7-linux-x86_64.tar.bz2
- sudo mv phantomjs-1.9.7-linux-x86_64 /usr/local/src/phantomjs
- sudo ln -sf /usr/local/src/phantomjs/bin/phantomjs /usr/local/bin/phantomjs
- cd /usr/local/src/
- sudo git clone git://github.com/n1k0/casperjs.git
- sudo ln -sf /usr/local/src/casperjs/bin/casperjs /usr/local/bin/casperjs

Universal
---------
npm install -g phantomjs@1.9.7-15 casperjs

Run
===
casperjs --ssl-protocol=tlsv1 apple-membercenter-expires.js
