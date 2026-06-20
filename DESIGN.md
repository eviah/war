# GLOBAL WARFARE — Next-Gen Tactical Perspective Simulator
## Technical Design & Architecture Blueprint (UE5 target)

> **Scope reality:** This document is the *architecture a studio would build from*. The
> accompanying `Web/` build is a real, playable **vertical slice** that implements the
> mechanics of these systems in WebGL so you can feel them today — not the photoreal
> AAA end-state, which is a multi-year, multi-hundred-person production.

---

## 0. Engine & Pipeline Target
| Concern | Target tech |
|---|---|
| Renderer | UE5.4 + **Nanite** (virtualized micro-geometry) + **Lumen** (dynamic GI) + hardware **ray-traced reflections** |
| Materials | 8K photogrammetric PBR (albedo/normal/roughness/AO/displacement), **Virtual Texturing** streaming |
| Animation | Motion-matching locomotion, **Control Rig** + **IK Retargeter**, mocap-driven cinematics |
| Audio | MetaSounds, geometry-aware reverb, ballistic crack/thump distance modeling |
| Destruction | **Chaos** fracture + field systems |
| Vehicles/flight | **Chaos Vehicles** (ground) + custom 6-DoF aerodynamic solver (air) |
| Weather/sky | Volumetric clouds + Sky Atmosphere + dynamic precipitation surface-wetness |
| Networking | Server-authoritative, client-prediction + lag-compensated hitscan/projectile rewind |

---

## MODULE 1 — Player Controller (Motion & Viewpoint)

### 1.1 Responsibilities
- True FP **body awareness**: a single skeletal mesh; the camera is bolted to a head
  socket so the player sees their own chest, arms, legs, and rig.
- **Physics-based locomotion** with loadout-mass inertia (accel/decel scale with carried
  weight), tactical pace control (walk/patrol/sprint), crouch/prone, lean (Q/E),
  context **mount/bipod** on cover, and high/low **weapon readiness**.

### 1.2 Component graph
```
AGWCharacter (ACharacter)
├── USkeletalMeshComponent      "Body"      (full-body, owner-and-others visible)
├── UCameraComponent            "FPCamera"  (attached to head socket, no separate arms mesh)
├── UGWMovementComponent        : UCharacterMovementComponent  (mass-aware overrides)
├── UWeaponComponent            "Weapon"    (ADS pose, recoil, malfunction FSM)
├── UReadinessComponent                     (high/low ready, mount/tilt state machine)
├── UInventoryComponent                     (loadout + total mass → feeds movement)
└── UAbilitySystemComponent     (GAS)       (stamina, suppression, wound states)
```

### 1.3 Mass-aware movement (core formula)
```
totalMass   = baseKit + Σ(item.mass)          // kg
maxSpeed     = lerp(SPRINT, WALK, clamp(totalMass/CARRY_CAP))
accel        = BASE_ACCEL / (1 + totalMass*INERTIA_K)
braking      = BASE_BRAKE / (1 + totalMass*INERTIA_K)
// stance multipliers
maxSpeed    *= stance(prone:0.25, crouch:0.5, ads:0.6, patrol:1.0, sprint:1.6)
```

### 1.4 Readiness / mount state machine
```
LOW_READY ──aim──► HIGH_READY ──ADS──► SIGHTED
   ▲                                      │
   └──────────── near cover + look ───────┤
                                          ▼
                                     MOUNTED (recoil↓80%, sway↓90%, yaw clamp ±45°)
LEAN: roll camera ±18°, lateral offset ±0.3m, expose only weapon + shoulder
```

---

## MODULE 2 — Vehicle Ballistics & Physics

### 2.1 Projectile ballistics (shared by infantry + vehicles)
Real exterior-ballistics integration each substep:
```
F_gravity = m * g
F_drag    = -0.5 * ρ(altitude) * Cd * A * |v_rel|^2 * v̂_rel     // v_rel = v - wind
F_coriolis= -2m * (Ω × v)        // long-range only
a = (F_gravity + F_drag + F_coriolis) / m
v += a*dt ;  x += v*dt
// penetration: on hit, RPM-like energy model
penDepth = (0.5*m*v² ) / (material.hardness * A)
if penDepth > material.thickness: spawn exit-projectile (v *= retentionFactor) + spall
```
Tracked per round: muzzle velocity, mass, ballistic coefficient, bullet drop, windage,
material penetration, spalling, ricochet angle.

### 2.2 Ground vehicles (Chaos Vehicles)
```
AGWTank
├── UChaosWheeledVehicleMovementComponent   (torque curve, suspension, track-as-wheels)
├── UTurretComponent      (independent yaw ring + gun elevation, stabilized)
├── UFireControlComponent (lead/ballistic computer, ammo types: APFSDS/HEAT/HE)
├── UThermalOpticComponent (white/black-hot post-process material)
├── UEWComponent          (jammers, laser-warning, smoke dischargers)
└── UArmorComponent       (per-facing thickness, slope modifier, RHA equivalence)
weatherGrip = baseGrip * surface(mud:0.5, wet:0.7, snow:0.4, dry:1.0)
```

### 2.3 Aviation (custom 6-DoF aerodynamic solver)
```
lift  = 0.5*ρ*V²*S*Cl(α)        drag = 0.5*ρ*V²*S*Cd(α)
moments = f(controlSurfaces, airspeed, AoA, sideslip)
solve rigid-body 6-DoF; stall when α > αcrit; G-load → pilot blackout model
HUD: pitch ladder, airspeed/altitude tapes, HSI, radar/RWR, weapon designation box
```

