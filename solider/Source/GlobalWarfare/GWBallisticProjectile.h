// GWBallisticProjectile.h
// True simulated projectile: gravity + quadratic air drag + wind + penetration.
// This is the game-mechanics ballistics model described in Module 2 of the
// technical design document (energy/caliber-class/material abstraction).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GWBallisticProjectile.generated.h"

UCLASS()
class GLOBALWARFARE_API AGWBallisticProjectile : public AActor
{
	GENERATED_BODY()

public:
	AGWBallisticProjectile();

	// Call right after spawning to launch the round.
	void Launch(const FVector& MuzzleLocation, const FVector& Direction);

protected:
	virtual void Tick(float DeltaSeconds) override;

	// --- Ballistic coefficients (tune per caliber) ---

	// Muzzle velocity in cm/s (UE units). 5.56 NATO ~ 90000 cm/s (~900 m/s).
	UPROPERTY(EditAnywhere, Category = "Ballistics")
	float MuzzleSpeed = 90000.f;

	// Projectile mass in kg.
	UPROPERTY(EditAnywhere, Category = "Ballistics")
	float MassKg = 0.004f;

	// Drag coefficient * cross-section area, lumped (m^2). Small = flatter.
	UPROPERTY(EditAnywhere, Category = "Ballistics")
	float DragFactor = 0.0000035f;

	// Kinetic energy at muzzle, derived in Launch(). Drives penetration.
	float CurrentEnergy = 0.f;

	// Max lifetime so stray rounds clean themselves up.
	UPROPERTY(EditAnywhere, Category = "Ballistics")
	float MaxLifeSeconds = 8.f;

private:
	FVector Velocity = FVector::ZeroVector;   // cm/s
	FVector PrevLocation = FVector::ZeroVector;
	float   LifeElapsed = 0.f;

	void IntegrateStep(float Dt);
	bool TraceAndResolve();   // returns true if the round should despawn
};
