// GWCharacter.cpp

#include "GWCharacter.h"
#include "GWBallisticProjectile.h"
#include "Camera/CameraComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"

AGWCharacter::AGWCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	// Camera at eye height, attached so the body mesh stays visible looking down.
	FirstPersonCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
	FirstPersonCamera->SetupAttachment(GetMesh(), TEXT("head"));
	FirstPersonCamera->bUsePawnControlRotation = true;

	// Body-aware: show the full mesh to the owner (no "headless" hiding).
	GetMesh()->SetOwnerNoSee(false);
	GetMesh()->bCastHiddenShadow = true;
}

void AGWCharacter::BeginPlay()
{
	Super::BeginPlay();

	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (auto* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (OnFootContext)
			{
				Sub->AddMappingContext(OnFootContext, 0);
			}
		}
	}

	ApplyLoadoutInertia();
}

void AGWCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	// Hook: feed velocity/stance into Motion Matching here (Pose Search).
}

void AGWCharacter::ApplyLoadoutInertia()
{
	// Heavier kit => slower accel/decel and lower top speed (Module 1).
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		const float MassFactor = FMath::Clamp(1.f - (LoadoutMassKg - 20.f) * 0.012f, 0.55f, 1.f);
		Move->MaxWalkSpeed = 600.f * MassFactor;
		Move->MaxAcceleration = 2048.f * MassFactor;
		Move->BrakingDecelerationWalking = 2048.f * MassFactor;
	}
}

void AGWCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (MoveAction)        EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AGWCharacter::Move);
		if (LookAction)        EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AGWCharacter::Look);
		if (FireAction)        EIC->BindAction(FireAction, ETriggerEvent::Started, this, &AGWCharacter::Fire);
		if (ToggleReadyAction) EIC->BindAction(ToggleReadyAction, ETriggerEvent::Started, this, &AGWCharacter::ToggleReady);
	}
}

void AGWCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (Controller)
	{
		const FRotator YawRot(0.f, Controller->GetControlRotation().Yaw, 0.f);
		AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::X), Axis.Y);
		AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y), Axis.X);
	}
}

void AGWCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(Axis.Y);
}

void AGWCharacter::Fire(const FInputActionValue& /*Value*/)
{
	if (!ProjectileClass) return;

	const FVector MuzzleLoc = GetMesh()->DoesSocketExist(MuzzleSocket)
		? GetMesh()->GetSocketLocation(MuzzleSocket)
		: FirstPersonCamera->GetComponentLocation();

	// Aim where the camera looks (center-screen), not just muzzle-forward.
	const FVector AimDir = FirstPersonCamera->GetForwardVector();

	FActorSpawnParameters P;
	P.Owner = this;
	P.Instigator = this;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	if (AGWBallisticProjectile* Round =
		GetWorld()->SpawnActor<AGWBallisticProjectile>(ProjectileClass, MuzzleLoc, AimDir.Rotation(), P))
	{
		Round->Launch(MuzzleLoc, AimDir);
	}
}

void AGWCharacter::ToggleReady(const FInputActionValue& /*Value*/)
{
	Readiness = (Readiness == EGWReadiness::HighReady)
		? EGWReadiness::LowReady
		: EGWReadiness::HighReady;
	// Hook: blend additive readiness pose + adjust weapon sway/recoil here.
}
