// GWGameMode.cpp
#include "GWGameMode.h"
#include "GWCharacter.h"

AGWGameMode::AGWGameMode()
{
	DefaultPawnClass = AGWCharacter::StaticClass();
}