---

## MODULE 3 — Strategic Planning System

### 3.1 Macro layer — Invasion map
```
UWorldStrategyMap
├── FNation[]  (military infrastructure graph: airfields, depots, C2, AA, factories)
├── selectTarget(nation) → generates a CampaignTree of layered operations
└── each node = an Operation (objective, AO, enemy OOB, weather window)
```

### 3.2 Mission planning board (pre-deployment, interactive)
```
UMissionPlanner
├── infiltrationPoints[]   (HALO / fast-rope / amphibious / overland)
├── extractionRoutes[]
├── timeOfDay              (affects light, thermal contrast, enemy alertness)
├── weather                (affects ballistics, grip, visibility, audio range)
├── loadout                (primary/secondary/optics/attachments/throwables, mass→Module1)
├── squad orders / ROE
└── COMMIT() → bakes params into the mission instance, streams the AO
```

### 3.3 Mission archetypes
`HIGH_VALUE_KILL · DEEP_RECON_SABOTAGE · BEHIND_LINES_AIRSTRIKE · COMBINED_ARMS_STRIKE`
Each defines: objective graph, success/fail conditions, enemy density, time pressure,
stealth-vs-loud branching.

### 3.4 Captain / command layer (team)
```
UCommandComponent (on player = squad captain)
├── issueOrder(squad, ADVANCE|HOLD|REGROUP|SUPPRESS|FLANK, location)
├── two factions (player color vs enemy color), server-authoritative
└── pre-op: each captain declares plan/ROE; AI/other captain reacts
```

---

## MODULE 4 — Narrative Scripting Pipeline (Sony-style)

### 4.1 Faction-driven narrative
```
UCampaignDirector
├── chooseFaction(nation) → swaps VO bank, script branch, equipment, UI language
├── BeatGraph (story beats as a DAG; psychological-weight beats gate progression)
└── seamless cutscene↔gameplay (no loads): cinematic uses the SAME pawn + level
```

### 4.2 The master plan — cinematic → first-person gameplay (no load screen)
```
function PlayBeat(beat):
    StreamLevelAsync(beat.AO)                 # already resident; just sub-levels
    pawn = SpawnOrPossess(beat.heroPawn)      # same actor used in cutscene + play
    cam  = pawn.FPCamera

    # --- CINEMATIC PHASE ---
    Sequencer.bindCamera(cam)                 # drive the player's own camera
    pawn.setInputEnabled(false)
    pawn.playMocap(beat.cinematicTrack)       # full-body mocap on the real rig
    await Sequencer.play(beat.cinematicTrack) # dialogue, framing, performance

    # --- SEAMLESS HANDOFF (single frame, no fade/load) ---
    blendCameraToGameplay(cam, duration=0.4)  # Sequencer cam → player look, blended
    pawn.snapPoseToGameplayState()            # cinematic last pose → locomotion pose
    Sequencer.releaseCamera(cam)
    pawn.setInputEnabled(true)

    # --- GAMEPLAY LOOP ---
    while not beat.objectiveComplete:
        ProcessInput(pawn)                    # Module 1
        StepBallistics(world, dt)             # Module 2
        TickSquadAI(factions, orders)         # Module 3
        TickNarrativeTriggers(beat)           # fire next beat on objective/volume
        Render(Lumen + RT + Nanite)
    PlayBeat(beat.next)                       # chains to next cinematic, still no load
```

---

## ARSENAL & ORDER OF BATTLE (content catalog)
> Names below are generic/fictional analogues — real designations require trademark
> licensing and scanned/licensed models.

**Infantry primaries:** assault rifle, battle rifle, bullpup carbine, SMG, LMG, DMR,
bolt/semi sniper, shotgun. **Sidearms:** combat pistol, machine pistol, revolver.
**Heavy:** ATGM launcher, MANPADS, recoilless rifle, GPMG.
**Attachments:** red-dot/holo/LPVO/thermal/night optics, suppressors, fore-grips,
bipods, lasers, extended/drum mags.
**Ground vehicles:** MBT, IFV, APC, recon car, MRAP, SPG/SPAA, logistics truck.
**Air:** multirole fighter, attack jet, gunship, transport/attack helicopter, UAV.
**Factions:** 4–8 playable nations, each with distinct OOB, camo, VO, doctrine.

---

## BUILD ROADMAP (what the Web slice covers vs. what remains)
| System | Web slice (now) | Full AAA (remaining) |
|---|---|---|
| FP body-aware movement + inertia | ✅ implemented | full-body IK, motion-matching |
| Ballistics (drop/drag/wind/pen) | ✅ implemented | Coriolis, spalling, material DB |
| Arsenal | ✅ multi-weapon + jams/chamber-check | scanned models, every weapon |
| Planning board + factions/captain | ✅ briefing + squad orders | full strategy map + branching |
| Destruction | ✅ destructible cover + shell AoE | Chaos world-scale fracture |
| Vehicles | ✅ drivable tank + cannon | full interiors, aviation, EW |
| Narrative | ⛔ design only | mocap, Sequencer, VO, no-load beats |
| Photoreal art | ⛔ procedural stand-ins | photogrammetry/Nanite/Lumen/RT |
```
```
