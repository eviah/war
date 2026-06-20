// GWCharacter.h
// First-person tactical character. Body-aware mesh, stance/readiness state,
// loadout-mass inertia, and a fire action that spawns ballistic projectiles.
// Corresponds to Module 1 (Player Controller) of the design document.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GWCharacter.generated.h"

class UCameraComponent;
class USkeletalMeshComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

UENUM(BlueprintType)
enum class EGWReadiness : uint8
{
	Patrol,
	LowReady,
	HighReady,
	Mounted
};

UCLASS()
class GLOBALWARFARE_API AGWCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AGWCharacter();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

protected:
	virtual void BeginPlay() override;

	// First-person camera socketed to the head of the body-aware mesh.
	UPROPERTY(VisibleAnywhere, Category = "View")
	UCameraComponent* FirstPersonCamera;

	// Full body mesh (chest/legs/equipment visible when looking down).
	// We reuse ACharacter's Mesh() and simply keep the head bone behind camera.

	// --- Enhanced Input ---
	UPROPERTY(EditAnywhere, Category = "Input")
	UInputMappingContext* OnFootContext;

	UPROPERTY(EditAnywhere, Category = "Input")
	UInputAction* MoveAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	UInputAction* LookAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	UInputAction* FireAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	UInputAction* ToggleReadyAction;

	// --- Tactical state ---
	UPROPERTY(EditAnywhere, Category = "Tactical")
	EGWReadiness Readiness = EGWReadiness::LowReady;

	// Total carried mass in kg; drives movement inertia.
	UPROPERTY(EditAnywhere, Category = "Tactical")
	float LoadoutMassKg = 28.f;

	// Projectile class fired by the equipped weapon.
	UPROPERTY(EditAnywhere, Category = "Weapon")
	TSubclassOf<class AGWBallisticProjectile> ProjectileClass;

	// Muzzle socket name on the weapon/arms mesh.
	UPROPERTY(EditAnywhere, Category = "Weapon")
	FName MuzzleSocket = TEXT("Muzzle");

private:
	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void Fire(const FInputActionValue& Value);
	void ToggleReady(const FInputActionValue& Value);

	void ApplyLoadoutInertia();
};
