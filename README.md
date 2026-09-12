# OPDS for ABS

OPDS-Server for ABS (Audiobookshelf) is a working OPDS server that can be used with Audiobookshelf (and was created by a proof of concept). It is designed to work with the Audiobookshelf API and provides a way to access your books via OPDS.

## Features

- [x] OPDS
- [x] Searching (case-insensitive substring match over title, author, description, publisher, ISBN and tags)
- [x] Pagination
- [x] Multiple Users
- [x] ABS authentication or legacy API authentication
- [x] Books by Recently Added
- [x] Books by Author
- [x] Books by Narrator
- [x] Books by Genre/Tags
- [x] Books by Series
- [x] Optional card pagination (A, B, C, ...) instead of author, narrator, etc. names directly.

\*1 If the user is not specified in the ENVs, the system will automatically try to authenticate against ABS.

## Tested with

- [x] Thorium
- [x] Moon+ Reader
- [x] KOReader\*

\*For KOReader: must input URL as `http://<user>:<password>@example.com/opds` and leave authentication forms blank

## Built-In Demo

Spin up the provided Docker Compose instance and add `http://<local-server-ip>:3010/opds` to your OPDS reader and type in the credentials `test` for both username and password.

## ENVs

The following environment variables can be set in a `.env` file or directly in your Docker Compose setup.

| Variable        | Description                                                                                                                                                                                       | Default        | Required |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- |
| ABS_URL         | Your Audiobookshelf server URL, e.g. https://audiobooks.dev. Must be a valid http/https URL; the server exits at startup if it is not. The default only works if ABS runs on the same host on port 3000. | `http://localhost:3000` | No |
| SHOW_AUDIOBOOKS | Show audiobooks in the OPDS feed. When disabled, top-level libraries/categories with no ebook items are hidden.                                                                                   | false          | No       |
| SHOW_CHAR_CARDS | Show character cards (A, B, C, ...) before showing names of author, narrator, etc.                                                                                                                | false          | No       |
| OPDS_CATEGORIES | Comma-separated categories to show in the listed order: `all`, `recent`, `authors`, `narrators`, `genres`, `series`. If unset, all categories are shown in the default order.                     | all categories | No       |
| USE_PROXY       | Serve covers and downloads through this server instead of linking to ABS directly. Set this to true if you use the docker network, so covers load in your reader. The proxy only forwards to `ABS_URL` and will not fetch any other host. Your ABS token is held in memory, so it is exposed to anyone able to read the process memory. | false          | No       |
| PORT            | The port the OPDS server will run on.                                                                                                                                                             | 3010           | No       |
| OPDS_PAGE_SIZE  | Number of items on each page in the OPDS feed.                                                                                                                                                    | 20             | No       |
| OPDS_USERS      | Comma-separated list of users in the format `username:ABS_API_TOKEN:password`. This does NOT need to be your ABS username and password, but values you can freely set to log in with your reader. Entries missing any of the three fields are skipped with a warning. |                | No       |
| CACHE_EXPIRATION | Amount of time to cache requests, in seconds                                                                                                                                       | 3600           | No       |
| NODE_ENV        | Set to `development` for verbose authentication and proxy debug logging. Use `production` when deploying.                                                                                          |                | No       |

Boolean variables (`SHOW_AUDIOBOOKS`, `SHOW_CHAR_CARDS`, `USE_PROXY`) accept `true`/`1`/`yes` and
`false`/`0`/`no`, case-insensitively. Numeric variables (`PORT`, `OPDS_PAGE_SIZE`,
`CACHE_EXPIRATION`) must be positive integers. Any value that cannot be parsed is ignored with a
warning on startup and the default is used, so a typo will not silently disable caching or paging.

## Attribution

Thanks to [Martin Joneš](https://github.com/jondycz) for helping with some features and adding this to TrueNas.

> [!IMPORTANT]
> This project began as a proof of concept (PoC) created several months before the development of [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS). They had packed their OPDS server with docker which I found so nice, that I decided to share my old PoC as well with that method.
>
> - Original commit reference: [Commit 94b74b2a0f44cd210ca909109f52e52480468712](https://github.com/Vito0912/audiobookshelf/commit/94b74b2a0f44cd210ca909109f52e52480468712)
> - I modified my stale PR after seeing the [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS) project and packaged this progress for sharing so that work does not need to be done twice. I also took inspiration from their auth system and adding a third value for Basic Auth once it is implemented.
> - On the long run I want to make a PR to ABS to add this directly again

## About

This repository contains a modified version of my earlier work intended to integrate OPDS directly into ABS by adding it as an extra server component. Please note that while ABS is undergoing backend changes, further modifications will be required to fully integrate OPDS functionality.
I plan to add these once the refactoring is finished. This can take months or years.

## Docker Compose

See `docker-compose.yml` for an example setup.

## Development

```bash
pnpm install
pnpm dev        # run from source with watch mode
pnpm typecheck  # tsc --noEmit
pnpm test       # node:test suite, no extra dependencies
pnpm format     # prettier
pnpm build      # compile to dist/
```

`pnpm start` runs the TypeScript sources directly. The Docker image compiles in a separate build
stage and ships only the runtime dependencies.

## License

Licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
