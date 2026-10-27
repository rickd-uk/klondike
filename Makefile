# make dist       build dist/ (web/ plus the index card) for deploy-game
# make serve      serve dist/web on http://127.0.0.1:8080
# make deploy     deploy to https://klondike.games.rickd.dev/ with deploy-game
HOST ?= KAG
DEPLOY_GAME ?= $(HOME)/Documents/D/WEB/LIVE/MAIN/GAMES/GNRL/DOMAIN/*.games/bin/deploy-game
VERSION := $(shell git describe --always --dirty 2>/dev/null || date +%s)

# Court card art in cards/ gets ?v=VERSION (via ASSET_VERSION) so browsers
# refetch it after a deploy; index.html itself stays runnable from the folder.
dist:
	rm -rf dist && mkdir -p dist/web
	sed "s/const ASSET_VERSION = '';/const ASSET_VERSION = '?v=$(VERSION)';/" index.html > dist/web/index.html
	mkdir -p dist/web/cards && cp cards/*.svg dist/web/cards/
	# nginx serves these .gz copies to browsers that accept gzip (gzip_static on)
	gzip -9 -k dist/web/index.html dist/web/cards/*.svg
	cp deploy/meta.json deploy/icon.svg dist/

serve:
	cd dist/web && python3 -m http.server 8080 --bind 127.0.0.1

deploy: dist
	"$(DEPLOY_GAME)" klondike $(HOST) dist

.PHONY: dist serve deploy
