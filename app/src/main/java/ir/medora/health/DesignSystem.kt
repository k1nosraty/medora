package ir.medora.health

import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily

object MedoraColors {
    val Primary = Color(0xFF236B59)
    val OnPrimary = Color(0xFFFFFFFF)
    val PrimaryContainer = Color(0xFFDCEFE8)
    val OnPrimaryContainer = Color(0xFF123F35)
    val Secondary = Color(0xFF3F7892)
    val Background = Color(0xFFF6F8F6)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF1B302B)
    val Muted = Color(0xFF5F716B)
    val Outline = Color(0xFFDCE4DE)
    val Water = Color(0xFF347E9C)
    val WaterContainer = Color(0xFFE8F2F7)
    val Success = Color(0xFF246B4D)
    val SuccessContainer = Color(0xFFE2F2E8)
    val Warning = Color(0xFF815A17)
    val WarningContainer = Color(0xFFFFF3D9)
    val Error = Color(0xFFB23A32)
    val ErrorContainer = Color(0xFFFBE9E7)
}

val Green = MedoraColors.Primary
val Blue = MedoraColors.Water
val Ink = MedoraColors.Ink
val PersianFont = FontFamily(Font(R.font.vazirmatn))

@Composable
fun medoraColorScheme() = lightColorScheme(
    primary = MedoraColors.Primary,
    onPrimary = MedoraColors.OnPrimary,
    primaryContainer = MedoraColors.PrimaryContainer,
    onPrimaryContainer = MedoraColors.OnPrimaryContainer,
    secondary = MedoraColors.Secondary,
    background = MedoraColors.Background,
    onBackground = MedoraColors.Ink,
    surface = MedoraColors.Surface,
    onSurface = MedoraColors.Ink,
    surfaceVariant = Color(0xFFF0F4F1),
    onSurfaceVariant = MedoraColors.Muted,
    outline = Color(0xFF87958F),
    outlineVariant = MedoraColors.Outline,
    error = MedoraColors.Error,
    errorContainer = MedoraColors.ErrorContainer,
    onErrorContainer = Color(0xFF5C1713)
)

@Composable
fun medoraTypography(language: String): Typography {
    val base = Typography()
    val family = if (language == "fa") PersianFont else FontFamily.Default
    return Typography(
        displayLarge = base.displayLarge.copy(fontFamily = family),
        displayMedium = base.displayMedium.copy(fontFamily = family),
        displaySmall = base.displaySmall.copy(fontFamily = family),
        headlineLarge = base.headlineLarge.copy(fontFamily = family),
        headlineMedium = base.headlineMedium.copy(fontFamily = family),
        headlineSmall = base.headlineSmall.copy(fontFamily = family),
        titleLarge = base.titleLarge.copy(fontFamily = family),
        titleMedium = base.titleMedium.copy(fontFamily = family),
        titleSmall = base.titleSmall.copy(fontFamily = family),
        bodyLarge = base.bodyLarge.copy(fontFamily = family),
        bodyMedium = base.bodyMedium.copy(fontFamily = family),
        bodySmall = base.bodySmall.copy(fontFamily = family),
        labelLarge = base.labelLarge.copy(fontFamily = family),
        labelMedium = base.labelMedium.copy(fontFamily = family),
        labelSmall = base.labelSmall.copy(fontFamily = family)
    )
}
