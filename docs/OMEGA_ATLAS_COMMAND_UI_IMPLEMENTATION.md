# OMEGA Atlas Command UI implementation slice

## Implemented
- One global fixed Atlas Command dock on the world map: World, Overview, Government, Economy and More.
- Dock routes into the existing cabinet UI-v2 app; no duplicate shell or game-state store is introduced.
- A distinct country overview reads canonical country-gateway indicators and available game finance state without inventing missing values.
- More-domain cards cover factory production, mining, public safety, logistics, diplomacy, defense, research, infrastructure, projects and reports with bundled local imagery.
- Economy and Reports include local reference photography with consistent crops and local attribution/license metadata when the asset manifest is ready.
- Shared navy/slate surfaces, restrained brass accents, responsive cards, focus states and mobile safe-area spacing.
- Legacy Government entry remains a fallback. When UI-v2 is active the world dock hides and cabinet navigation takes over; closing the cabinet returns to the world dock.
- Offline cache v27 explicitly includes UI-v2 and bundled photos. No remote image/font dependency is required to boot.
- CI contract tests cover route set, dock module and offline asset inclusion.

## Remaining acceptance gates
Green GitHub CI, Android 9 / 3 GB RAM smoke, offline relaunch, 320/360/390 px visual review, photo-crop review, and Back/Close recovery require a real browser/device run. They are not claimed complete here.
