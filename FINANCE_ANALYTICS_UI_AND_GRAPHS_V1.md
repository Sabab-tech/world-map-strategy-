# Finance Analytics UI and Country Graph Runtime v1

The Finance Ministry includes an Analytics & Graphs tab with country and indicator selection, summary KPIs, one detailed graph, a searchable/paginated register of separate country mini-graphs, an expandable raw-indicator table, and CSV export.

For all 249 country and territory profiles, the runtime generates a baseline point plus 30 modeled days using only existing baseline values and deterministic, country-specific scenario variation. It labels these values as **model preview**, not observed daily history and not an official forecast. Missing source values remain N/A.

The dashboard switches to recorded game-turn snapshots only after the first committed turn or simulation-start event. Live history is held as a rolling 31-turn window and is not combined with the preview as if modeled preview points were real history. The country register is paginated to keep mobile UI responsive.
