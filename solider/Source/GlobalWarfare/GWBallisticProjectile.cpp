// GWBallisticProjectile.cpp

#include "GWBallisticProjectile.h"
#include "Engine/World.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"

// Gravity in UE units (cm/s^2). UE world gravity is ~ -980.
static const FVector kGravity = FVector(0.f, 0.f, -980.f);

AGWBallisticProjectile::AGWBallisticProjectile()
{
	PrimaryActorTick.bCanEverTick = true;
	SetActorEnableCollision(false); // we do our own segment traces
}

void AGWBallisticProjectile::Launch(const FVector& MuzzleLocation, const FVector& Direction)
{
	SetActorLocation(MuzzleLocation);
	PrevLocation = MuzzleLocation;
	Velocity = Direction.GetSafeNormal() * MuzzleSpeed;

	// E = 1/2 m v^2  (convert cm/s -> m/s for a sane joule number)
	const float vMs = MuzzleSpeed / 100.f;
	CurrentEnergy = 0.5f * MassKg * vMs * vMs;
}

void AGWBallisticProjectile::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	LifeElapsed += DeltaSeconds;
	if (LifeElapsed > MaxLifeSeconds)
	{
		Destroy();
		return;
	}

	// Substep for stability at high muzzle velocity.
	const int32 Substeps = 4;
	const float Dt = DeltaSeconds / Substeps;
	for (int32 i = 0; i < Substeps; ++i)
	{
		IntegrateStep(Dt);
		if (TraceAndResolve())
		{
			return; // destroyed inside
		}
	}
}

void AGWBallisticProjectile::IntegrateStep(float Dt)
{
	// Wind field hook: replace with your WeatherSubsystem sample.
	const FVector Wind = FVector::ZeroVector; // e.g. WeatherSubsystem->WindAt(GetActorLocation())

	// Quadratic drag: a = -k * |v| * v  (opposes motion, scales with speed^2)
	const FVector DragAccel = -DragFactor / MassKg * Velocity.Size() * Velocity;

	Velocity += (kGravity + DragAccel + Wind) * Dt;

	PrevLocation = GetActorLocation();
	SetActorLocation(PrevLocation + Velocity * Dt, /*bSweep=*/false);
}

bool AGWBallisticProjectile::TraceAndResolve()
{
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(GWBullet), /*bTraceComplex=*/true, GetOwner());

	const bool bHit = GetWorld()->LineTraceSingleByChannel(
		Hit, PrevLocation, GetActorLocation(), ECC_Visibility, Params);

	if (!bHit)
	{
		return false;
	}

	// --- Penetration model (Module 2) ---
	// Effective resistance rises with impact angle (sloped armor) and material.
	const float ImpactAngle = FMath::Acos(FMath::Abs(FVector::DotProduct(
		Velocity.GetSafeNormal(), Hit.ImpactNormal)));            // 0 = perpendicular
	const float AngleFactor = 1.f / FMath::Max(FMath::Cos(ImpactAngle), 0.15f);

	// Simple per-surface resistance in joules. Map real surfaces in editor.
	const float SurfaceResistance = 250.f * AngleFactor;

	if (CurrentEnergy > SurfaceResistance)
	{
		// Penetrate: bleed energy and keep flying (wallbang behaviour).
		CurrentEnergy -= SurfaceResistance;
		Velocity *= 0.7f;

		// Deal reduced damage to whatever we punched through.
		UGameplayStatics::ApplyPointDamage(
			Hit.GetActor(), CurrentEnergy * 0.001f, Velocity.GetSafeNormal(),
			Hit, GetInstigatorController(), this, UDamageType::StaticClass());

		// Nudge past the surface so we don't re-hit the same face.
		SetActorLocation(Hit.ImpactPoint + Velocity.GetSafeNormal() * 2.f);
		return false;
	}

	// Stopped: full energy transfer.
	UGameplayStatics::ApplyPointDamage(
		Hit.GetActor(), CurrentEnergy * 0.002f, Velocity.GetSafeNormal(),
		Hit, GetInstigatorController(), this, UDamageType::StaticClass());

	Destroy();
	return true;
}
