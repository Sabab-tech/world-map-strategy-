# OMEGA Minister Profile Effects System

## Purpose

A minister dossier is an executable gameplay input, not just a recruitment-card biography. The system consumes the existing `ministers.json` fields and the canonical `OmegaMinisterStateRegistry`; it does not create a competing roster or allow ministers to mutate world state directly.

## Runtime path

1. `ministers.json` supplies identity, age, background, education/specialties when recorded, ideology, stats, and efficiency values.
2. `omega_minister_state_system.js` remains the authoritative owner of appointments, workload, stress, fatigue, history, and learned domain experience.
3. `minister_system_config.json` declares age-stage curves, operation keywords, resilience weights, and training penalties.
4. `minister_behavior_engine.js` turns a profile into explainable effects. `evaluateDirective`, `rankOptions`, and `createDecisionContract` apply those effects to AI recommendations and decision scores. `train` writes learned domain experience back to the canonical learning state.
5. `minister_recruitment_engine.js` exposes the same computed profile effects before recruitment. It is not a second source of gameplay rules.

The minister remains an adviser/recommender. The existing execution engine keeps authority over actual world mutations.

## What profile attributes change

### Age stage

Age is a modest modifier, not a substitute for the candidate's recorded skills. The configurable stages are:

| Age | Stage | Decision-speed factor | Judgment factor | Crisis-handling factor | Training-rate factor |
|---|---|---:|---:|---:|---:|
| 18–29 | Early career | 1.03 | 0.96 | 0.97 | 1.22 |
| 30–39 | Developing experience | 1.02 | 0.99 | 0.99 | 1.12 |
| 40–54 | Experienced | 1.00 | 1.05 | 1.04 | 1.00 |
| 55–64 | Senior experience | 0.97 | 1.06 | 1.03 | 0.90 |
| 65–100 | Late career | 0.94 | 1.03 | 1.00 | 0.82 |
| Not recorded | Unknown | 1.00 | 1.00 | 1.00 | 1.00 |

The selected operation determines whether decision speed, judgment, or crisis handling is used. The age multiplier is clamped to 0.85–1.15 so that the age field cannot overpower the actual skill profile. A missing age is neutral rather than silently treated as zero.

### Capability and professional fit

The capability engine continues to weight a candidate's recorded attributes for the operation (for example, accuracy and integrity for audit work, or crisis handling and discipline for security work). The behavior layer then applies:

- **Career fit:** a configurable bonus of up to 8% when recorded background, education, or specialty terms match the ministry/task domain. No match means a neutral modifier, not a punishment.
- **Experience:** accumulated domain experience continues to improve capability with diminishing returns.
- **Workload and time pressure:** the existing capability penalties still apply, so a minister with an excellent profile can perform worse while overloaded or rushed.
- **Work style:** methodical, strategic planner, collaborative, crisis steady, rapid executor, high risk tolerance, and integrity risk are derived from the candidate's actual stats. They are visible for comparison and do not replace the numeric decision evaluation.

### Stress and crisis response

Stress resilience is derived from the recorded crisis-handling, discipline, empathy, strategic, and integrity values, unless the profile explicitly records a composure/stress-tolerance value. That resilience scales the stress used by the capability evaluation; raw stress remains in the canonical runtime so the player can still see how pressured the minister is.

This models two distinct facts: the situation may be stressful, but different ministers can lose different amounts of effectiveness under the same pressure. It does not erase crisis exposure from the simulation. The canonical state view now exposes `status` and `isActive` as well, allowing the decision engine to reject recommendations from dismissed or otherwise inactive ministers.

Fatigue is now advanced by `OMEGA_SIMULATION_TURN_COMMITTED`. Each committed day contributes the configured game-hours from the simulation clock, applies the profile's age-related fatigue rate, adds burden for active workload and stress, and allows recovery under lower workload. Duplicate turn notifications are ignored so a single game day is not counted twice. Fatigue applies a configurable penalty to decision capability and also reduces training yield.

### Personalized training

Training updates `learningState.domainExperience`, `trainingHours`, `skillEvolution`, and `lastTraining`. The active minister's recruitment dossier offers a 24-game-hour training session. The session is stored in canonical runtime state, advances on committed game-time events, shows progress, and awards experience only when its duration completes. A minister cannot run overlapping sessions. The direct `train()` method remains available for deterministic system-driven training. Gain is:

`gain = trainingFactor × hours × quality × ageTrainingRate × learningAgility × availableCapacity ÷ (1 + domainExperience ÷ diminishingScale)`

Available capacity declines with current stress, workload, and fatigue, with a configurable floor. Repeated training on an already-mastered domain has diminishing returns. A training session with zero hours or zero quality provides no experience gain.

### Where the effects appear

- **Recruitment dossier:** role capability, work style, age stage, age-related operational factor, stress resilience, training rate, and career-fit evidence.
- **Decision evaluation:** adjusted effective capability plus raw/effective stress, age multiplier, and career-fit multiplier in the evaluation breakdown.
- **Training:** the active-minister dossier starts a time-bound session; its progress and completion state live in the canonical runtime. Domain experience and a persisted `lastTraining` breakdown are updated only when the session finishes.
- **Save/load and appointments:** use the existing canonical state and assignment paths. No new profile identity records are created.

## Data handling rules

- Identity and base stats are read-only inputs to the effect calculator.
- Existing fields such as `age`, `background`, `stats`, `efficiency`, `education`, `careerBackground`, and `personalityProfile` are supported; missing optional fields are safe.
- Country-specific names do not alter skills or formulas.
- The effect calculation is deterministic for the same profile, operation, and context. Training changes only when a valid training call is made.
- Age and background modifiers are configuration-driven so balancing does not require hardcoded minister names.
- These are simulation rules, not scientific claims that real people of a given age must perform in a particular way.

## Verification

Run `node scripts/test_minister_profile_effects.mjs` for focused coverage. The existing `test:cabinet`/`test:minister` paths also execute this suite through `scripts/test_minister_behavior.mjs`. The suite checks every profile in the canonical minister catalogue and verifies age-stage modifiers, specialty fit, resilience under identical stress, age-related fatigue during game time, fatigue penalties to decisions, scheduled-training completion after one committed game day, duplicate-turn deduplication, training gains, bounded values, and appointment-registry consistency. The repository's existing cabinet/minister checks remain in the normal test/build chain.

## Trade-offs

**Benefits:** profiles influence choices instead of serving as decoration; the player can compare candidates before appointment; training and stress have measurable outcomes; unknown data stays neutral; and modifiers remain explainable.

**Limitations:** the existing profiles have uneven depth, and not all candidates contain explicit career years, specialties, or learning-agility values. The engine therefore uses only the fields that exist and applies neutral defaults where evidence is missing. The small age-stage curve is a game-balance choice, not an empirical diagnosis of individual ability.
