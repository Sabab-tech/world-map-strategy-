# OMEGA legacy UI baseline archive (2026-10-24)

This directory preserves a content-addressed copy of the UI baseline at `3422b1172c4fe576e0b090b84c865054c5994178`.

## Contents
- `index.html`: exact page-shell source from the base commit.
- Every local script and stylesheet linked by that shell.
- All current `assets/` files.
- `MANIFEST.json`: SHA/base reference and mirrored-file inventory.

## Restore

The archive is reference/preservation storage and is intentionally not a second production app. Relative data files and canonical gameplay services remain anchored to the original commit.

To restore the entire exact working repository, checkout commit `3422b1172c4fe576e0b090b84c865054c5994178`. To restore selected original root paths from that snapshot, use `git restore --source=3422b1172c4fe576e0b090b84c865054c5994178 -- path/to/file`. The mirrored copies remain available for direct comparison.

## Safety
This archive PR does not alter, rename, remove or disconnect any live root UI file, runtime, source data, or asset. A later UI-v2 PR must be separate and must preserve the canonical engine authority.
