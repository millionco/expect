Rasmus:

- [x] Improved error surfacing
  - [x] Defects
  - [x] Expected errors
- [x] Unauthenticated case.
- [x] Out of usage case
      -- After launch
- cleanup rrweb PR
- cleanup browser / mcp code (pretty leaky, lifetimes not handled, interrupts not handled, etc)
  - needs to be much more testable, eg. should be trivial to have a testing script which goes to google.com, writes in some content, and then we get the video and live viewer artifact and should be able to view it locally (without a running server)
