# Changelog

## [1.3.0](https://github.com/Grimothy/alfred/compare/alfred-v1.2.0...alfred-v1.3.0) (2026-04-12)


### Features

* custom collections — TMDB discover, item management, and filter persistence ([e57c86d](https://github.com/Grimothy/alfred/commit/e57c86d2032afb4350a44341666498c5dadfdf3d))
* enrich TMDB items with genres and vote_average for filtering ([1599414](https://github.com/Grimothy/alfred/commit/15994143da00e80c7b650849e58e0e7228067637))
* start search immediately when adding to Sonarr/Radarr ([63ff322](https://github.com/Grimothy/alfred/commit/63ff32248eea5304e7cabadf2b664939381df6fe))


### Bug Fixes

* capture enriched TmdbDiscoveryItem results — previous commit ignored return value so API never received genres/vote_average ([cb05a20](https://github.com/Grimothy/alfred/commit/cb05a20a3f3aaa949aa572d74bac2c9b65278652))
* enable automatic search when adding movies to Radarr ([365fd8f](https://github.com/Grimothy/alfred/commit/365fd8fb70f1473666d871be972fbdf01583fc81))
* hide TMDB items when genre/rating filters active (no data to match) ([4f17531](https://github.com/Grimothy/alfred/commit/4f17531c2a5086e724cdd43f36fbf8289bafe78e))
* radarr error handler - parse Radarr's actual error response formats (string, array, message field) ([ce1e911](https://github.com/Grimothy/alfred/commit/ce1e9118283cbb1e913807a7a9f62eaf734bf9aa))
* TMDB items no longer excluded by genre/rating filter checks ([7ec5b54](https://github.com/Grimothy/alfred/commit/7ec5b549877ccaa00205c868ff23261fbf227fe0))
* TMDB not-in-collection items no longer hidden by genre/rating filters ([6ec01c5](https://github.com/Grimothy/alfred/commit/6ec01c5cbc77c1023e0862a386316719c02c63ca))

## [1.2.0](https://github.com/Grimothy/alfred/compare/alfred-v1.1.0...alfred-v1.2.0) (2026-04-10)


### Features

* add search, filter, and sort to collections page ([3bad9a0](https://github.com/Grimothy/alfred/commit/3bad9a0c8c0f954f2942793f69aae51648a639e2))
* add search, filter, and sort to collections page ([35a37cb](https://github.com/Grimothy/alfred/commit/35a37cbe861a9ccba10db398614d5bde683736c5))
* add toolbar styles for collections search, filter, and sort controls ([b6ef957](https://github.com/Grimothy/alfred/commit/b6ef9576cf691112a5c8f4c67025c580516c2fcd))
* rich media detail pages with TMDB data, Sonarr/Radarr integration, and season availability ([3066ba9](https://github.com/Grimothy/alfred/commit/3066ba9c58f307303d9be1edacce3e735ad958eb))


### Bug Fixes

* **ci:** only run build pipeline on PRs and releases, not every commit ([0def006](https://github.com/Grimothy/alfred/commit/0def006704eb1077d0946cfdf883936c1631f8e6))

## [1.1.0](https://github.com/Grimothy/alfred/compare/alfred-v1.0.3...alfred-v1.1.0) (2026-04-10)


### Features

* add /api/version endpoint, display dynamically in UI ([74b55b1](https://github.com/Grimothy/alfred/commit/74b55b18239049dffb2eea76f38cfcf7b630aa89))

## [1.0.3](https://github.com/Grimothy/alfred/compare/alfred-v1.0.2...alfred-v1.0.3) (2026-04-09)


### Bug Fixes

* use named Docker volume for data persistence ([f73d1b3](https://github.com/Grimothy/alfred/commit/f73d1b31b5f3a2250adaa9d40b03cd9591172a5f))

## [1.0.2](https://github.com/Grimothy/alfred/compare/alfred-v1.0.1...alfred-v1.0.2) (2026-04-09)


### Bug Fixes

* handle Emby's mixed-case Imdb provider ID in TMDB matching ([0eebf12](https://github.com/Grimothy/alfred/commit/0eebf1273bff95d3b331b3b3b06c9174c277081e))

## [1.0.1](https://github.com/Grimothy/alfred/compare/alfred-v1.0.0...alfred-v1.0.1) (2026-04-09)


### Bug Fixes

* correct release-please manifest format and workflow triggers ([6b81c4f](https://github.com/Grimothy/alfred/commit/6b81c4f69c4d677e72d780fccf765f742ed3f924))

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- Prevent release-please from adding entries above this line. -->
