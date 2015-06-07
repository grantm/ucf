Unicode Character Finder
========================

This is a simple JavaScript application for searching/browsing Unicode
characters.  You can see it in action at
[http://liip.to/unicode](http://liip.to/unicode).

See the application's built-in help for usage instructions.

Running Locally
---------------

In order to serve a copy of this software from your own web server (or local
disk), after cloning the git repository you will need to run the
`make-data-file` script, which downloads the XML Unicode Character Database
files from Unicode.org and produces a much smaller summary data file.

Before running the make-data-file script, you'll need to install a few
dependencies.  On Debian/Ubuntu, you can install these packages:

    sudo apt-get install libwww-perl libarchive-zip-perl libxml-sax-expat-perl

If you're installing direct from CPAN, these are the modules you'll need:

* libwww-perl
* Archive::Zip
* XML::SAX::Expat

The first time you run the script, you'll need to provide the `--download`
option:

    ./make-data-file --download

This will download the latest data files from Unicode.org.  If you're modifying
the script and re-running it, you don't need to provide `--download` each time.

For more information about the script and the format of the file it produces,
use the `--help` option.

If you have trouble installing dependencies or running the script, you can
always just [grab the data file from the web site](http://www.mclean.net.nz/ucf/char-data-nounihan.txt)



Copyright and Licence
---------------------

Copyright (C) 2010-2015 [Grant McLean](http://grantm.github.io/)

This program is free software; you can redistribute it and/or modify it
under the terms of the
[GNU Affero General Public License](http://www.fsf.org/licensing/licenses/agpl-3.0.html).

