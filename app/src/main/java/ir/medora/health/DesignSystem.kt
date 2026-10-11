package ir.medora.health

import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily

object MedoraColors {
    val Primary = Color(0xFF24786C)
    val OnPrimary = Color(0xFFFFFFFF)
    val PrimaryContainer = Color(0xFFE1F0E9)
    val OnPrimaryContainer = Color(0xFF1C6157)
    val Secondary = Color(0xFF36A7E8)
    val Background = Color(0xFFF8FAF7)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF183A3D)
    val Muted = Color(0xFF546E72)
    val Outline = Color(0xFFD8E3DD)
    val Water = Color(0xFF1688C4)
    val WaterContainer = Color(0xFFDDF1FC)
    val Success = Color(0xFF238876)
    val SuccessContainer = Color(0xFFEAF7F1)
    val Warning = Color(0xFFB65014)
    val WarningContainer = Color(0xFFFFF0E3)
    val Medication = Color(0xFFF18A42)
    val Lavender = Color(0xFFF0E7F8)
    val Appointment = Color(0xFF8E69B7)
    val Warm = Color(0xFFFFF9F4)
    val Error = Color(0xFFB23A32)
    val ErrorContainer = Color(0xFFFBE9E7)
}

val Green = MedoraColors.Primary
val Blue = MedoraColors.Water
val Ink = MedoraColors.Ink
val PersianFont = FontFamily(Font(R.font.vazirmatn))

@Composable
fun medoraColorScheme(dark: Boolean = isSystemInDarkTheme()) = if (dark) darkColorScheme(
    primary = Color(0xFF77D2C1), onPrimary = Color(0xFF073C37),
    primaryContainer = Color(0xFF194E45), onPrimaryContainer = Color(0xFFBCEBDD),
    secondary = Color(0xFF88CCF4), background = Color(0xFF102724),
    onBackground = Color(0xFFE6F1EC), surface = Color(0xFF1A332F),
    onSurface = Color(0xFFE6F1EC), surfaceVariant = Color(0xFF23403A),
    onSurfaceVariant = Color(0xFFB8CDC5), outline = Color(0xFF78948A),
    outlineVariant = Color(0xFF355047), error = Color(0xFFFFB4AB),
    errorContainer = Color(0xFF65352F), onErrorContainer = Color(0xFFFFDAD5)
) else lightColorScheme(
    primary = MedoraColors.Primary,
    onPrimary = MedoraColors.OnPrimary,
    primaryContainer = MedoraColors.PrimaryContainer,
    onPrimaryContainer = MedoraColors.OnPrimaryContainer,
    secondary = MedoraColors.Secondary,
    background = MedoraColors.Background,
    onBackground = MedoraColors.Ink,
    surface = MedoraColors.Surface,
    onSurface = MedoraColors.Ink,
    surfaceVariant = Color(0xFFEEF3ED),
    onSurfaceVariant = MedoraColors.Muted,
    outline = Color(0xFF71867C),
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
        headlineSmall = base.headlineSmall.copy(fontFamily = family, fontSize = 24.sp, lineHeight = 34.sp),
        titleLarge = base.titleLarge.copy(fontFamily = family, fontSize = 20.sp, lineHeight = 30.sp),
        titleMedium = base.titleMedium.copy(fontFamily = family, fontSize = 16.sp, lineHeight = 25.sp),
        titleSmall = base.titleSmall.copy(fontFamily = family),
        bodyLarge = base.bodyLarge.copy(fontFamily = family),
        bodyMedium = base.bodyMedium.copy(fontFamily = family, fontSize = 14.sp, lineHeight = 23.sp),
        bodySmall = base.bodySmall.copy(fontFamily = family),
        labelLarge = base.labelLarge.copy(fontFamily = family),
        labelMedium = base.labelMedium.copy(fontFamily = family),
        labelSmall = base.labelSmall.copy(fontFamily = family)
    )
}

val MedoraShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp)
)

object MedoraSpacing {
    val Page = 18.dp
    val Card = 16.dp
    val Gap = 12.dp
    val Control = 48.dp
}
