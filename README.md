# OPDS for ABS

OPDS-Server for ABS (Audiobookshelf) is a proof of concept for an OPDS server that can be used with Audiobookshelf. It is designed to work with the Audiobookshelf API and provides a way to access your books via OPDS.

## Features
- [x] OPDS
- [x] Searching
- [x] Pagination
- [x] Multiple Users
- [x] OPDS Authentication (Basic Auth) \[third key in config\] OR Abs Auth *1 - Branch: [Auth](https://github.com/Vito0912/abs-opds/tree/auth)
- [x] Books by Author
- [x] Books by Narrator
- [x] Books by Genre/Tags
- [x] Books by Series
- [X] Optional card pagination (A, B, C, ...) instead of author, narrator, etc. names directly. 

*1 If the user is not specified in the ENVs, the system will automatically try to authenticate against ABS. Authentication is treated as a second branch (auth) because some readers do not support authentication or do not send the correct payload as specified in the OPDS specs. The /:username is dropped for the auth branch, and no configuration for the user is required (though it can be provided) since ABS handles authentication. In theory, OAuth is also possible, but I currently do not have any OAuth application running. 

## Tested with
- [x] Thorium
- [x] Moon+ Reader (Search does not seem to be displayed) 

## Built-In Demo
Spin up the provided Docker Compose instance and add `http://<local-server-ip>:3010` to your OPDS reader to see a selection of books.

## Attribution

> [!IMPORTANT]
> This project began as a proof of concept (PoC) created several months before the development of [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS).
>
> - Original commit reference: [Commit 94b74b2a0f44cd210ca909109f52e52480468712](https://github.com/Vito0912/audiobookshelf/commit/94b74b2a0f44cd210ca909109f52e52480468712)
> - I modified my stale PR after seeing the [OPDS-ABS](https://github.com/petr-prikryl/OPDS-ABS) project and packaged this progress for sharing so that work does not need to be done twice. I also took inspiration from their auth system and adding a third value for Basic Auth once it is implemented. In the future, direct ABS-login integration might be added.
> - On the long run I want to make a PR to ABS to add this directly again
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
      - SHOW_CHAR_CARDS=true 
```
