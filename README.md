# OPDS for ABS

OPDS-Server for ABS (Audiobookshelf) is a working OPDS server that can be used with Audiobookshelf (and was created by a proof of concept). It is designed to work with the Audiobookshelf API and provides a way to access your books via OPDS.

## Features

- [x] OPDS
- [x] Searching
- [x] Pagination
- [x] Multiple Users
- [x] ABS authentication or legacy API authentication
- [x] Books by Author
- [x] Books by Narrator
- [x] Books by Genre/Tags
- [x] Books by Series
- [x] Optional card pagination (A, B, C, ...) instead of author, narrator, etc. names directly.

\*1 If the user is not specified in the ENVs, the system will automatically try to authenticate against ABS.

## Tested with

- [x] Thorium
- [x] Moon+ Reader

## Built-In Demo

Spin up the provided Docker Compose instance and add `http://<local-server-ip>:3010` to your OPDS reader and type in the credentials `demotest` for both username and password.


## ENVs

The following environment variables can be set in a `.env` file or directly in your Docker Compose setup.

| Variable         | Description                                                                 | Default               | Required |
|------------------|-----------------------------------------------------------------------------|-----------------------|----------|
| ABS_URL          | Your Audiobookshelf server URL, e.g. https://audiobooks.dev                |                       | Yes      |
| SHOW_AUDIOBOOKS  | Show audiobooks in the OPDS feed.                                          | false                 | No       |
| SHOW_CHAR_CARDS  | Show character cards (A, B, C, ...) before showing names of author, narrator, etc. | false                 | No       |
| USE_PROXY        | Use a proxy to connect to ABS. If you use the docker network, set this to true to view covers in your reader. Creates potential security risks if someone can read the RAM of the software. | false                 | No       |
| PORT             | The port the OPDS server will run on.                                      | 3010                  | No       |
| OPDS_PAGE_SIZE   | Number of items on each page in the OPDS feed.                             | 20                    | No       |
| OPDS_USERS       | Comma-separated list of users in the format `username:ABS_API_TOKEN:password`. This does NOT need to be your ABS username and password, but values you can freely set to log in with your reader. |                       | No       |

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
