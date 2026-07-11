# Ideas

Collect ideas to work on later

- [ ] Drizzle with Turso: https://orm.drizzle.team/docs/get-started/turso-database-new
- [ ] Cross device synchronization
  - [ ] Using CRDTs
    - https://automerge.org/
    - https://crdt.tech/
    - https://docs.yjs.dev/
  - [ ] The server is just another client that can store data and sync with other clients. It just doesn't have a UI and interactivity. It can be used by other clients to get data when other clients are offline
    - [ ] Peer-to-peer networking with server as peer: https://www.iroh.computer/
    - [ ] CRDT framework messages are wrapped inside MLS so that the server can not read the message contents: https://openmls.tech/
