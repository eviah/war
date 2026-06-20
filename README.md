# Global Warfare — UE5 Vertical-Slice Scaffold

This is a **real Unreal Engine 5 C++ project skeleton**, not a finished game. It's the
first brick of the architecture in the design document: a body-aware first-person
character, a true ballistic projectile (gravity + quadratic drag + wind hook +
penetration), loadout-mass movement inertia, a stance/readiness toggle, and a game mode
that ties them together.

## What's here
```
GlobalWarfare.uproject
Source/
  GlobalWarfare.Target.cs           # game target
  GlobalWarfareEditor.Target.cs     # editor target
  GlobalWarfare/
    GlobalWarfare.Build.cs          # module deps (EnhancedInput, GAS, ...)
    GlobalWarfare.cpp               # module entry
    GWCharacter.h/.cpp              # Module 1: first-person player controller
    GWBallisticProjectile.h/.cpp    # Module 2: simulated ballistics + penetration
    GWGameMode.h/.cpp               # ties the pawn into a playable mode
```

## How to actually run it
1. Install **Unreal Engine 5.4** (Epic Games Launcher) and **Visual Studio 2022**
   with the "Game development with C++" workload (Windows), or Xcode (Mac).
2. Copy this `GlobalWarfare/` folder somewhere writable.
3. Right-click `GlobalWarfare.uproject` → **Generate Visual Studio project files**.
4. Open the generated `.sln`, set config to **Development Editor**, and **Build**.
5. Open the `.uproject`. In the editor you'll need to do the asset wiring that code
   alone can't do:
   - Create a **Blueprint** child of `GWCharacter`, assign a skeletal mesh + animation
     blueprint, and add a `Muzzle` socket.
   - Create Enhanced Input `InputAction` + `InputMappingContext` assets and assign them
     on the character (Move/Look/Fire/ToggleReady).
   - Create a Blueprint child of `GWBallisticProjectile` and assign it as the
     character's `ProjectileClass`.
   - Set `GWGameMode` as the level's game mode.
6. Press **Play**. You'll have a first-person pawn that moves with weight and fires
   physically-simulated rounds that drop, slow, and punch through thin surfaces.

## What this is NOT (being honest)
- No art. No photoreal weapons/tanks/maps — those are thousands of hours of artist and
  level-design work, plus licensed or scanned assets.
- No campaign, no cutscenes, no commander mode yet — those are the later modules in the
  design doc, built on top of this foundation.
- I could not compile-test this here (no Unreal in this environment), so treat it as a
  starting point you build and debug in the editor, not a guaranteed-clean build.

## Where to go next (in priority order)
1. Get the slice playable (steps above).
2. Add a weapon component + reload/malfunction states (Module 1).
3. Add a single enemy with a health component reacting to `ApplyPointDamage`.
4. Add the planning-board → seamless-cutscene → gameplay loop (Module 4 master plan).
5. Only then start scaling content and fidelity.

If you want, I can build any one of those next steps out as real code the same way.
# war
# war
