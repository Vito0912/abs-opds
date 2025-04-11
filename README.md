# OPDS for ABS

OPDS-Server for ABS (Audiobookshelf) is a proof of concept for an OPDS server that can be used with Audiobookshelf. It is designed to work with the Audiobookshelf API and provides a way to access your books via OPDS.

## Features
- [x] OPDS
- [x] Searching
- [x] Pagination
- [x] Multiple Users
- [ ] OPDS Authentication
- [ ] Books by Author
- [ ] Books by Narrator

## Tested with
- [x] Thorium

## Built-In Demo
Spin up the provided Docker Compose instance and add `http://<local-server-ip>:3010` to your OPDS reader to see a selection of books.

> [!IMPORTANT]
> This project began as a proof of concept (PoC) created several months before the development of [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS).
>
> - Original commit reference: [Commit 94b74b2a0f44cd210ca909109f52e52480468712](https://github.com/Vito0912/audiobookshelf/commit/94b74b2a0f44cd210ca909109f52e52480468712)
> - I modified the stale PR in response as I saw the [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS) project and packaged this progress for sharing so that work does not need to be made twice.
>
> As this is a PoC, it currently does not include a license. [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS) is granted full rights to use this code for creating their own OPDS server if they want to.
> If someone wants to maintain this, please contact me (It makes sense to write it in TS/JS to be able to be migrated to ABS later on)

## About
This repository contains a modified version of my earlier work intended to integrate OPDS directly into ABS by adding it as an extra server component. Please note that while ABS is undergoing backend changes, further modifications will be required to fully integrate OPDS functionality.
I plan to add these once the refactoring is finished. This can take months or years.

## Docker Compose

```yaml
services:
  opds:
    image: ghcr.io/vito0912/abs-opds:latest
    container_name: abs-opds
    restart: unless-stopped
    ports:
      - "3010:3010"
    environment:
      - ABS_URL=http://localhost:8080/
      - OPDS_USERS=user_1:apikey_1,user_2:apikey_2:optional_password_2
```