package ir.medora.health

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Semantic Emerald Sanctuary tokens. Feature identity and consumption status stay independent. */
object MedoraColors {
    val Primary = Color(0xFF006F68)
    val OnPrimary = Color.White
    val PrimaryContainer = Color(0xFFDDF1E8)
    val OnPrimaryContainer = Color(0xFF103D38)
    val Secondary = Color(0xFF35B6A2)
    val Background = Color(0xFFEAF5EE)
    val Surface = Color(0xFFDDF1E8)
    val Ink = Color(0xFF103D38)
    val Muted = Color(0xFF46645E)
    val Outline = Color(0xFFACCBC1)
    val Water = Color(0xFF075E8A)
    val WaterContainer = Color(0xFFA8DDF2)
    val Success = Color(0xFF166534)
    val SuccessContainer = Color(0xFFDCF4E3)
    val Warning = Color(0xFF92400E)
    val WarningContainer = Color(0xFFFFF0D8)
    val Medication = Color(0xFF805019)
    val Lavender = Color(0xFFE9E0F7)
    val Appointment = Color(0xFF5B3F87)
    val Warm = Color(0xFFFFF0D8)
    val Gold = Color(0xFFF3C56A)
    val Error = Color(0xFFB42318)
    val ErrorContainer = Color(0xFFFDE4E1)
    val Forest = Color(0xFF103D38)
}
val Green = MedoraColors.Primary
val Blue = MedoraColors.Water
val Ink = MedoraColors.Ink
val PersianFont = FontFamily(Font(R.font.vazirmatn))

/** UI preferences do not change or migrate health records. */
@Stable
class AppearancePreferences(context: Context) {
    private val preferences = context.getSharedPreferences("medora_ui", Context.MODE_PRIVATE)
    var theme by mutableStateOf(preferences.getString("theme", "system") ?: "system")
        private set
    fun chooseTheme(value: String) {
        if (value !in listOf("system", "light", "dark")) return
        theme = value
        preferences.edit().putString("theme", value).apply()
    }
}
val LocalAppearance = staticCompositionLocalOf<AppearancePreferences?> { null }

@Composable
fun medoraColorScheme(dark: Boolean = isSystemInDarkTheme()) = if (dark) darkColorScheme(
    primary = Color(0xFF66D8C2), onPrimary = MedoraColors.Forest,
    primaryContainer = Color(0xFF20554A), onPrimaryContainer = Color(0xFFE6FFF6),
    secondary = Color(0xFF66D8C2), onSecondary = MedoraColors.Forest,
    background = Color(0xFF0B2423), onBackground = Color(0xFFE6FFF6),
    surface = Color(0xFF153B37), onSurface = Color(0xFFE6FFF6),
    surfaceVariant = Color(0xFF193F3A), onSurfaceVariant = Color(0xFFB2D5CA),
    outline = Color(0xFF72978C), outlineVariant = Color(0xFF41685F),
    surfaceContainer = Color(0xFF153B37), surfaceContainerHigh = Color(0xFF193F3A),
    surfaceContainerHighest = Color(0xFF20554A), surfaceContainerLow = Color(0xFF10332E),
    error = Color(0xFFFFB4AB), onError = Color(0xFF5C1713),
    errorContainer = Color(0xFF65352F), onErrorContainer = Color(0xFFFFDAD5)
) else lightColorScheme(
    primary = MedoraColors.Primary, onPrimary = MedoraColors.OnPrimary,
    primaryContainer = MedoraColors.PrimaryContainer, onPrimaryContainer = MedoraColors.OnPrimaryContainer,
    secondary = MedoraColors.Secondary, onSecondary = MedoraColors.Forest,
    background = MedoraColors.Background, onBackground = MedoraColors.Ink,
    surface = MedoraColors.Surface, onSurface = MedoraColors.Ink,
    surfaceVariant = Color(0xFFE6EEEA), onSurfaceVariant = MedoraColors.Muted,
    outline = Color(0xFF648379), outlineVariant = MedoraColors.Outline,
    surfaceContainer = MedoraColors.Surface, surfaceContainerHigh = Color(0xFFCFE9DC),
    surfaceContainerHighest = Color(0xFFC4E2D3), surfaceContainerLow = Color(0xFFEAF5EE),
    error = MedoraColors.Error, errorContainer = MedoraColors.ErrorContainer,
    onError = Color.White, onErrorContainer = Color(0xFF5C1713)
)

@Composable
fun medoraTypography(language: String): Typography {
    val family = if (language == "fa") PersianFont else FontFamily.Default
    fun style(size: Int, weight: FontWeight = FontWeight.Normal) = androidx.compose.ui.text.TextStyle(
        fontFamily = family, fontSize = size.sp, lineHeight = (size * 1.5f).sp, fontWeight = weight)
    return Typography(
        displayLarge = style(40, FontWeight.Bold), displayMedium = style(36, FontWeight.Bold),
        displaySmall = style(32, FontWeight.Bold), headlineLarge = style(28, FontWeight.Bold),
        headlineMedium = style(26, FontWeight.Bold), headlineSmall = style(24, FontWeight.Bold),
        titleLarge = style(20, FontWeight.SemiBold), titleMedium = style(18, FontWeight.SemiBold),
        titleSmall = style(16, FontWeight.SemiBold), bodyLarge = style(16), bodyMedium = style(16),
        bodySmall = style(14), labelLarge = style(16, FontWeight.Medium),
        labelMedium = style(14, FontWeight.Medium), labelSmall = style(14, FontWeight.Medium))
}
val MedoraShapes = Shapes(extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(20.dp), extraLarge = RoundedCornerShape(28.dp))
val MedoraFeatureShape = RoundedCornerShape(20.dp)
object MedoraSpacing { val Page = 16.dp; val Card = 16.dp; val Gap = 12.dp; val Control = 48.dp }
@Composable fun isMedoraDark() = MaterialTheme.colorScheme.background != MedoraColors.Background

