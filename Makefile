zip:
	cd src && zip -r -FS ../container-cloak.zip *

debug:
	web-ext --source-dir src/ run --firefox=nightly
